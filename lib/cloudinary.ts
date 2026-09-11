import { createHash } from "node:crypto";
import path from "node:path";

import { resolveCloudinaryConfig, type CloudinaryConfig } from "@/lib/cloudinary-config";

export type CloudinaryAsset = {
  assetId: string;
  publicId: string;
  secureUrl: string;
  folder: string;
  fileName: string;
  displayName?: string;
  altText?: string;
  caption?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  originalFilename?: string;
  createdAt?: string;
};

export type CloudinaryFontAsset = {
  assetId: string;
  publicId: string;
  secureUrl: string;
  folder: string;
  fileName: string;
  family: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
  weight: number;
  style: "normal" | "italic";
  licenseName?: string;
  licenseUrl?: string;
  rightsConfirmedAt?: string;
  bytes?: number;
  createdAt?: string;
};

export type CloudinaryFontMetadata = Pick<
  CloudinaryFontAsset,
  "family" | "weight" | "style" | "licenseName" | "licenseUrl" | "rightsConfirmedAt"
>;

const maxFontBytes = 8 * 1024 * 1024;
const fontExtensions = new Set(["woff2", "woff", "ttf", "otf"]);

async function requireCloudinaryConfig(config?: CloudinaryConfig) {
  const activeConfig = config ?? (await resolveCloudinaryConfig());
  if (!activeConfig) {
    throw new Error("Cloudinary is not configured.");
  }

  return activeConfig;
}

export async function hasCloudinaryConfig() {
  return Boolean(await resolveCloudinaryConfig());
}

export async function getCloudinaryBaseFolder() {
  return (await resolveCloudinaryConfig())?.folder ?? "";
}

function signParams(params: Record<string, string>, apiSecret: string) {
  const toSign = Object.entries(params)
    .filter(([, value]) => value !== "" && value != null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${toSign}${apiSecret}`)
    .digest("hex");
}

function buildBasicAuthHeader(config: CloudinaryConfig) {
  return `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`;
}

function normalizeFolder(value: string, baseFolder: string) {
  const sanitized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
  if (!sanitized) {
    return baseFolder;
  }

  if (sanitized === baseFolder || sanitized.startsWith(`${baseFolder}/`)) {
    return sanitized;
  }

  return `${baseFolder}/${sanitized}`.replace(/\/+/g, "/");
}

function parseAssetFolder(asset: Record<string, unknown>) {
  const explicitFolder = typeof asset.asset_folder === "string" ? asset.asset_folder : "";
  if (explicitFolder) {
    return explicitFolder;
  }

  const publicId = typeof asset.public_id === "string" ? asset.public_id : "";
  return publicId.includes("/") ? path.posix.dirname(publicId) : "";
}

function parseAssetContext(asset: Record<string, unknown>) {
  const context = asset.context;
  if (!context || typeof context !== "object") {
    return { altText: undefined, caption: undefined, family: undefined, fontMetadata: undefined };
  }

  const custom = (context as { custom?: Record<string, unknown> }).custom;
  if (!custom || typeof custom !== "object") {
    return { altText: undefined, caption: undefined, family: undefined, fontMetadata: undefined };
  }

  return {
    altText: typeof custom.alt === "string" ? custom.alt : undefined,
    caption: typeof custom.caption === "string" ? custom.caption : undefined,
    family: typeof custom.family === "string" ? custom.family : undefined,
    fontMetadata: decodeFontMetadata(typeof custom.reggie_font === "string" ? custom.reggie_font : ""),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readCloudinaryJson(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  return isRecord(value) ? value : null;
}

function cloudinaryError(data: Record<string, unknown> | null) {
  const error = isRecord(data?.error) ? data.error : null;
  return typeof error?.message === "string" ? error.message : undefined;
}

function cloudinaryResources(data: Record<string, unknown> | null) {
  const resources = data?.resources;
  return Array.isArray(resources) && resources.every(isRecord) ? resources : null;
}

export async function verifyCloudinaryConfig(config: CloudinaryConfig) {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload?max_results=1`,
    {
      method: "GET",
      headers: {
        Authorization: buildBasicAuthHeader(config),
      },
      cache: "no-store",
    },
  );

  const data = await readCloudinaryJson(response);
  if (!response.ok || !data) {
    throw new Error(cloudinaryError(data) ?? "Could not verify Cloudinary credentials.");
  }
}

export async function uploadImageToCloudinary(file: File, folder?: string, config?: CloudinaryConfig) {
  const activeConfig = await requireCloudinaryConfig(config);

  const targetFolder = normalizeFolder(folder ?? activeConfig.folder, activeConfig.folder);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    folder: targetFolder,
    timestamp,
  };

  const signature = signParams(params, activeConfig.apiSecret);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", activeConfig.apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", targetFolder);
  formData.append("signature", signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  const data = await readCloudinaryJson(response);
  if (!response.ok || !data) {
    throw new Error(cloudinaryError(data) ?? "Cloudinary upload failed.");
  }

  return mapCloudinaryAsset(data);
}

export async function validateFontFile(file: File) {
  const extension = path.extname(file.name).slice(1).toLowerCase();
  if (!fontExtensions.has(extension)) {
    throw new Error("Choose a WOFF2, WOFF, TTF, or OTF font file.");
  }
  if (file.size < 12 || file.size > maxFontBytes) {
    throw new Error("Font files must be between 12 bytes and 8 MB.");
  }

  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const signatureText = String.fromCharCode(...signature);
  const isTrueType = signature[0] === 0x00 && signature[1] === 0x01 && signature[2] === 0x00 && signature[3] === 0x00;
  const detected = signatureText === "wOF2"
    ? "woff2"
    : signatureText === "wOFF"
      ? "woff"
      : signatureText === "OTTO"
        ? "otf"
        : isTrueType || signatureText === "true"
          ? "ttf"
          : "";

  if (!detected || detected !== extension) {
    throw new Error("The selected file does not match its font file extension.");
  }

  return {
    extension,
    format: extension === "ttf" ? "truetype" as const : extension === "otf" ? "opentype" as const : extension as "woff2" | "woff",
  };
}

export function normalizeFontFamily(value: string) {
  const family = value.replace(/\s+/g, " ").trim();
  if (family.length < 2 || family.length > 64 || /[\\";{}<>|=]/.test(family)) {
    throw new Error("Enter a font family name between 2 and 64 characters.");
  }
  return family;
}

export function normalizeFontMetadata(input: Partial<CloudinaryFontMetadata> & { family: string }): CloudinaryFontMetadata {
  const weight = Number(input.weight ?? 400);
  const style = input.style === "italic" ? "italic" : "normal";
  const licenseName = String(input.licenseName ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
  const licenseUrlValue = String(input.licenseUrl ?? "").trim();
  let licenseUrl: string | undefined;
  if (licenseUrlValue) {
    try {
      const parsed = new URL(licenseUrlValue);
      if (parsed.protocol !== "https:") throw new Error();
      licenseUrl = parsed.toString().slice(0, 500);
    } catch {
      throw new Error("Font license links must use a valid HTTPS URL.");
    }
  }
  if (!Number.isInteger(weight) || weight < 100 || weight > 900 || weight % 100 !== 0) {
    throw new Error("Choose a font weight from 100 through 900.");
  }
  return {
    family: normalizeFontFamily(input.family),
    weight,
    style,
    licenseName,
    licenseUrl,
    rightsConfirmedAt: String(input.rightsConfirmedAt ?? "").trim().slice(0, 40) || undefined,
  };
}

export async function uploadFontToCloudinary(file: File, metadataInput: string | (Partial<CloudinaryFontMetadata> & { family: string }), folder?: string, config?: CloudinaryConfig) {
  const activeConfig = await requireCloudinaryConfig(config);
  const metadata = normalizeFontMetadata(typeof metadataInput === "string" ? { family: metadataInput } : metadataInput);
  const family = metadata.family;
  const { extension, format } = await validateFontFile(file);
  const targetFolder = normalizeFolder(folder ?? `${activeConfig.folder}/fonts`, activeConfig.folder);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "custom-font";
  const params = {
    allowed_formats: "woff2,woff,ttf,otf",
    context: fontContext(metadata),
    folder: targetFolder,
    public_id: `${slug}-${Date.now().toString(36)}.${extension}`,
    timestamp,
  };
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", activeConfig.apiKey);
  for (const [key, value] of Object.entries(params)) formData.append(key, value);
  formData.append("signature", signParams(params, activeConfig.apiSecret));

  const response = await fetch(`https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/raw/upload`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await readCloudinaryJson(response);
  if (!response.ok || !data) {
    throw new Error(cloudinaryError(data) ?? "Font upload failed.");
  }

  return mapCloudinaryFontAsset(data, metadata, format);
}

export async function listCloudinaryFonts(folder?: string, config?: CloudinaryConfig) {
  const activeConfig = config ?? (await resolveCloudinaryConfig());
  if (!activeConfig) return [] as CloudinaryFontAsset[];
  const targetFolder = normalizeFolder(folder ?? `${activeConfig.folder}/fonts`, activeConfig.folder);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/resources/raw/upload?prefix=${encodeURIComponent(targetFolder)}/&max_results=100&context=true`,
    {
      method: "GET",
      headers: { Authorization: buildBasicAuthHeader(activeConfig) },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  const data = await readCloudinaryJson(response);
  const resources = cloudinaryResources(data);
  if (!response.ok || !resources) {
    throw new Error(cloudinaryError(data) ?? "Could not load uploaded fonts.");
  }

  return resources
    .map((asset) => mapCloudinaryFontAsset(asset))
    .filter((asset) => asset.folder === targetFolder && Boolean(asset.secureUrl))
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
}

export async function updateCloudinaryFont(publicIdValue: string, metadataInput: Partial<CloudinaryFontMetadata> & { family: string }, config?: CloudinaryConfig) {
  const activeConfig = await requireCloudinaryConfig(config);
  const publicId = validateFontPublicId(publicIdValue, activeConfig.folder);
  const metadata = normalizeFontMetadata(metadataInput);
  const formData = new FormData();
  formData.append("context", fontContext(metadata));
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/resources/raw/upload/${encodeURIComponent(publicId)}`,
    {
      method: "POST",
      headers: { Authorization: buildBasicAuthHeader(activeConfig) },
      body: formData,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const data = await readCloudinaryJson(response);
  if (!response.ok || !data) throw new Error(cloudinaryError(data) ?? "Could not update this font.");
  return mapCloudinaryFontAsset(data, metadata);
}

export async function deleteCloudinaryFont(publicIdValue: string, config?: CloudinaryConfig) {
  const activeConfig = await requireCloudinaryConfig(config);
  const publicId = validateFontPublicId(publicIdValue, activeConfig.folder);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { invalidate: "true", public_id: publicId, timestamp, type: "upload" };
  const formData = new FormData();
  for (const [key, value] of Object.entries(params)) formData.append(key, value);
  formData.append("api_key", activeConfig.apiKey);
  formData.append("signature", signParams(params, activeConfig.apiSecret));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/raw/destroy`, {
    method: "POST",
    body: formData,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = await readCloudinaryJson(response);
  if (!response.ok || !data || !["ok", "not found"].includes(String(data.result))) {
    throw new Error(cloudinaryError(data) ?? "Could not delete this font.");
  }
  return { publicId, deleted: data.result === "ok" };
}

export async function listCloudinaryAssets(folder?: string, config?: CloudinaryConfig) {
  const activeConfig = config ?? (await resolveCloudinaryConfig());
  if (!activeConfig) {
    return [] as CloudinaryAsset[];
  }

  const targetFolder = normalizeFolder(folder ?? activeConfig.folder, activeConfig.folder);
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/resources/image/upload?prefix=${encodeURIComponent(targetFolder)}/&max_results=100`,
    {
      method: "GET",
      headers: {
        Authorization: buildBasicAuthHeader(activeConfig),
      },
      cache: "no-store",
    },
  );

  const data = await readCloudinaryJson(response);
  const resources = cloudinaryResources(data);
  if (!response.ok || !resources) {
    throw new Error(cloudinaryError(data) ?? "Could not load Cloudinary assets.");
  }

  return resources
    .map(mapCloudinaryAsset)
    .filter((asset: CloudinaryAsset) => asset.folder === targetFolder)
    .sort((left: CloudinaryAsset, right: CloudinaryAsset) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    );
}

export async function listCloudinaryFolders(config?: CloudinaryConfig) {
  const activeConfig = config ?? (await resolveCloudinaryConfig());
  if (!activeConfig) {
    return [] as string[];
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/resources/image/upload?prefix=${encodeURIComponent(activeConfig.folder)}/&max_results=100`,
    {
      method: "GET",
      headers: {
        Authorization: buildBasicAuthHeader(activeConfig),
      },
      cache: "no-store",
    },
  );

  const data = await readCloudinaryJson(response);
  const resources = cloudinaryResources(data);
  if (!response.ok || !resources) {
    throw new Error(cloudinaryError(data) ?? "Could not load Cloudinary folders.");
  }

  const folders = new Set<string>([activeConfig.folder]);

  for (const resource of resources) {
    const folder = parseAssetFolder(resource);
    if (folder && (folder === activeConfig.folder || folder.startsWith(`${activeConfig.folder}/`))) {
      folders.add(folder);
    }
  }

  return Array.from(folders).sort((left, right) => left.localeCompare(right));
}

type UpdateCloudinaryAssetInput = {
  publicId: string;
  folder?: string;
  fileName?: string;
  displayName?: string;
  altText?: string;
  caption?: string;
};

export async function updateCloudinaryAsset(input: UpdateCloudinaryAssetInput, config?: CloudinaryConfig) {
  const activeConfig = await requireCloudinaryConfig(config);

  const fromPublicId = input.publicId.trim();
  if (!fromPublicId) {
    throw new Error("Asset public ID is required.");
  }

  let activePublicId = fromPublicId;
  const currentFolder = path.posix.dirname(fromPublicId);
  const currentFileName = path.posix.basename(fromPublicId);
  const targetFolder = normalizeFolder(input.folder ?? currentFolder, activeConfig.folder);
  const targetFileName = (input.fileName ?? currentFileName).trim().replace(/\.[^/.]+$/, "");

  if (!targetFileName) {
    throw new Error("A file name is required.");
  }

  const targetPublicId = `${targetFolder}/${targetFileName}`.replace(/\/+/g, "/");
  if (targetPublicId !== fromPublicId) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const renameParams = {
      from_public_id: fromPublicId,
      to_public_id: targetPublicId,
      overwrite: "true",
      invalidate: "true",
      timestamp,
    };

    const renameForm = new FormData();
    renameForm.append("from_public_id", renameParams.from_public_id);
    renameForm.append("to_public_id", renameParams.to_public_id);
    renameForm.append("overwrite", renameParams.overwrite);
    renameForm.append("invalidate", renameParams.invalidate);
    renameForm.append("timestamp", timestamp);
    renameForm.append("api_key", activeConfig.apiKey);
    renameForm.append("signature", signParams(renameParams, activeConfig.apiSecret));

    const renameResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/image/rename`,
      {
        method: "POST",
        body: renameForm,
      },
    );

    const renameData = await readCloudinaryJson(renameResponse);
    if (!renameResponse.ok || !renameData) {
      throw new Error(cloudinaryError(renameData) ?? "Could not rename image.");
    }

    activePublicId = targetPublicId;
  }

  const hasMetadataUpdate =
    typeof input.displayName === "string" ||
    typeof input.altText === "string" ||
    typeof input.caption === "string";

  if (hasMetadataUpdate) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const explicitParams: Record<string, string> = {
      public_id: activePublicId,
      type: "upload",
      timestamp,
    };

    const contextParts = [
      `alt=${(input.altText ?? "").replace(/\|/g, " ")}`,
      `caption=${(input.caption ?? "").replace(/\|/g, " ")}`,
    ];
    explicitParams.context = contextParts.join("|");

    if (typeof input.displayName === "string") {
      explicitParams.display_name = input.displayName.trim();
    }

    const explicitForm = new FormData();
    for (const [key, value] of Object.entries(explicitParams)) {
      explicitForm.append(key, value);
    }
    explicitForm.append("api_key", activeConfig.apiKey);
    explicitForm.append("signature", signParams(explicitParams, activeConfig.apiSecret));

    const explicitResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${activeConfig.cloudName}/image/explicit`,
      {
        method: "POST",
        body: explicitForm,
      },
    );

    const explicitData = await readCloudinaryJson(explicitResponse);
    if (!explicitResponse.ok || !explicitData) {
      throw new Error(cloudinaryError(explicitData) ?? "Could not update image metadata.");
    }

    return mapCloudinaryAsset(explicitData);
  }

  const [asset] = await listCloudinaryAssets(targetFolder, activeConfig);
  return asset;
}

function mapCloudinaryAsset(asset: Record<string, unknown>): CloudinaryAsset {
  const publicId = String(asset.public_id ?? "");
  const folder = parseAssetFolder(asset);
  const { altText, caption } = parseAssetContext(asset);

  return {
    assetId: String(asset.asset_id ?? ""),
    publicId,
    secureUrl: String(asset.secure_url ?? ""),
    folder,
    fileName: publicId ? path.posix.basename(publicId) : "",
    displayName: typeof asset.display_name === "string" ? asset.display_name : undefined,
    altText,
    caption,
    width: typeof asset.width === "number" ? asset.width : undefined,
    height: typeof asset.height === "number" ? asset.height : undefined,
    format: typeof asset.format === "string" ? asset.format : undefined,
    bytes: typeof asset.bytes === "number" ? asset.bytes : undefined,
    originalFilename:
      typeof asset.original_filename === "string" ? asset.original_filename : undefined,
    createdAt: typeof asset.created_at === "string" ? asset.created_at : undefined,
  };
}

function fontContext(metadata: CloudinaryFontMetadata) {
  const encoded = Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
  return `family=${metadata.family}|reggie_font=${encoded}`;
}

function decodeFontMetadata(value: string): CloudinaryFontMetadata | undefined {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CloudinaryFontMetadata>;
    return normalizeFontMetadata({
      family: String(parsed.family ?? "Custom font"),
      weight: parsed.weight,
      style: parsed.style,
      licenseName: parsed.licenseName,
      licenseUrl: parsed.licenseUrl,
      rightsConfirmedAt: parsed.rightsConfirmedAt,
    });
  } catch {
    return undefined;
  }
}

function validateFontPublicId(value: string, baseFolder: string) {
  const publicId = value.replace(/\\/g, "/").trim();
  const fontFolder = `${baseFolder}/fonts/`;
  if (!publicId.startsWith(fontFolder) || publicId.includes("..") || publicId.length > 300) {
    throw new Error("This font does not belong to the configured font library.");
  }
  return publicId;
}

function mapCloudinaryFontAsset(
  asset: Record<string, unknown>,
  fallbackMetadata?: Partial<CloudinaryFontMetadata>,
  fallbackFormat?: CloudinaryFontAsset["format"],
): CloudinaryFontAsset {
  const publicId = String(asset.public_id ?? "");
  const fileName = publicId ? path.posix.basename(publicId) : "";
  const extension = path.extname(fileName).slice(1).toLowerCase();
  const context = parseAssetContext(asset);
  const format = fallbackFormat
    ?? (extension === "ttf" ? "truetype" : extension === "otf" ? "opentype" : extension === "woff" ? "woff" : "woff2");
  const derivedFamily = path.basename(fileName, path.extname(fileName)).replace(/-[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  const metadata = context.fontMetadata ?? normalizeFontMetadata({ ...fallbackMetadata, family: context.family || fallbackMetadata?.family || derivedFamily || "Custom font" });
  return {
    assetId: String(asset.asset_id ?? ""),
    publicId,
    secureUrl: String(asset.secure_url ?? ""),
    folder: parseAssetFolder(asset),
    fileName,
    family: metadata.family,
    format,
    weight: metadata.weight,
    style: metadata.style,
    licenseName: metadata.licenseName,
    licenseUrl: metadata.licenseUrl,
    rightsConfirmedAt: metadata.rightsConfirmedAt,
    bytes: typeof asset.bytes === "number" ? asset.bytes : undefined,
    createdAt: typeof asset.created_at === "string" ? asset.created_at : undefined,
  };
}
