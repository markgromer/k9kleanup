"use client";

import { default as styles } from "../AdminPortal.module.css";
import { QuoteBuilderTab, QuoteRequirementKey, QuoteSettings, SweepAndGoAccess } from "./model";
import { quoteConversionDefaults, quoteDesignDefaults, quoteDisplayDefaults, quoteFlowDefaults, quoteRequiredDefaults } from "./shell";
import { ApiRequest, Field, NumberField, Toggle, WorkspaceProps } from "./ui";
import { useEffect, useState } from "react";

export const quoteTopLevelDefaults = {
  businessName: "",
  currency: "USD",
  experienceName: "Standard residential quote",
  quoteMode: "instant",
  basePrice: 0,
  includedDogs: 1,
  extraDogPrice: 0,
  oneTimePricingMode: "additional-dogs",
  oneTimeStartingPrice: 120,
  oneTimeAdditionalDogPrice: 20,
  oneTimeIncludedMinutes: 60,
  oneTimeAdditionalIntervalMinutes: 15,
  oneTimeAdditionalIntervalPrice: 20,
  oneTimeDisclaimerTemplate: "One-time prices start at {startingPrice} and include the first {includedAmount}. Additional {additionalUnit} will be billed at {additionalPrice} per {additionalInterval}.",
  minimumPrice: 0,
  depositAmount: 0,
  taxRate: 0,
  quoteExpirationDays: 14,
  leadNotificationEmail: "",
  bookingUrl: "",
  serviceAreaMode: "zip",
  serviceRadiusMiles: 25,
  allowedZipCodes: [] as string[],
  frequencies: [
    { id: "once_a_week", label: "Weekly", multiplier: 1, enabled: true },
    { id: "two_times_a_week", label: "Twice weekly", multiplier: 1.8, enabled: true },
    { id: "bi_weekly", label: "Every other week", multiplier: 1.25, enabled: true },
    { id: "one_time", label: "One-time cleanup", multiplier: 2.5, enabled: true },
  ],
} satisfies Partial<QuoteSettings>;

export const quoteCrmDefaults: QuoteSettings["crm"] = {
  provider: "sweep-and-go", leadAction: "create-lead", conversionAction: "create-customer", fallbackProvider: "gohighlevel", syncNurture: true, pricingSource: "crm", serviceDataSource: "crm",
  fieldMap: [
    { quoteField: "firstName", crmField: "first_name", required: true },
    { quoteField: "phone", crmField: "phone", required: true },
    { quoteField: "zipCode", crmField: "zip_code", required: true },
    { quoteField: "numberOfDogs", crmField: "number_of_dogs", required: true },
    { quoteField: "frequency", crmField: "clean_up_frequency", required: true },
    { quoteField: "quoteTotal", crmField: "price_per_cleanup", required: false },
  ],
};

export const quoteFieldOptions = [
  ["firstName", "First name"], ["lastName", "Last name"], ["email", "Email"], ["phone", "Phone"], ["smsConsent", "SMS consent"], ["zipCode", "ZIP code"], ["numberOfDogs", "Number of dogs"], ["frequency", "Frequency"], ["lastCleaned", "Last cleaned"], ["yardSize", "Yard size"], ["address", "Address"],
] as Array<[QuoteRequirementKey, string]>;

export const quoteCrmProviders = [
  ["sweep-and-go", "Sweep & Go"], ["jobber", "Jobber"], ["scoopilot", "Scoopilot"], ["gohighlevel", "GoHighLevel"], ["housecall-pro", "Housecall Pro"], ["quote-tool", "Generic quote tool"], ["none", "No CRM"],
];

export const emptySweepAndGoAccess: SweepAndGoAccess = { required: true, verified: false, configured: false, enabled: false, hasApiToken: false, accountSlug: "", accountName: "", verifiedAt: "", reason: "Enter and verify your Sweep & Go credentials." };

export function QuoteWorkspace(props: WorkspaceProps) {
  const access = { ...emptySweepAndGoAccess, ...((props.payload.access ?? {}) as Partial<SweepAndGoAccess>) };
  if (props.payload.locked === true) return <SweepAndGoGate access={access} request={props.request} onVerified={() => props.reload()} />;
  return <QuoteEditor {...props} />;
}

export function SweepAndGoGate({ access, request, onVerified, onUseAnother }: { access: SweepAndGoAccess; request: ApiRequest; onVerified: (access: SweepAndGoAccess) => void | Promise<void>; onUseAnother?: () => void }) {
  const [setupOpen, setSetupOpen] = useState(false);
  return <section className={styles.panel}>
    <div className={styles.panelHeader}><div><p className={styles.eyebrow}>SWEEP &amp; GO CONNECTION REQUIRED</p><h2>Verify your account to unlock the quote tool</h2><p className={styles.integrationDescription}>Quote settings remain locked until Reggie verifies that the API token belongs to your Sweep &amp; Go account slug.</p></div></div>
    {access.reason ? <p className={styles.warning}>{access.reason}</p> : null}
    <div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => setSetupOpen(true)}>Setup Sweep &amp; Go</button>{onUseAnother ? <button type="button" className={styles.secondaryButton} onClick={onUseAnother}>Use another provider</button> : null}</div>
    {setupOpen ? <SweepAndGoSetupModal access={access} request={request} onClose={() => setSetupOpen(false)} onVerified={async (verified) => { await onVerified(verified); setSetupOpen(false); }} /> : null}
  </section>;
}

export function SweepAndGoSetupModal({ access, request, onClose, onVerified }: { access: SweepAndGoAccess; request: ApiRequest; onClose: () => void; onVerified: (access: SweepAndGoAccess) => void | Promise<void> }) {
  const [accountSlug, setAccountSlug] = useState(access.accountSlug);
  const [apiToken, setApiToken] = useState("");
  const [checking, setChecking] = useState(false);
  const [gateError, setGateError] = useState("");
  async function verify() {
    setChecking(true); setGateError("");
    try {
      const response = await request("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "sweep-and-go", values: { orgSlug: accountSlug, apiToken } }) });
      await onVerified({ ...access, ...((response.access ?? {}) as Partial<SweepAndGoAccess>), verified: true });
    } catch (reason) { setGateError(reason instanceof Error ? reason.message : "Sweep & Go could not verify these credentials."); }
    finally { setChecking(false); }
  }
  return <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !checking) onClose(); }}>
    <section className={styles.settingsModal} role="dialog" aria-modal="true" aria-labelledby="sweep-and-go-settings-title">
      <div className={styles.panelHeader}><div><p className={styles.eyebrow}>SWEEP &amp; GO SETTINGS</p><h2 id="sweep-and-go-settings-title">Connect your account</h2><p className={styles.integrationDescription}>Enter the account slug and API token from Sweep &amp; Go. Reggie verifies both values before enabling the quote tool.</p></div><button type="button" className={styles.textButton} onClick={onClose} disabled={checking} aria-label="Close Sweep & Go settings">Close</button></div>
      <div className={styles.stack}>
      <div className={styles.formGrid}>
        <Field label="Account slug"><input value={accountSlug} onChange={(event) => setAccountSlug(event.target.value)} placeholder="your-business-abc12" autoComplete="off" required /></Field>
        <Field label="API token"><input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder={access.hasApiToken ? "Saved token — leave blank to verify it" : "Paste your Sweep & Go API token"} autoComplete="off" required={!access.hasApiToken} /></Field>
      </div>
      {gateError ? <p className={styles.error}>{gateError}</p> : null}
      <div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => void verify()} disabled={checking || !accountSlug.trim() || (!apiToken.trim() && !access.hasApiToken)}>{checking ? "Verifying..." : "Verify and save"}</button><button type="button" className={styles.secondaryButton} onClick={onClose} disabled={checking}>Cancel</button></div>
      </div>
    </section>
  </div>;
}

export function QuoteEditor({ payload, request, reload, run }: WorkspaceProps) {
  const [settings, setSettings] = useState<QuoteSettings>(() => ({
    ...quoteTopLevelDefaults,
    requiredFields: quoteRequiredDefaults,
    quoteFlow: quoteFlowDefaults,
    quoteDisplay: quoteDisplayDefaults,
    design: quoteDesignDefaults,
    conversionFlow: quoteConversionDefaults,
    crm: quoteCrmDefaults,
    ...((payload.settings ?? {}) as Partial<QuoteSettings>),
  } as QuoteSettings));
  const [tab, setTab] = useState<QuoteBuilderTab>("intake");
  const [sweepAndGoSettingsOpen, setSweepAndGoSettingsOpen] = useState(false);
  const [sweepAndGoAccess, setSweepAndGoAccess] = useState<SweepAndGoAccess>(() => ({ ...emptySweepAndGoAccess, ...((payload.access ?? {}) as Partial<SweepAndGoAccess>) }));
  useEffect(() => {
    if (payload.settings) setSettings({ ...quoteTopLevelDefaults, requiredFields: quoteRequiredDefaults, quoteFlow: quoteFlowDefaults, quoteDisplay: quoteDisplayDefaults, design: quoteDesignDefaults, conversionFlow: quoteConversionDefaults, crm: quoteCrmDefaults, ...(payload.settings as Partial<QuoteSettings>) } as QuoteSettings);
    setSweepAndGoAccess({ ...emptySweepAndGoAccess, ...((payload.access ?? {}) as Partial<SweepAndGoAccess>) });
  }, [payload.access, payload.settings]);
  const requiredFields = { ...quoteRequiredDefaults, ...(settings.requiredFields ?? {}) };
  const quoteFlow = { ...quoteFlowDefaults, ...(settings.quoteFlow ?? {}) };
  const quoteDisplay = { ...quoteDisplayDefaults, ...(settings.quoteDisplay ?? {}) };
  const design = { ...quoteDesignDefaults, ...(settings.design ?? {}) };
  const conversionFlow = { ...quoteConversionDefaults, ...(settings.conversionFlow ?? {}) };
  const crm = { ...quoteCrmDefaults, ...(settings.crm ?? {}), fieldMap: settings.crm?.fieldMap ?? quoteCrmDefaults.fieldMap };
  const quoteTabs: Array<[QuoteBuilderTab, string]> = [["intake", "Intake"], ["flow", "Flow"], ["design", "Design"], ["display", "Display"], ["conversion", "Conversion"], ["crm", "CRM"], ["pricing", "Pricing"]];
  const set = (key: keyof QuoteSettings, value: QuoteSettings[keyof QuoteSettings]) => setSettings((current) => ({ ...current, [key]: value }));
  const setRequired = (key: QuoteRequirementKey, value: boolean) => setSettings((current) => ({ ...current, requiredFields: { ...quoteRequiredDefaults, ...(current.requiredFields ?? {}), [key]: value } }));
  const setFlow = (key: keyof QuoteSettings["quoteFlow"], value: QuoteSettings["quoteFlow"][keyof QuoteSettings["quoteFlow"]]) => setSettings((current) => ({ ...current, quoteFlow: { ...quoteFlowDefaults, ...(current.quoteFlow ?? {}), [key]: value } }));
  const setDisplay = (key: keyof QuoteSettings["quoteDisplay"], value: QuoteSettings["quoteDisplay"][keyof QuoteSettings["quoteDisplay"]]) => setSettings((current) => ({ ...current, quoteDisplay: { ...quoteDisplayDefaults, ...(current.quoteDisplay ?? {}), [key]: value } }));
  const setDesign = (key: keyof QuoteSettings["design"], value: QuoteSettings["design"][keyof QuoteSettings["design"]]) => setSettings((current) => ({ ...current, design: { ...quoteDesignDefaults, ...(current.design ?? {}), [key]: value } }));
  const setConversion = (key: keyof QuoteSettings["conversionFlow"], value: QuoteSettings["conversionFlow"][keyof QuoteSettings["conversionFlow"]]) => setSettings((current) => ({ ...current, conversionFlow: { ...quoteConversionDefaults, ...(current.conversionFlow ?? {}), [key]: value } }));
  const setCrm = (key: keyof QuoteSettings["crm"], value: QuoteSettings["crm"][keyof QuoteSettings["crm"]]) => setSettings((current) => ({ ...current, crm: { ...quoteCrmDefaults, ...(current.crm ?? {}), [key]: value } }));
  const updateFieldMap = (index: number, patch: Partial<QuoteSettings["crm"]["fieldMap"][number]>) => setSettings((current) => {
    const currentCrm = { ...quoteCrmDefaults, ...(current.crm ?? {}) };
    return { ...current, crm: { ...currentCrm, fieldMap: (currentCrm.fieldMap ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } };
  });
  const addFieldMap = () => setCrm("fieldMap", [...(crm.fieldMap ?? []), { quoteField: "custom", crmField: "", required: false }]);
  const removeFieldMap = (index: number) => setCrm("fieldMap", (crm.fieldMap ?? []).filter((_, itemIndex) => itemIndex !== index));
  const updateFrequency = (id: string, patch: Partial<QuoteSettings["frequencies"][number]>) => setSettings((current) => ({ ...current, frequencies: (current.frequencies ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const saveSettings = { ...settings, requiredFields, quoteFlow, quoteDisplay, design, conversionFlow, crm };

  if (crm.provider === "sweep-and-go" && !sweepAndGoAccess.verified) {
    return <SweepAndGoGate access={sweepAndGoAccess} request={request} onVerified={setSweepAndGoAccess} onUseAnother={() => setCrm("provider", "none")} />;
  }

  return <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); void run(async () => {
    await request("/api/admin/quote-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saveSettings) }); await reload();
  }, "Quote tool saved."); }}>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Experience</h2><p className={styles.integrationDescription}>Control what leads must provide, when pricing appears, and where the booked customer lands.</p></div>{crm.provider === "sweep-and-go" ? <button type="button" className={styles.secondaryButton} onClick={() => setSweepAndGoSettingsOpen(true)}>Sweep &amp; Go settings</button> : null}</div>
      <div className={styles.formGrid}>
        <Field label="Experience name"><input value={settings.experienceName ?? ""} onChange={(event) => set("experienceName", event.target.value)} /></Field>
        <Field label="Quote mode"><select value={settings.quoteMode ?? "instant"} onChange={(event) => set("quoteMode", event.target.value)}><option value="instant">Instant quote</option><option value="hybrid">Instant with review option</option><option value="request">Request quote only</option></select></Field>
      </div>
      <div className={styles.quoteTabs}>{quoteTabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? styles.quoteTabActive : styles.quoteTab} onClick={() => setTab(id)}>{label}</button>)}</div>
    </section>

    {sweepAndGoSettingsOpen ? <SweepAndGoSetupModal access={sweepAndGoAccess} request={request} onClose={() => setSweepAndGoSettingsOpen(false)} onVerified={async (verified) => { setSweepAndGoAccess(verified); setSweepAndGoSettingsOpen(false); await reload(); }} /> : null}

    {tab === "intake" ? <section className={styles.panel}><div className={styles.panelHeader}><h2>Required fields</h2><span>{Object.values(requiredFields).filter(Boolean).length} required</span></div><div className={styles.optionGrid}>
      {quoteFieldOptions.map(([key, label]) => <label key={key} className={styles.optionCard} aria-label={`Required quote field: ${label}`}><input type="checkbox" checked={Boolean(requiredFields[key])} onChange={(event) => setRequired(key, event.target.checked)} /><span><strong>{label}</strong><small>{key === "smsConsent" ? "Needed for A2P-safe quote follow-up." : "Gate this before showing the quote."}</small></span></label>)}
    </div></section> : null}

    {tab === "flow" ? <section className={styles.panel}><div className={styles.panelHeader}><h2>Quote flow</h2></div><div className={styles.formGrid}>
      <Field label="First step"><select value={quoteFlow.entryStep} onChange={(event) => setFlow("entryStep", event.target.value)}><option value="zip">ZIP check</option><option value="address">Address first</option><option value="contact">Contact details</option><option value="service">Service details</option></select></Field>
      <Field label="Intro button"><input value={quoteFlow.introButtonText} onChange={(event) => setFlow("introButtonText", event.target.value)} /></Field>
      <Field label="Intro placeholder"><input value={quoteFlow.introPlaceholder} onChange={(event) => setFlow("introPlaceholder", event.target.value)} /></Field>
      <Field label="Loader message"><input value={quoteFlow.loaderMessage} onChange={(event) => setFlow("loaderMessage", event.target.value)} /></Field>
      <NumberField label="Minimum loader ms" value={quoteFlow.loaderMinTime} onChange={(value) => setFlow("loaderMinTime", value)} />
      <Toggle label="Gate price behind contact" checked={quoteFlow.gateQuoteBehindContact} onChange={(value) => setFlow("gateQuoteBehindContact", value)} />
      <Toggle label="Require service area before price" checked={quoteFlow.requireServiceAreaBeforePrice} onChange={(value) => setFlow("requireServiceAreaBeforePrice", value)} />
      <Toggle label="Show price before address" checked={quoteFlow.showPriceBeforeAddress} onChange={(value) => setFlow("showPriceBeforeAddress", value)} />
      <Toggle label="Allow coupon" checked={quoteFlow.allowCoupon} onChange={(value) => setFlow("allowCoupon", value)} />
      <Toggle label="Allow add-ons" checked={quoteFlow.allowAddons} onChange={(value) => setFlow("allowAddons", value)} />
      <Toggle label="Allow questions" checked={quoteFlow.allowQuestions} onChange={(value) => setFlow("allowQuestions", value)} />
      <Toggle label="Enable yard map" checked={quoteFlow.enableYardMap} onChange={(value) => setFlow("enableYardMap", value)} />
      <Toggle label="Show progress" checked={quoteFlow.showProgress} onChange={(value) => setFlow("showProgress", value)} />
    </div></section> : null}

    {tab === "design" ? <section className={styles.panel}><div className={styles.panelHeader}><h2>Design</h2></div><div className={styles.formGrid}>
      <Field label="Font family"><input value={design.fontFamily} onChange={(event) => setDesign("fontFamily", event.target.value)} /></Field>
      <Field label="Heading font"><input value={design.headingFontFamily} onChange={(event) => setDesign("headingFontFamily", event.target.value)} /></Field>
      <NumberField label="Base font size" value={design.baseFontSize} onChange={(value) => setDesign("baseFontSize", value)} />
      <NumberField label="Max width" value={design.maxWidth} onChange={(value) => setDesign("maxWidth", value)} />
      <Field label="Panel background"><input type="color" value={design.panelBg} onChange={(event) => setDesign("panelBg", event.target.value)} /></Field>
      <Field label="Text color"><input type="color" value={design.textColor} onChange={(event) => setDesign("textColor", event.target.value)} /></Field>
      <Field label="Muted color"><input type="color" value={design.mutedColor} onChange={(event) => setDesign("mutedColor", event.target.value)} /></Field>
      <Field label="Accent color"><input type="color" value={design.accentColor} onChange={(event) => setDesign("accentColor", event.target.value)} /></Field>
      <Field label="CTA background"><input type="color" value={design.ctaBg} onChange={(event) => setDesign("ctaBg", event.target.value)} /></Field>
      <Field label="CTA text"><input type="color" value={design.ctaText} onChange={(event) => setDesign("ctaText", event.target.value)} /></Field>
      <Field label="Input background"><input type="color" value={design.inputBg} onChange={(event) => setDesign("inputBg", event.target.value)} /></Field>
      <Field label="Input border"><input type="color" value={design.inputBorder} onChange={(event) => setDesign("inputBorder", event.target.value)} /></Field>
      <Field label="Quote background"><input type="color" value={design.quoteBg} onChange={(event) => setDesign("quoteBg", event.target.value)} /></Field>
      <Field label="Card border"><input type="color" value={design.cardBorder} onChange={(event) => setDesign("cardBorder", event.target.value)} /></Field>
      <Field label="Price color"><input type="color" value={design.priceColor} onChange={(event) => setDesign("priceColor", event.target.value)} /></Field>
      <NumberField label="Card radius" value={design.cardRadius} onChange={(value) => setDesign("cardRadius", value)} />
      <NumberField label="Input radius" value={design.inputRadius} onChange={(value) => setDesign("inputRadius", value)} />
      <NumberField label="Button radius" value={design.buttonRadius} onChange={(value) => setDesign("buttonRadius", value)} />
      <Field label="Card shadow"><select value={design.cardShadow} onChange={(event) => setDesign("cardShadow", event.target.value)}><option value="none">None</option><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></Field>
    </div><Field label="Custom CSS"><textarea value={design.customCss} onChange={(event) => setDesign("customCss", event.target.value)} spellCheck={false} /></Field></section> : null}

    {tab === "display" ? <section className={styles.panel}><div className={styles.panelHeader}><h2>Quote display</h2></div><div className={styles.formGrid}>
      <Field label="Display style"><select value={quoteDisplay.style} onChange={(event) => setDisplay("style", event.target.value)}><option value="price-card">Single price card</option><option value="plan-comparison">Plan comparison</option><option value="estimate-range">Estimate range</option></select></Field>
      <Field label="Primary CTA"><input value={quoteDisplay.primaryCta} onChange={(event) => setDisplay("primaryCta", event.target.value)} /></Field>
      <Field label="Secondary CTA"><input value={quoteDisplay.secondaryCta} onChange={(event) => setDisplay("secondaryCta", event.target.value)} /></Field>
      <NumberField label="Quote expires in days" value={settings.quoteExpirationDays} onChange={(value) => set("quoteExpirationDays", value)} />
      <Toggle label="Show per-visit price" checked={quoteDisplay.showPerVisitPrice} onChange={(value) => setDisplay("showPerVisitPrice", value)} />
      <Toggle label="Show monthly price" checked={quoteDisplay.showMonthlyPrice} onChange={(value) => setDisplay("showMonthlyPrice", value)} />
      <Toggle label="Show savings message" checked={quoteDisplay.showSavingsMessage} onChange={(value) => setDisplay("showSavingsMessage", value)} />
      <Toggle label="Show quote expiration" checked={quoteDisplay.showQuoteExpiration} onChange={(value) => setDisplay("showQuoteExpiration", value)} />
    </div><Field label="Quote disclaimer"><textarea value={quoteDisplay.disclaimer} onChange={(event) => setDisplay("disclaimer", event.target.value)} /></Field></section> : null}

    {tab === "conversion" ? <section className={styles.panel}><div className={styles.panelHeader}><h2>Conversion</h2></div><div className={styles.formGrid}>
      <Field label="Conversion mode"><select value={conversionFlow.mode} onChange={(event) => setConversion("mode", event.target.value)}><option value="crm-handoff">CRM handoff</option><option value="booking-link">Booking link</option><option value="deposit">Collect deposit</option><option value="request-callback">Request callback</option></select></Field>
      <Field label="Booking URL"><input type="url" value={settings.bookingUrl ?? ""} onChange={(event) => set("bookingUrl", event.target.value)} /></Field>
      <Field label="Redirect URL"><input type="url" value={conversionFlow.redirectUrl} onChange={(event) => setConversion("redirectUrl", event.target.value)} /></Field>
      <NumberField label="Deposit" value={settings.depositAmount} onChange={(value) => set("depositAmount", value)} />
      <Toggle label="Require deposit" checked={conversionFlow.requireDeposit} onChange={(value) => setConversion("requireDeposit", value)} />
      <Toggle label="Collect address" checked={conversionFlow.collectAddress} onChange={(value) => setConversion("collectAddress", value)} />
      <Toggle label="Collect yard map" checked={conversionFlow.collectYardMap} onChange={(value) => setConversion("collectYardMap", value)} />
      <Field label="Lead notification email"><input type="email" value={settings.leadNotificationEmail ?? ""} onChange={(event) => set("leadNotificationEmail", event.target.value)} /></Field>
    </div><Field label="Success message"><textarea value={conversionFlow.successMessage} onChange={(event) => setConversion("successMessage", event.target.value)} /></Field></section> : null}

    {tab === "crm" ? <section className={styles.panel}><div className={styles.panelHeader}><h2>CRM routing</h2><button type="button" className={styles.secondaryButton} onClick={addFieldMap}>Add field</button></div><div className={styles.formGrid}>
      <Field label="Primary CRM"><select value={crm.provider} onChange={(event) => setCrm("provider", event.target.value)}>{quoteCrmProviders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Fallback CRM"><select value={crm.fallbackProvider} onChange={(event) => setCrm("fallbackProvider", event.target.value)}><option value="">No fallback</option>{quoteCrmProviders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Pricing source"><select value={crm.pricingSource} onChange={(event) => setCrm("pricingSource", event.target.value)}><option value="crm">Live CRM/provider</option><option value="matrix">Local pricing matrix</option><option value="local">Local formula</option></select></Field>
      <Field label="Service data source"><select value={crm.serviceDataSource} onChange={(event) => setCrm("serviceDataSource", event.target.value)}><option value="crm">Live CRM/provider</option><option value="local">Local settings</option></select></Field>
      <Field label="Lead action"><select value={crm.leadAction} onChange={(event) => setCrm("leadAction", event.target.value)}><option value="create-lead">Create lead</option><option value="create-opportunity">Create opportunity</option><option value="webhook-only">Webhook only</option><option value="none">None</option></select></Field>
      <Field label="Conversion action"><select value={crm.conversionAction} onChange={(event) => setCrm("conversionAction", event.target.value)}><option value="create-customer">Create customer</option><option value="create-job">Create job</option><option value="create-booking">Create booking</option><option value="webhook-only">Webhook only</option><option value="none">None</option></select></Field>
      <Toggle label="Sync quote nurture status" checked={crm.syncNurture !== false} onChange={(value) => setCrm("syncNurture", value)} />
    </div><div className={styles.fieldMapList}>{(crm.fieldMap ?? []).map((row, index) => <div className={styles.fieldMapRow} key={`${row.quoteField}-${index}`}>
      <Field label="Quote field"><input value={row.quoteField} onChange={(event) => updateFieldMap(index, { quoteField: event.target.value })} /></Field>
      <Field label="CRM field"><input value={row.crmField} onChange={(event) => updateFieldMap(index, { crmField: event.target.value })} /></Field>
      <label className={styles.toggle}><input type="checkbox" checked={row.required} onChange={(event) => updateFieldMap(index, { required: event.target.checked })} /><span>Required</span></label>
      <button type="button" className={styles.textButton} onClick={() => removeFieldMap(index)}>Remove</button>
    </div>)}</div></section> : null}

    {tab === "pricing" ? <>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Pricing</h2></div><div className={styles.formGrid}>
        <Field label="Business name"><input value={settings.businessName ?? ""} onChange={(event) => set("businessName", event.target.value)} /></Field>
        <Field label="Currency"><select value={settings.currency ?? "USD"} onChange={(event) => set("currency", event.target.value)}><option>USD</option><option>CAD</option></select></Field>
        <NumberField label="Base price" value={settings.basePrice} onChange={(value) => set("basePrice", value)} />
        <NumberField label="Dogs included" value={settings.includedDogs} onChange={(value) => set("includedDogs", value)} />
        <NumberField label="Additional dog" value={settings.extraDogPrice} onChange={(value) => set("extraDogPrice", value)} />
        <NumberField label="Minimum price" value={settings.minimumPrice} onChange={(value) => set("minimumPrice", value)} />
        <NumberField label="Tax rate %" value={settings.taxRate} onChange={(value) => set("taxRate", value)} />
      </div></section>
      <section className={`${styles.panel} ${styles.pricingFocusPanel}`}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>SWEEP &amp; GO FALLBACK</p><h2>One-time cleanup pricing</h2><p className={styles.integrationDescription}>Used when Sweep &amp; Go lists one-time cleanup as an option but does not return a one-time price.</p></div></div><div className={styles.formGrid}>
        <Field label="Billing structure"><select value={settings.oneTimePricingMode ?? "additional-dogs"} onChange={(event) => set("oneTimePricingMode", event.target.value)}><option value="additional-dogs">Starting price + additional dogs</option><option value="time-blocks">Starting price + additional time</option></select></Field>
        <NumberField label="Starting one-time price" value={settings.oneTimeStartingPrice} onChange={(value) => set("oneTimeStartingPrice", value)} />
        {(settings.oneTimePricingMode ?? "additional-dogs") === "additional-dogs" ? <NumberField label="Each additional dog" value={settings.oneTimeAdditionalDogPrice} onChange={(value) => set("oneTimeAdditionalDogPrice", value)} /> : null}
        {(settings.oneTimePricingMode ?? "additional-dogs") === "time-blocks" ? <>
          <NumberField label="Included minutes" value={settings.oneTimeIncludedMinutes} onChange={(value) => set("oneTimeIncludedMinutes", value)} />
          <NumberField label="Additional interval minutes" value={settings.oneTimeAdditionalIntervalMinutes} onChange={(value) => set("oneTimeAdditionalIntervalMinutes", value)} />
          <NumberField label="Price per additional interval" value={settings.oneTimeAdditionalIntervalPrice} onChange={(value) => set("oneTimeAdditionalIntervalPrice", value)} />
        </> : null}
      </div><Field label="Price disclaimer"><textarea value={settings.oneTimeDisclaimerTemplate ?? quoteTopLevelDefaults.oneTimeDisclaimerTemplate} onChange={(event) => set("oneTimeDisclaimerTemplate", event.target.value)} /></Field></section>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Coverage</h2></div><div className={styles.formGrid}>
        <Field label="Service area"><select value={settings.serviceAreaMode ?? "zip"} onChange={(event) => set("serviceAreaMode", event.target.value)}><option value="zip">ZIP code list</option><option value="radius">Radius</option><option value="open">Open</option></select></Field>
        <Field label="Allowed ZIP codes"><input value={(settings.allowedZipCodes ?? []).join(", ")} onChange={(event) => set("allowedZipCodes", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></Field>
        <NumberField label="Service radius miles" value={settings.serviceRadiusMiles} onChange={(value) => set("serviceRadiusMiles", value)} />
      </div></section>
      <section className={styles.panel}><div className={styles.panelHeader}><h2>Service frequencies</h2></div><div className={styles.frequencyList}>
        {(settings.frequencies ?? []).map((frequency) => <div key={frequency.id}><label className={styles.toggle}><input type="checkbox" checked={frequency.enabled} onChange={(event) => updateFrequency(frequency.id, { enabled: event.target.checked })} /><span>{frequency.label}</span></label><input aria-label={`${frequency.label} label`} value={frequency.label} onChange={(event) => updateFrequency(frequency.id, { label: event.target.value })} /><input aria-label={`${frequency.label} multiplier`} type="number" min="0" max="100" step="0.05" value={frequency.multiplier} onChange={(event) => updateFrequency(frequency.id, { multiplier: Number(event.target.value) })} /></div>)}
      </div></section>
    </> : null}
    <div className={styles.actions}><button className={styles.primaryButton}>Save quote tool</button></div>
  </form>;
}
