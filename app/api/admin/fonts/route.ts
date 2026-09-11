import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import {
  deleteCloudinaryFont,
  hasCloudinaryConfig,
  listCloudinaryFonts,
  normalizeFontMetadata,
  updateCloudinaryFont,
  uploadFontToCloudinary,
  validateFontFile,
} from "@/lib/cloudinary";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: true, configured: false, assets: [] });
  }

  try {
    return NextResponse.json({ ok: true, configured: true, assets: await listCloudinaryFonts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load uploaded fonts.";
    return NextResponse.json({ ok: false, configured: true, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: false, error: "Cloudinary is not configured." }, { status: 400 });
  }
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 9 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Font uploads must be 8 MB or smaller." }, { status: 413 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const familyValue = typeof formData?.get("family") === "string" ? String(formData.get("family")) : "";
  const rightsConfirmed = formData?.get("rightsConfirmed") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Font file is required." }, { status: 400 });
  }
  if (!rightsConfirmed) {
    return NextResponse.json({ ok: false, error: "Confirm that you have permission to use this font." }, { status: 400 });
  }

  try {
    const metadata = normalizeFontMetadata({
      family: familyValue,
      weight: Number(formData?.get("weight") ?? 400),
      style: formData?.get("style") === "italic" ? "italic" : "normal",
      licenseName: String(formData?.get("licenseName") ?? ""),
      licenseUrl: String(formData?.get("licenseUrl") ?? ""),
      rightsConfirmedAt: new Date().toISOString(),
    });
    await validateFontFile(file);
    const asset = await uploadFontToCloudinary(file, metadata);
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload this font.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: false, error: "Cloudinary is not configured." }, { status: 400 });
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const publicId = typeof body?.publicId === "string" ? body.publicId.trim() : "";
  if (!publicId) return NextResponse.json({ ok: false, error: "Font public ID is required." }, { status: 400 });

  try {
    const existing = (await listCloudinaryFonts()).find((asset) => asset.publicId === publicId);
    if (!existing) return NextResponse.json({ ok: false, error: "Font not found." }, { status: 404 });
    const metadata = normalizeFontMetadata({
      family: typeof body?.family === "string" ? body.family : existing.family,
      weight: typeof body?.weight === "number" ? body.weight : existing.weight,
      style: body?.style === "italic" ? "italic" : "normal",
      licenseName: typeof body?.licenseName === "string" ? body.licenseName : existing.licenseName,
      licenseUrl: typeof body?.licenseUrl === "string" ? body.licenseUrl : existing.licenseUrl,
      rightsConfirmedAt: existing.rightsConfirmedAt || new Date().toISOString(),
    });
    const updated = await updateCloudinaryFont(publicId, metadata);
    return NextResponse.json({
      ok: true,
      asset: {
        ...existing,
        ...updated,
        assetId: updated.assetId || existing.assetId,
        publicId: updated.publicId || existing.publicId,
        secureUrl: updated.secureUrl || existing.secureUrl,
        fileName: updated.fileName || existing.fileName,
        folder: updated.folder || existing.folder,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update this font.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: false, error: "Cloudinary is not configured." }, { status: 400 });
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const publicId = typeof body?.publicId === "string" ? body.publicId.trim() : "";
  if (!publicId) return NextResponse.json({ ok: false, error: "Font public ID is required." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await deleteCloudinaryFont(publicId)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete this font.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
