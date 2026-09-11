import { NextRequest, NextResponse } from "next/server";

import * as quoteTool from "@/lib/quote-tool";

type PaymentLookup = (signupId: unknown) => Promise<unknown>;

export async function GET(req: NextRequest) {
  try {
    const signupId = req.nextUrl.searchParams.get("signupId") ?? req.nextUrl.searchParams.get("paymentSignupId") ?? "";
    if (!signupId) return NextResponse.json({ ok: false, error: "Missing signupId." }, { status: 400 });
    const getSweepAndGoQuotePayment = (quoteTool as { getSweepAndGoQuotePayment?: PaymentLookup }).getSweepAndGoQuotePayment;
    if (!getSweepAndGoQuotePayment) {
      return NextResponse.json({ ok: false, error: "Payment status is not enabled for this site." }, { status: 501 });
    }
    const payment = await getSweepAndGoQuotePayment(signupId);
    if (!payment) return NextResponse.json({ ok: false, error: "Signup not found." }, { status: 404 });
    return NextResponse.json({ ok: true, payment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 503 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Payment status is not available."; }
