export const adminRevisionRequestTypes = [
  {
    value: "site_revision",
    label: "Site revision",
    description: "Edit existing copy, layout, sections, navigation, or styles.",
  },
  {
    value: "landing_page",
    label: "New landing page",
    description: "Create a focused service, city, campaign, or ad destination page.",
  },
] as const;

export type AdminRevisionRequestType = (typeof adminRevisionRequestTypes)[number]["value"];

export type AdminRevisionMetadata = {
  title?: string;
  targetPath?: string;
  slug?: string;
  targetKeyword?: string;
  audience?: string;
  service?: string;
  location?: string;
  goal?: string;
  primaryCta?: string;
  ctaLabel?: string;
  offer?: string;
  leadMagnet?: string;
  notes?: string;
  recipeId?: string;
  revisionAnnotations?: Array<{
    id?: string;
    page?: string;
    label?: string;
    actionType?: string;
    selector?: string;
    domPath?: string;
    text?: string;
    alt?: string;
    src?: string;
    viewport?: { width?: number; height?: number };
    scroll?: { x?: number; y?: number };
    boundingBox?: { x?: number; y?: number; width?: number; height?: number };
    layoutSelector?: string;
    layoutBoundingBox?: { x?: number; y?: number; width?: number; height?: number };
    replacementText?: string;
    source?: {
      best?: { filePath?: string; line?: number; column?: number; symbol?: string; strategy?: string; confidence?: string };
      candidates?: Array<{ filePath?: string; line?: number; column?: number; symbol?: string; strategy?: string; confidence?: string }>;
    };
  }>;
};

export const adminRevisionPreviewPaths = ["/", "/about", "/services"] as const;

const requestTypeValues = new Set<string>(adminRevisionRequestTypes.map((type) => type.value));

export function normalizeAdminRevisionRequestType(value: unknown): AdminRevisionRequestType {
  const input = String(value ?? "").trim();
  return requestTypeValues.has(input) ? (input as AdminRevisionRequestType) : "site_revision";
}

export function getAdminRevisionRequestTypeLabel(value: AdminRevisionRequestType) {
  return adminRevisionRequestTypes.find((type) => type.value === value)?.label ?? "Site revision";
}

export function normalizeAdminRevisionMetadata(value: unknown): AdminRevisionMetadata {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  return {
    title: cleanMetadataField(input.title),
    targetPath: cleanMetadataField(input.targetPath),
    slug: cleanMetadataField(input.slug),
    targetKeyword: cleanMetadataField(input.targetKeyword),
    audience: cleanMetadataField(input.audience),
    service: cleanMetadataField(input.service),
    location: cleanMetadataField(input.location),
    goal: cleanMetadataField(input.goal),
    primaryCta: cleanMetadataField(input.primaryCta),
    ctaLabel: cleanMetadataField(input.ctaLabel),
    offer: cleanMetadataField(input.offer),
    leadMagnet: cleanMetadataField(input.leadMagnet),
    notes: cleanMetadataField(input.notes, 800),
    recipeId: cleanMetadataField(input.recipeId),
  };
}

export function serializeAdminRevisionMetadata(metadata: AdminRevisionMetadata) {
  return JSON.stringify(metadata, null, 2);
}

function cleanMetadataField(value: unknown, maxLength = 180) {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : "";
}
