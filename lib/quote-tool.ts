import { defaultQuoteSettings, getIntegrationConnection, normalizeQuoteSettings, readAdminSetting } from "@/lib/admin-platform";
import { recordNurtureQuoteEvent } from "@/lib/nurture";
import {
  attachSweepAndGoPaymentLink,
  createSweepAndGoPaymentSignup,
  extractSweepAndGoCreditCardLink,
  extractSweepAndGoPaymentIdentifiers,
  getSweepAndGoPaymentSignup,
  updateSweepAndGoPaymentSignup,
} from "@/lib/sweep-and-go-payment";
import { sweepAndGoRequest } from "@/lib/sweep-and-go-client";
import { normalizeLandingAttribution } from "@/lib/landing-attribution";
import { recordLandingJourney } from "@/lib/landing-journeys";

type JsonRecord = Record<string, unknown>;
type IntegrationConnection = Awaited<ReturnType<typeof getIntegrationConnection>>;

const DEFAULT_ONE_TIME_PRICE = 120;
const DEFAULT_ONE_TIME_PRICE_PER_EXTRA_DOG = 20;
const SNG_MONTHLY_VISITS: Record<string, number> = {
  seven_times_a_week: 30.33,
  six_times_a_week: 26,
  five_times_a_week: 21.67,
  four_times_a_week: 17.33,
  three_times_a_week: 13,
  two_times_a_week: 8.67,
  once_a_week: 4.33,
  bi_weekly: 2.17,
  twice_per_month: 2,
  every_three_weeks: 1.45,
  every_four_weeks: 1,
  once_a_month: 1,
  one_time: 1,
};

export async function getQuoteSettings() {
  const stored = await readAdminSetting("quote-tool", defaultQuoteSettings);
  return normalizeQuoteSettings({ ...defaultQuoteSettings, ...stored });
}

export function publicQuoteSettings(settings: Awaited<ReturnType<typeof getQuoteSettings>>) {
  const sweepAndGoPayment = settings.crm.provider === "sweep-and-go";
  return {
    businessName: settings.businessName,
    currency: settings.currency,
    experienceName: settings.experienceName,
    quoteMode: settings.quoteMode,
    requiredFields: settings.requiredFields,
    quoteFlow: settings.quoteFlow,
    quoteDisplay: settings.quoteDisplay,
    conversionFlow: settings.conversionFlow,
    design: settings.design,
    crm: {
      provider: settings.crm.provider,
      pricingSource: settings.crm.pricingSource,
      serviceDataSource: settings.crm.serviceDataSource,
      syncNurture: settings.crm.syncNurture,
    },
    pricing: {
      includedDogs: settings.includedDogs,
      quoteExpirationDays: settings.quoteExpirationDays,
      serviceAreaMode: settings.serviceAreaMode,
      serviceRadiusMiles: settings.serviceRadiusMiles,
      allowedZipCodes: settings.allowedZipCodes,
      oneTimePricingMode: settings.oneTimePricingMode,
      oneTimeStartingPrice: settings.oneTimeStartingPrice,
      oneTimeAdditionalDogPrice: settings.oneTimeAdditionalDogPrice,
      oneTimeIncludedMinutes: settings.oneTimeIncludedMinutes,
      oneTimeAdditionalIntervalMinutes: settings.oneTimeAdditionalIntervalMinutes,
      oneTimeAdditionalIntervalPrice: settings.oneTimeAdditionalIntervalPrice,
      oneTimeDisclaimerTemplate: settings.oneTimeDisclaimerTemplate,
      frequencies: settings.frequencies.filter((item) => item.enabled),
    },
    payment: {
      enabled: sweepAndGoPayment,
      provider: sweepAndGoPayment ? "sweep-and-go" : "",
      statusUrl: sweepAndGoPayment ? "/api/quote/payment" : "",
      webhookUrl: sweepAndGoPayment ? "/api/quote/sweep-and-go-webhook" : "",
      pollIntervalMs: 3000,
      maxPollAttempts: 40,
    },
  };
}

export async function getQuoteOptions(zip: string) {
  const settings = await getQuoteSettings();
  const normalizedZip = normalizeZip(zip);
  const inServiceArea = settings.serviceAreaMode === "open"
    || !normalizedZip
    || settings.serviceAreaMode === "radius"
    || settings.allowedZipCodes.length === 0
    || settings.allowedZipCodes.includes(normalizedZip);
  const local = {
    ok: true,
    zip: normalizedZip,
    inServiceArea,
    serviceAreaMode: settings.serviceAreaMode,
    dogs: defaultDogOptions(settings.includedDogs),
    frequencies: settings.frequencies.filter((item) => item.enabled).map((item) => ({ ...item, value: item.id })),
    lastTimes: [{ value: "one_week", label: "One Week" }],
    crossSells: [] as JsonRecord[],
    requiredFields: settings.requiredFields,
    quoteFlow: settings.quoteFlow,
    payment: publicQuoteSettings(settings).payment,
  };
  if (settings.crm.provider !== "sweep-and-go" || settings.crm.serviceDataSource !== "crm" || normalizedZip.length !== 5) return local;
  const connection = await safeConnection("sweep-and-go");
  if (!connection?.configured || !connection.enabled) return local;
  const live = await sweepAndGoOptions(connection, normalizedZip);
  return { ...local, ...live, requiredFields: settings.requiredFields, quoteFlow: settings.quoteFlow, payment: local.payment };
}

export async function calculateQuote(input: JsonRecord) {
  const settings = await getQuoteSettings();
  const provider = text(settings.crm.provider);
  const pricingSource = text(settings.crm.pricingSource);
  const zip = normalizeZip(input.zipCode ?? input.zip_code ?? input.zip);
  if (settings.quoteFlow.requireServiceAreaBeforePrice && !isZipAllowed(settings, zip)) {
    return { ok: false, error: "outside_service_area", message: "This ZIP code is outside the configured service area.", zip };
  }

  if (provider === "sweep-and-go" && pricingSource === "crm") {
    const connection = await safeConnection(provider);
    if (connection?.configured && connection.enabled) {
      try {
        const live = await sweepAndGoPrice(connection, input);
        if (live.perCleanup !== null || live.monthlyPrice !== null) {
          return { ok: true, provider: "sweep-and-go", ...withOneTimePricing(settings, input, live) };
        }
      } catch (error) {
        const fallback = oneTimeFallbackPrice(settings, input, error);
        if (fallback) return { ok: true, provider: "sweep-and-go", ...fallback };
        if (pricingSource === "crm") throw error;
      }
    }
    return { ok: false, error: "Sweep & Go pricing is not configured or enabled.", provider, zip };
  }

  return { ok: true, provider: pricingSource === "matrix" ? "matrix" : "local", ...localPrice(settings, input) };
}

export async function validateQuoteCoupon(input: JsonRecord) {
  const settings = await getQuoteSettings();
  if (!settings.quoteFlow.allowCoupon) return { ok: false, error: "Coupons are not enabled for this quote tool." };
  const couponId = text(input.couponId ?? input.coupon_id ?? input.code);
  if (!couponId) return { ok: false, error: "Coupon code is required." };
  if (settings.crm.provider !== "sweep-and-go") return { ok: false, error: "Coupon validation is not configured for this provider." };
  const connection = await safeConnection("sweep-and-go");
  if (!connection?.configured || !connection.enabled) return { ok: false, error: "Sweep & Go is not configured." };
  const candidates = Array.from(new Set([couponId, couponId.toUpperCase(), couponId.toLowerCase()]));
  for (const candidate of candidates) {
    const payload = await sngRequest(connection, "/api/v2/client_on_boarding/coupon", {
      ...sngCommonParams(connection),
      coupon_id: candidate,
    }).catch(() => null);
    if (payload?.coupon_id || payload?.coupon) return { ok: true, provider: "sweep-and-go", coupon: payload.coupon ?? payload };
  }
  return { ok: false, error: "Coupon is not valid." };
}

export async function captureQuoteLead(input: JsonRecord) {
  const settings = await getQuoteSettings();
  const quote = await calculateQuote(input);
  if (quote.ok === false) return quote;

  const lead = {
    quoteId: text(input.quoteId) || makeId("quote"),
    firstName: text(input.firstName ?? input.first_name),
    lastName: text(input.lastName ?? input.last_name),
    email: text(input.email),
    phone: text(input.phone),
    smsConsent: input.smsConsent === true || input.sms_consent === true || input.consent === true,
    zipCode: normalizeZip(input.zipCode ?? input.zip_code ?? input.zip),
    address: text(input.address ?? input.street ?? input.home_address),
    city: text(input.city),
    state: text(input.state).toUpperCase(),
    numberOfDogs: Math.max(1, Math.round(number(input.numberOfDogs ?? input.number_of_dogs ?? input.dogs, 1))),
    frequency: frequencySlug(input.frequency ?? input.clean_up_frequency),
    lastCleaned: text(input.lastCleaned ?? input.last_cleaned ?? input.last_time ?? input.last_time_yard_was_thoroughly_cleaned) || "one_week",
    yardSqft: Math.max(0, Math.round(number(input.yardSqft ?? input.yard_sqft ?? input.yardSize, 0))),
    couponId: text(input.couponId ?? input.coupon_id),
    addons: stringList(input.addons ?? input.crossSells ?? input.cross_sells, 30),
    quote,
    attribution: normalizeLandingAttribution(input.attribution),
    metadata: object(input.metadata),
  };

  const crmResult = await sendLeadToCrm(settings, lead).catch((error) => ({ ok: false, error: message(error) }));
  await recordLandingJourney(lead.attribution, "lead", lead.quoteId).catch(() => undefined);
  if (settings.crm.provider === "sweep-and-go" && object(crmResult).delivered === true) {
    await recordLandingJourney(lead.attribution, "signup", lead.quoteId).catch(() => undefined);
  }
  let nurtureResult: JsonRecord = { ok: true, enrolled: false, reason: "disabled_for_quote_tool" };
  if (settings.crm.syncNurture) {
    const quoteTotal = "monthlyPrice" in quote ? quote.monthlyPrice ?? quote.perCleanup ?? "" : "";
    nurtureResult = await recordNurtureQuoteEvent({
      phone: lead.phone,
      entrySource: "quoteDisplayed",
      smsConsent: lead.smsConsent,
      consentSource: "quote-tool",
      consentText: "Quote form SMS consent",
      firstName: lead.firstName,
      lastName: lead.lastName,
      quoteId: lead.quoteId,
      quoteTotal,
      quoteLink: text(input.quoteLink),
      source: "quote-tool",
      metadata: { zipCode: lead.zipCode, frequency: lead.frequency, crmProvider: settings.crm.provider, attribution: lead.attribution },
    }).catch((error) => ({ ok: false, error: message(error) }));
  }

  return {
    ok: true,
    lead,
    quote,
    crm: crmResult,
    payment: object(crmResult).payment ?? null,
    nurture: nurtureResult,
    successMessage: settings.conversionFlow.successMessage,
    redirectUrl: settings.conversionFlow.redirectUrl,
  };
}

async function sendLeadToCrm(settings: Awaited<ReturnType<typeof getQuoteSettings>>, lead: JsonRecord) {
  const provider = text(settings.crm.provider);
  if (!provider || provider === "none") return { ok: true, provider: "none", delivered: false };
  const connection = await safeConnection(provider);
  if (!connection?.configured || !connection.enabled) return { ok: false, provider, delivered: false, error: "Integration is not configured or enabled." };

  if (provider === "sweep-and-go") return sweepAndGoOnboard(connection, lead);
  const webhookUrl = text(connection.values.webhookUrl);
  if (webhookUrl) return postWebhook(webhookUrl, { provider, lead, fieldMap: settings.crm.fieldMap });
  if (provider === "gohighlevel") return goHighLevelLead(connection, settings, lead);
  return { ok: false, provider, delivered: false, error: `${provider} needs a webhook URL for quote lead handoff.` };
}

async function goHighLevelLead(connection: IntegrationConnection, settings: Awaited<ReturnType<typeof getQuoteSettings>>, lead: JsonRecord) {
  const apiKey = text(connection.values.apiKey);
  const locationId = text(connection.values.locationId);
  if (!apiKey || !locationId) return { ok: false, provider: "gohighlevel", delivered: false, error: "GoHighLevel needs Location ID and API key." };
  const attribution = normalizeLandingAttribution(lead.attribution);
  const body = {
    locationId,
    firstName: text(lead.firstName),
    lastName: text(lead.lastName),
    email: text(lead.email),
    phone: text(lead.phone),
    address1: text(lead.address),
    city: text(lead.city),
    state: text(lead.state),
    postalCode: text(lead.zipCode),
    source: attribution ? `Quote Tool: ${attribution.offerId}` : "Quote Tool",
    tags: ["quote-tool", settings.quoteMode, ...(attribution ? [`offer:${attribution.offerId}`] : [])],
    customFields: [
      { key: "number_of_dogs", field_value: String(lead.numberOfDogs ?? "") },
      { key: "clean_up_frequency", field_value: text(lead.frequency) },
    ],
  };
  const response = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  return { ok: response.ok, provider: "gohighlevel", delivered: response.ok, response: payload };
}

async function postWebhook(url: string, body: JsonRecord) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, delivered: response.ok, status: response.status, response: await parseResponse(response) };
}

async function sweepAndGoOptions(connection: IntegrationConnection, zip: string) {
  assertSweepAndGoConnection(connection);
  const payload: JsonRecord = await sngRequest(connection, "/api/v2/client_on_boarding/service_registration_form", {
    ...sngCommonParams(connection),
    zip_code: zip,
  }).catch((): JsonRecord => ({ error: "outside_service_area" }));
  if (payload.error) return { ok: false, inServiceArea: false, waitlist: true, error: "Service is not available for this ZIP code." };
  const fields = Array.isArray(payload.form_fields) ? payload.form_fields.map(object) : [];
  const field = (slug: string) => fields.find((item) => text(item.slug) === slug);
  let dogs = commaList(field("number_of_dogs")?.value).map((item) => Math.round(number(item, 0))).filter((item) => item > 0 && item <= 20);
  if (!dogs.length && Array.isArray(payload.number_of_dogs_options)) dogs = payload.number_of_dogs_options.map((item) => Math.round(number(item, 0))).filter((item) => item > 0 && item <= 20);
  if (!dogs.length) dogs = [1, 2, 3, 4, 5];

  let frequencies = commaList(field("clean_up_frequency")?.value).map(frequencySlug).filter(Boolean);
  if (!frequencies.length && Array.isArray(payload.clean_up_frequency_options)) frequencies = payload.clean_up_frequency_options.map(frequencySlug).filter(Boolean);
  frequencies = Array.from(new Set(frequencies));
  if (!frequencies.length) return { ok: false, inServiceArea: false, waitlist: true, error: "Service is not available for this ZIP code." };

  const lastTimes = commaList(field("last_time_yard_was_thoroughly_cleaned")?.value)
    .map((value) => ({ value: frequencySlug(value), label: frequencyLabel(frequencySlug(value)) }));
  if (!lastTimes.length) lastTimes.push({ value: "one_week", label: "One Week" });

  const validation: JsonRecord = await sngRequest(connection, "/api/v2/client_on_boarding/price_registration_form", {
    ...sngCommonParams(connection, true),
    zip_code: zip,
    number_of_dogs: dogs[0] ?? 1,
    clean_up_frequency: frequencies[0] ?? "once_a_week",
    last_time_yard_was_thoroughly_cleaned: lastTimes[0]?.value ?? "one_week",
  }).catch((): JsonRecord => ({ error: "outside_service_area" }));
  if (validation.error || !validation.pricing_zip_code_type) {
    return { ok: false, inServiceArea: false, waitlist: true, error: "Service is not available for this ZIP code." };
  }
  const crossSells = Array.isArray(validation.cross_sells) ? validation.cross_sells.map(object)
    .filter((item) => item.id !== undefined && text(item.name))
    .map((item) => ({
      id: text(item.id),
      name: text(item.name).slice(0, 200),
      description: text(item.description).slice(0, 1000),
      unit: text(item.unit).slice(0, 100),
      unitAmount: optionalNumber(item.unit_amount),
      featured: Boolean(item.featured),
      service: Boolean(item.service),
    })) : [];
  return {
    ok: true,
    provider: "sweep-and-go",
    zip,
    inServiceArea: true,
    dogs,
    frequencies: frequencies.map((value) => ({ id: value, value, label: frequencyLabel(value), multiplier: 1, enabled: true })),
    lastTimes,
    crossSells,
  };
}

async function sweepAndGoPrice(connection: IntegrationConnection, input: JsonRecord) {
  assertSweepAndGoConnection(connection);
  const frequency = frequencySlug(input.frequency ?? input.clean_up_frequency) || "once_a_week";
  const payload = await sngRequest(connection, "/api/v2/client_on_boarding/price_registration_form", {
    ...sngCommonParams(connection, true),
    zip_code: normalizeZip(input.zipCode ?? input.zip_code ?? input.zip),
    number_of_dogs: Math.max(1, Math.round(number(input.numberOfDogs ?? input.number_of_dogs ?? input.dogs, 1))),
    clean_up_frequency: frequency,
    last_time_yard_was_thoroughly_cleaned: text(input.lastCleaned ?? input.last_cleaned ?? input.last_time ?? input.last_time_yard_was_thoroughly_cleaned) || "one_week",
  });
  if (payload.error || !payload.pricing_zip_code_type) throw new Error("Sweep & Go does not offer service for this quote selection.");
  const price = extractSweepAndGoPrice(payload, frequency);
  const visits = SNG_MONTHLY_VISITS[frequency] ?? 0;
  const perCleanup = price.perCleanup ?? (price.monthlyPrice !== null && visits > 0 ? roundMoney(price.monthlyPrice / visits) : null);
  return {
    perCleanup,
    monthlyPrice: price.monthlyPrice,
    frequency,
    frequencySlug: frequency,
    source: "sweepandgo",
    zipType: text(payload.pricing_zip_code_type).toLowerCase(),
    price: { price_per_cleanup: perCleanup, monthly_price: price.monthlyPrice },
    rawProviderResponse: payload,
  };
}

async function sweepAndGoOnboard(connection: IntegrationConnection, lead: JsonRecord) {
  try {
    assertSweepAndGoConnection(connection);
  } catch (error) {
    return { ok: false, provider: "sweep-and-go", delivered: false, error: message(error) };
  }
  const quoteId = text(lead.quoteId) || makeId("quote");
  await createSweepAndGoPaymentSignup({ signupId: quoteId, email: lead.email, phone: lead.phone });
  const phone = phoneDigits(lead.phone);
  const quote = object(lead.quote);
  const attribution = normalizeLandingAttribution(lead.attribution);
  const body = {
    organization: text(connection.values.orgSlug || connection.values.accountId),
    zip_code: text(lead.zipCode),
    number_of_dogs: lead.numberOfDogs,
    clean_up_frequency: text(lead.frequency),
    last_time_yard_was_thoroughly_cleaned: text(lead.lastCleaned) || "one_week",
    initial_cleanup_required: true,
    first_name: text(lead.firstName),
    last_name: text(lead.lastName),
    email: text(lead.email),
    home_address: text(lead.address),
    city: text(lead.city),
    state: text(lead.state),
    phone,
    cell_phone_number: phone,
    home_phone_number: phone,
    cell_phone_number_e164: phone.length === 10 ? `+1${phone}` : undefined,
    home_phone_number_e164: phone.length === 10 ? `+1${phone}` : undefined,
    phone_e164: phone.length === 10 ? `+1${phone}` : undefined,
    price_per_cleanup: optionalNumber(quote.perCleanup),
    cross_sells: stringList(lead.addons, 30),
    coupon_id: text(lead.couponId) || undefined,
    yard_sqft: number(lead.yardSqft, 0) || undefined,
    terms_open_api: lead.smsConsent === true,
    tracking_field: attribution ? `reggie_offer:${attribution.offerId}` : "reggie_quote_tool",
    location_id: text(connection.values.locationId) || undefined,
    organization_form_id: text(connection.values.organizationFormId) || undefined,
  };
  try {
    const response = await sngJson(connection, "/api/v1/residential/onboarding", body);
    const creditCardLink = extractSweepAndGoCreditCardLink(response);
    const paymentIdentifiers = extractSweepAndGoPaymentIdentifiers(response);
    const payment = await updateSweepAndGoPaymentSignup({
      signupId: quoteId,
      creditCardLink,
      clientId: paymentIdentifiers.clientId,
    });
    return { ok: true, provider: "sweep-and-go", delivered: true, response, payment };
  } catch (error) {
    const payment = await updateSweepAndGoPaymentSignup({ signupId: quoteId, status: "onboarding_failed" });
    return { ok: false, provider: "sweep-and-go", delivered: false, error: message(error), payment };
  }
}

export async function getSweepAndGoQuotePayment(signupId: unknown) {
  return getSweepAndGoPaymentSignup(signupId);
}

export async function receiveSweepAndGoPaymentWebhook(payload: unknown, providedSecret: string) {
  const connection = await safeConnection("sweep-and-go");
  if (!connection?.configured || !connection.enabled) return { ok: false, status: 503, error: "Sweep & Go is not configured." };
  const expectedSecret = text(connection.values.webhookSecret);
  if (!expectedSecret) return { ok: false, status: 503, error: "Sweep & Go payment webhook secret is not configured." };
  if (!timingSafeTextEqual(expectedSecret, providedSecret)) return { ok: false, status: 401, error: "Unauthorized webhook." };
  const creditCardLink = extractSweepAndGoCreditCardLink(payload);
  const paymentIdentifiers = extractSweepAndGoPaymentIdentifiers(payload);
  const payment = creditCardLink ? await attachSweepAndGoPaymentLink({ creditCardLink, ...paymentIdentifiers }) : null;
  return {
    ok: true,
    status: 200,
    event: sweepAndGoEvent(payload),
    payment: {
      matched: Boolean(payment),
      signupId: payment?.signupId ?? "",
      status: payment?.status ?? (creditCardLink ? "unmatched_payment_link" : "no_payment_link"),
    },
  };
}

async function sngRequest(connection: IntegrationConnection, path: string, params: Record<string, unknown>) {
  const query = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)]));
  return sweepAndGoRequest<JsonRecord>(connection, path, { query });
}

async function sngJson(connection: IntegrationConnection, path: string, body: JsonRecord) {
  return sweepAndGoRequest<JsonRecord>(connection, path, { method: "PUT", body });
}

function localPrice(settings: Awaited<ReturnType<typeof getQuoteSettings>>, input: JsonRecord) {
  const dogs = Math.max(1, Math.round(number(input.numberOfDogs ?? input.number_of_dogs ?? input.dogs, 1)));
  const frequency = frequencySlug(input.frequency ?? input.clean_up_frequency) || settings.frequencies.find((item) => item.enabled)?.id || "weekly";
  const selected = settings.frequencies.find((item) => item.id === frequency) ?? settings.frequencies.find((item) => item.enabled) ?? settings.frequencies[0];
  const extraDogs = Math.max(0, dogs - Math.max(0, settings.includedDogs));
  const perCleanup = Math.max(settings.minimumPrice, (settings.basePrice + extraDogs * settings.extraDogPrice) * (selected?.multiplier ?? 1));
  const visits = SNG_MONTHLY_VISITS[frequency] ?? (frequency.includes("bi") ? 2.17 : frequency.includes("one") ? 1 : 4.33);
  const monthlyPrice = frequency === "one-time" || frequency === "one_time" ? perCleanup : perCleanup * visits;
  const roundedPerCleanup = roundMoney(perCleanup);
  const roundedMonthlyPrice = roundMoney(monthlyPrice);
  return {
    zip: normalizeZip(input.zipCode ?? input.zip_code ?? input.zip),
    numberOfDogs: dogs,
    frequency,
    frequencySlug: frequency,
    frequencyLabel: selected?.label ?? frequency,
    source: "local",
    perCleanup: roundedPerCleanup,
    monthlyPrice: roundedMonthlyPrice,
    price: { price_per_cleanup: roundedPerCleanup, monthly_price: roundedMonthlyPrice },
  };
}

function oneTimeFallbackPrice(settings: Awaited<ReturnType<typeof getQuoteSettings>>, input: JsonRecord, error: unknown) {
  const frequency = frequencySlug(input.frequency ?? input.clean_up_frequency);
  if (frequency !== "one_time") return null;
  const dogs = Math.max(1, Math.round(number(input.numberOfDogs ?? input.number_of_dogs ?? input.dogs, 1)));
  const configuredOneTime = settings.frequencies.find((item) => frequencySlug(item.id) === "one_time");
  const localBase = settings.oneTimeStartingPrice > 0
    ? settings.oneTimeStartingPrice
    : settings.basePrice > 0
      ? Math.max(settings.minimumPrice, settings.basePrice * (configuredOneTime?.multiplier ?? 1))
      : DEFAULT_ONE_TIME_PRICE;
  const pricingMode = settings.oneTimePricingMode === "time-blocks" ? "time-blocks" : "additional-dogs";
  const estimatedMinutes = Math.max(0, Math.round(number(input.estimatedMinutes ?? input.estimated_minutes ?? input.oneTimeEstimatedMinutes ?? input.one_time_estimated_minutes, 0)));
  const includedMinutes = Math.max(0, Math.round(settings.oneTimeIncludedMinutes ?? 0));
  const intervalMinutes = Math.max(1, Math.round(settings.oneTimeAdditionalIntervalMinutes ?? 1));
  const intervalPrice = settings.oneTimeAdditionalIntervalPrice > 0 ? settings.oneTimeAdditionalIntervalPrice : settings.oneTimeAdditionalDogPrice;
  const extraDogs = Math.max(0, dogs - Math.max(1, settings.includedDogs || 1));
  const extraDogPrice = settings.oneTimeAdditionalDogPrice > 0
    ? settings.oneTimeAdditionalDogPrice
    : settings.extraDogPrice > 0
      ? settings.extraDogPrice
      : DEFAULT_ONE_TIME_PRICE_PER_EXTRA_DOG;
  const overageUnits = pricingMode === "time-blocks" && estimatedMinutes > includedMinutes
    ? Math.ceil((estimatedMinutes - includedMinutes) / intervalMinutes)
    : 0;
  const perCleanup = pricingMode === "time-blocks"
    ? roundMoney(localBase + overageUnits * intervalPrice)
    : roundMoney(localBase + extraDogs * extraDogPrice);
  const oneTimePricing = buildOneTimePricing(settings, input, localBase, {
    additionalDogs: extraDogs,
    additionalDogPrice: extraDogPrice,
    estimatedMinutes,
    includedMinutes,
    intervalMinutes,
    intervalPrice,
    mode: pricingMode,
  });
  return {
    perCleanup,
    monthlyPrice: null,
    frequency,
    frequencySlug: frequency,
    source: "sweepandgo-one-time-fallback",
    zipType: "",
    price: { price_per_cleanup: perCleanup, monthly_price: null },
    oneTimePricing,
    oneTimeDisclaimer: oneTimePricing.disclaimer,
    fallback: {
      reason: "sweepandgo_one_time_price_unavailable",
      message: message(error),
    },
  };
}

function withOneTimePricing(settings: Awaited<ReturnType<typeof getQuoteSettings>>, input: JsonRecord, quote: JsonRecord) {
  const frequency = frequencySlug(quote.frequencySlug ?? quote.frequency ?? input.frequency ?? input.clean_up_frequency);
  if (frequency !== "one_time") return quote;
  const oneTimePricing = buildOneTimePricing(settings, input, settings.oneTimeStartingPrice || DEFAULT_ONE_TIME_PRICE);
  return { ...quote, oneTimePricing, oneTimeDisclaimer: oneTimePricing.disclaimer };
}

function buildOneTimePricing(
  settings: Awaited<ReturnType<typeof getQuoteSettings>>,
  input: JsonRecord,
  startingPrice: number,
  overrides: Partial<{
    mode: string;
    additionalDogs: number;
    additionalDogPrice: number;
    estimatedMinutes: number;
    includedMinutes: number;
    intervalMinutes: number;
    intervalPrice: number;
  }> = {},
) {
  const mode = overrides.mode === "time-blocks" || settings.oneTimePricingMode === "time-blocks" ? "time-blocks" : "additional-dogs";
  const dogs = Math.max(1, Math.round(number(input.numberOfDogs ?? input.number_of_dogs ?? input.dogs, 1)));
  const additionalDogs = overrides.additionalDogs ?? Math.max(0, dogs - Math.max(1, settings.includedDogs || 1));
  const additionalDogPrice = overrides.additionalDogPrice ?? (settings.oneTimeAdditionalDogPrice > 0 ? settings.oneTimeAdditionalDogPrice : DEFAULT_ONE_TIME_PRICE_PER_EXTRA_DOG);
  const estimatedMinutes = overrides.estimatedMinutes ?? Math.max(0, Math.round(number(input.estimatedMinutes ?? input.estimated_minutes ?? input.oneTimeEstimatedMinutes ?? input.one_time_estimated_minutes, 0)));
  const includedMinutes = overrides.includedMinutes ?? Math.max(0, Math.round(settings.oneTimeIncludedMinutes ?? 0));
  const intervalMinutes = overrides.intervalMinutes ?? Math.max(1, Math.round(settings.oneTimeAdditionalIntervalMinutes ?? 1));
  const intervalPrice = overrides.intervalPrice ?? (settings.oneTimeAdditionalIntervalPrice > 0 ? settings.oneTimeAdditionalIntervalPrice : additionalDogPrice);
  const additionalUnit = mode === "time-blocks" ? "time" : "dogs";
  const additionalInterval = mode === "time-blocks" ? `${intervalMinutes} ${intervalMinutes === 1 ? "minute" : "minutes"}` : "additional dog";
  const includedAmount = mode === "time-blocks" ? `${includedMinutes} ${includedMinutes === 1 ? "minute" : "minutes"}` : `${Math.max(1, settings.includedDogs || 1)} ${Math.max(1, settings.includedDogs || 1) === 1 ? "dog" : "dogs"}`;
  const disclaimer = renderOneTimeDisclaimer(settings.oneTimeDisclaimerTemplate, {
    startingPrice: money(startingPrice),
    includedAmount,
    includedMinutes: String(includedMinutes),
    additionalUnit,
    additionalPrice: money(mode === "time-blocks" ? intervalPrice : additionalDogPrice),
    additionalInterval,
  });
  return {
    mode,
    startingPrice,
    includedMinutes,
    additionalIntervalMinutes: intervalMinutes,
    additionalIntervalPrice: intervalPrice,
    estimatedMinutes: estimatedMinutes || null,
    additionalDogs,
    additionalDogPrice,
    disclaimer,
  };
}

function renderOneTimeDisclaimer(template: string, values: Record<string, string>) {
  const fallback = defaultQuoteSettings.oneTimeDisclaimerTemplate;
  return (template || fallback).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => values[key] ?? "");
}

function money(value: number) {
  return `$${roundMoney(value).toFixed(2).replace(/\.00$/, "")}`;
}

function isZipAllowed(settings: Awaited<ReturnType<typeof getQuoteSettings>>, zip: string) {
  return settings.serviceAreaMode === "open" || settings.serviceAreaMode === "radius" || settings.allowedZipCodes.length === 0 || settings.allowedZipCodes.includes(zip);
}

async function safeConnection(provider: string) {
  try { return await getIntegrationConnection(provider); } catch { return null; }
}

async function parseResponse(response: Response) {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body) as JsonRecord; } catch { return { raw: body }; }
}

function sngCommonParams(connection: IntegrationConnection, price = false) {
  return {
    organization: text(price ? connection.values.priceOrgSlug : "") || text(connection.values.orgSlug || connection.values.accountId),
    location_id: text(connection.values.locationId),
    organization_form_id: text(connection.values.organizationFormId),
  };
}

function assertSweepAndGoConnection(connection: IntegrationConnection) {
  if (!text(connection.values.orgSlug || connection.values.accountId) || !text(connection.values.apiToken)) {
    throw new Error("Sweep & Go needs organization slug and API token.");
  }
}

function extractSweepAndGoPrice(payload: JsonRecord, frequency: string) {
  const primaryPrice = object(payload.price);
  const primaryValue = optionalNumber(primaryPrice.value);
  const billingInterval = text(primaryPrice.billing_interval).toLowerCase();
  const prices = object(payload.prices);
  const frequencyPrice = object(prices[frequency]);
  const search = Object.keys(frequencyPrice).length ? frequencyPrice : payload;
  return {
    perCleanup: primaryValue !== null && !/month/.test(billingInterval)
      ? primaryValue
      : findNestedNumber(search, [/^pricepercleanup$/, /^percleanup$/, /^pricepervisit$/, /^priceperservice$/, /^displayprice$/]),
    monthlyPrice: primaryValue !== null && /month/.test(billingInterval)
      ? primaryValue
      : findNestedNumber(search, [/^monthlyprice$/, /^monthlytotal$/, /^monthlyamount$/, /^pricepermonth$/, /^prepaidfixedmonthly$/, /^monthly$/]),
  };
}

function findNestedNumber(value: unknown, patterns: RegExp[], depth = 0): number | null {
  if (depth > 8 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedNumber(item, patterns, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (/cross.?sells?|add.?ons?|up.?sells?|extras?/i.test(key)) continue;
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (patterns.some((pattern) => pattern.test(normalizedKey))) {
      const parsed = optionalNumber(child);
      if (parsed !== null) return parsed;
    }
    const nested = findNestedNumber(child, patterns, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

function defaultDogOptions(includedDogs: number) {
  const length = Math.max(5, Math.min(10, Math.round(includedDogs) || 1));
  return Array.from({ length }, (_, index) => index + 1);
}

function commaList(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function stringList(value: unknown, limit: number) {
  return commaList(value).slice(0, limit).map((item) => item.slice(0, 200));
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function timingSafeTextEqual(expected: string, provided: string) {
  const expectedBytes = new TextEncoder().encode(expected);
  const providedBytes = new TextEncoder().encode(provided);
  const length = Math.max(expectedBytes.length, providedBytes.length);
  let difference = expectedBytes.length ^ providedBytes.length;
  for (let index = 0; index < length; index += 1) difference |= (expectedBytes[index] ?? 0) ^ (providedBytes[index] ?? 0);
  return difference === 0;
}

function sweepAndGoEvent(payload: unknown) {
  const record = object(payload);
  const raw = text(record.event ?? record.event_name ?? record.type ?? record.action) || "webhook_received";
  return `sng_${raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function frequencySlug(value: unknown) {
  const slug = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases: Record<string, string> = {
    weekly: "once_a_week",
    once_weekly: "once_a_week",
    twice_weekly: "two_times_a_week",
    biweekly: "bi_weekly",
    every_other_week: "bi_weekly",
    one_time_cleanup: "one_time",
    one_time_clean: "one_time",
  };
  return aliases[slug] ?? slug;
}
function frequencyLabel(value: string) { return value.split("_").filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "); }
function normalizeZip(value: unknown) { return text(value).replace(/\D/g, "").slice(0, 5); }
function phoneDigits(value: unknown) { const digits = text(value).replace(/\D/g, ""); return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.slice(0, 10); }
function number(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim(); }
function object(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function roundMoney(value: number) { return Math.round(value * 100) / 100; }
function makeId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function message(error: unknown) { return error instanceof Error ? error.message : "Quote tool request failed."; }
