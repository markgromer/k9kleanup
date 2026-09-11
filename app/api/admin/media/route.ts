import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import {
  deleteMediaAsset,
  getAdminPlatformStatus,
  listMediaAssets,
  updateMediaAsset,
  uploadMediaAsset,
} from "@/lib/admin-platform";
import {
  getCloudinaryBaseFolder,
  hasCloudinaryConfig,
  listCloudinaryAssets,
  listCloudinaryFolders,
  updateCloudinaryAsset,
  uploadImageToCloudinary,
} from "@/lib/cloudinary";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const platformStatus = await getAdminPlatformStatus();
  if (platformStatus.database && platformStatus.media) {
    const provider = String(platformStatus.provider) === "filesystem" ? "filesystem" : "r2";
    try {
      return NextResponse.json({
        ok: true,
        configured: true,
        provider,
        assets: await listMediaAssets(),
        storage: platformStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load media.";
      return NextResponse.json({ ok: false, configured: true, provider, error: message }, { status: 500 });
    }
  }

  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: true, configured: false, assets: [], provider: "none", storage: platformStatus });
  }

  try {
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get("folder")?.trim() ?? undefined;
    const [assets, folders] = await Promise.all([
      listCloudinaryAssets(folder),
      listCloudinaryFolders(),
    ]);
    const baseFolder = await getCloudinaryBaseFolder();
    return NextResponse.json({
      ok: true,
      configured: true,
      provider: "cloudinary",
      assets,
      folders,
      currentFolder: folder ?? baseFolder,
      baseFolder,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load media.";
    return NextResponse.json({ ok: false, configured: true, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  if (dryRun) {
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    const folder = typeof formData?.get("folder") === "string" ? String(formData?.get("folder")).trim() : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Image file is required." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      dryRun: true,
      configured: await hasCloudinaryConfig(),
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
      },
      folder,
    });
  }

  const platformStatus = await getAdminPlatformStatus();
  if (platformStatus.database && platformStatus.media) {
    const provider = String(platformStatus.provider) === "filesystem" ? "filesystem" : "r2";
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Media file is required." }, { status: 400 });
    try {
      const asset = await uploadMediaAsset(file, {
        folder: formData?.get("folder"),
        tags: formData?.get("tags"),
        altText: formData?.get("altText"),
        caption: formData?.get("caption"),
      }, req.url);
      return NextResponse.json({ ok: true, provider, asset });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
    }
  }

  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: false, error: "Media storage is not configured. Bind REGGIE_MEDIA or connect Cloudinary." }, { status: 400 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const folder = typeof formData?.get("folder") === "string" ? String(formData?.get("folder")).trim() : undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Image file is required." }, { status: 400 });
  }

  try {
    const asset = await uploadImageToCloudinary(file, folder);
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.id === "string" && body.id.trim()) {
    const platformStatus = await getAdminPlatformStatus();
    const provider = String(platformStatus.provider) === "filesystem" ? "filesystem" : "r2";
    try { return NextResponse.json({ ok: true, provider, asset: await updateMediaAsset(body as Record<string, unknown>) }); }
    catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not update media asset." }, { status: 400 }); }
  }

  if (!(await hasCloudinaryConfig())) {
    return NextResponse.json({ ok: false, error: "Cloudinary is not configured." }, { status: 400 });
  }

  const publicId = typeof body?.publicId === "string" ? body.publicId.trim() : "";

  if (!publicId) {
    return NextResponse.json({ ok: false, error: "Asset public ID is required." }, { status: 400 });
  }

  try {
    const asset = await updateCloudinaryAsset({
      publicId,
      folder: typeof body?.folder === "string" ? body.folder.trim() : undefined,
      fileName: typeof body?.fileName === "string" ? body.fileName.trim() : undefined,
      displayName: typeof body?.displayName === "string" ? body.displayName : undefined,
      altText: typeof body?.altText === "string" ? body.altText : undefined,
      caption: typeof body?.caption === "string" ? body.caption : undefined,
    });

    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update media asset.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "Asset ID is required." }, { status: 400 });
  try { await deleteMediaAsset(id); return NextResponse.json({ ok: true }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not remove media asset." }, { status: 400 }); }
}
