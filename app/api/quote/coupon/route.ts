import { NextRequest, NextResponse } from "next/server";

import * as quoteTool from "@/lib/quote-tool";

type CouponResult = { ok: boolean; [key: string]: unknown };
type CouponValidator = (input: Record<string, unknown>) => Promise<CouponResult>;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const validateQuoteCoupon = (quoteTool as { validateQuoteCoupon?: CouponValidator }).validateQuoteCoupon;
    if (!validateQuoteCoupon) {
      return NextResponse.json({ ok: false, error: "Coupons are not enabled for this site." }, { status: 501 });
    }
    const result = await validateQuoteCoupon(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 502 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Coupon validation failed."; }
