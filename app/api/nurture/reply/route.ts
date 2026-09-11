import { NextRequest, NextResponse } from "next/server";

import { recordNurtureDeliveryEvent, recordNurtureReplyEvent } from "@/lib/nurture";
import { resolveNurtureConfig } from "@/lib/nurture-config";

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(value: unknown) {
  if (Array.isArray(value)) return text(value[0]);
  return text(value);
}

function timingSafeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

async function hmacBase64(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(secret), (character) => character.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function hasValidOpenPhoneSignature(req: NextRequest, rawBody: string, parsedBody: unknown) {
  const signatureHeader = req.headers.get("openphone-signature") ?? "";
  const fields = signatureHeader.split(";");
  if (fields.length !== 4 || fields[0] !== "hmac" || fields[1] !== "1") return false;
  const timestamp = Number(fields[2]);
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  const config = await resolveNurtureConfig();
  const secret = config?.openPhoneWebhookSecret ?? "";
  if (!secret) return false;
  try {
    const candidates = Array.from(new Set([rawBody, JSON.stringify(parsedBody)]));
    for (const body of candidates) {
      const digest = await hmacBase64(secret, `${fields[2]}.${body}`);
      if (timingSafeEqual(digest, fields[3])) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function hasValidEventToken(req: NextRequest) {
  const token = process.env.NURTURE_EVENT_TOKEN ?? "";
  if (!token) return false;
  const header = req.headers.get("authorization") ?? req.headers.get("x-nurture-token") ?? "";
  return timingSafeEqual(header.replace(/^Bearer\s+/i, "").trim(), token);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: unknown = null;
  try {
    body = JSON.parse(rawBody || "null") as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (!hasValidEventToken(req) && !(await hasValidOpenPhoneSignature(req, rawBody, body))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const root = object(body);
  const eventType = text(root.type);
  if (eventType && eventType !== "message.received" && eventType !== "message.delivered") {
    return NextResponse.json({ ok: true, ignored: true, reason: "not_inbound_message" });
  }
  const message = object(object(root.data).object);
  if (eventType === "message.delivered") {
    try {
      const result = await recordNurtureDeliveryEvent({
        providerMessageId: text(message.id) || text(root.messageId),
        phone: firstText(message.to) || text(root.phone) || text(root.to),
        source: "openphone",
        metadata: { eventId: text(root.id), phoneNumberId: text(message.phoneNumberId) },
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Could not record nurture delivery.",
      }, { status: 400 });
    }
  }
  const phone = text(message.from) || text(root.phone) || text(root.from);
  const replyText = text(message.text) || text(root.text) || text(root.message);
  try {
    const result = await recordNurtureReplyEvent({
      phone,
      text: replyText,
      providerMessageId: text(message.id) || text(root.messageId),
      source: message.id ? "openphone" : text(root.source) || "reply-webhook",
      metadata: { eventId: text(root.id), phoneNumberId: text(message.phoneNumberId) },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not record nurture reply.",
    }, { status: 400 });
  }
}
