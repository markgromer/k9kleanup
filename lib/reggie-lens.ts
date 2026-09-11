export type ReggieLensActionType =
  | "rewrite_copy"
  | "shorten_copy"
  | "make_warmer"
  | "make_more_premium"
  | "improve_cta"
  | "replace_image"
  | "adjust_image"
  | "change_typography"
  | "redesign_layout"
  | "reposition_element"
  | "resize_element"
  | "move_section"
  | "fix_spacing"
  | "add_trust"
  | "hide_section"
  | "add_local_detail"
  | "add_review_social_proof"
  | "improve_mobile_layout"
  | "other";

export type ReggieLensPriority = "low" | "normal" | "high";
export type ReggieRiskLevel = "low" | "medium" | "high";
export type ReggieElementConfidence = "low" | "medium" | "high";
export type ReggieLensSourceCandidate = {
  filePath: string;
  line: number;
  column: number;
  symbol: string;
  strategy: "source-map" | "react-fiber" | "dom-attribute";
  confidence: ReggieElementConfidence;
  matchedValue?: string;
};
export type ReggieImageFitMode = "preserve_current" | "cover" | "contain";
export type ReggieImageCropFocus = "center" | "top" | "right" | "bottom" | "left" | "face_or_subject";
export type ReggieLensRewriteMode = "rewrite" | "shorten" | "warmer" | "stronger_cta" | "custom";
export type ReggieLensLayoutPresetId = "stack_compact" | "stack" | "stack_airy" | "split" | "focus_left" | "focus_right" | "grid_2" | "grid_3";
export type ReggieLensLayoutContextKind = "stack" | "split" | "collection";

export type ReggieLensFontAsset = {
  family: string;
  url: string;
  publicId?: string;
  fileName?: string;
  format?: "woff2" | "woff" | "truetype" | "opentype";
  weight?: number;
  style?: "normal" | "italic";
  licenseName?: string;
  licenseUrl?: string;
  rightsConfirmedAt?: string;
};

export type ReggieLensStructureChange = {
  presetId: ReggieLensLayoutPresetId;
  label: string;
  target: {
    tagName: string;
    label?: string;
    selector?: string;
    domPath?: string;
    directChildCount: number;
    kind: ReggieLensLayoutContextKind;
  };
  preview: {
    display: "grid";
    columns: string;
    mobileColumns: string;
    gap: string;
    alignItems: "start" | "center" | "stretch";
    childPattern?: "uniform" | "feature_selected" | "rail_selected_left" | "rail_selected_right" | "alternating" | "bento";
    containerMaxWidth?: string;
    padding?: string;
  };
  platformTemplate?: {
    id: string;
    name: string;
    variant: string;
    signature: string;
    fit?: string;
    mobileTransformation?: string;
  };
};

export type ReggieLensBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReggieLensLayoutChange = {
  kind: "move" | "resize" | "move_and_resize";
  coordinateSpace: "viewport";
  original: ReggieLensBoundingBox;
  proposed: ReggieLensBoundingBox;
  delta: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type ReggieLensVisualChange = {
  text?: {
    content: string;
    original: string;
    mode: ReggieLensRewriteMode;
    instruction?: string;
    source: "reggie" | "manual";
  };
  image?: {
    src: string;
    assetPublicId?: string;
    assetName?: string;
    alt?: string;
    fitMode?: "cover" | "contain" | "fill";
    objectPosition?: string;
  };
  typography?: {
    fontFamily?: string;
    fontAsset?: ReggieLensFontAsset;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: "normal" | "italic";
    lineHeight?: number;
    textAlign?: "left" | "center" | "right";
    color?: string;
  };
  headlineStyle?: {
    largeText?: string;
    smallText?: string;
    largeSize?: number;
    smallSize?: number;
    largeWeight?: number;
    smallWeight?: number;
    smallPosition?: "above" | "below";
  };
  structure?: ReggieLensStructureChange;
  original?: {
    imageSrc?: string;
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: string;
    lineHeight?: number;
    textAlign?: string;
    color?: string;
  };
};

export type ReggieLensAnnotation = {
  id: string;
  pageUrl: string;
  pathname: string;
  viewport: {
    width: number;
    height: number;
  };
  scroll: {
    x: number;
    y: number;
  };
  target: {
    tagName: string;
    label?: string;
    selector?: string;
    domPath?: string;
    text?: string;
    href?: string | null;
    src?: string | null;
    alt?: string | null;
    role?: string | null;
    ariaLabel?: string | null;
    boundingBox: ReggieLensBoundingBox;
    parentSummary?: {
      nearestHeading?: string;
      sectionText?: string;
    };
    layoutContext?: {
      tagName: string;
      label?: string;
      selector?: string;
      domPath?: string;
      directChildCount: number;
      kind: ReggieLensLayoutContextKind;
      boundingBox: ReggieLensBoundingBox;
    };
    componentHint?: string;
    source?: {
      best?: ReggieLensSourceCandidate;
      candidates: ReggieLensSourceCandidate[];
    };
    confidence?: ReggieElementConfidence;
    confidenceReason?: string;
  };
  note: string;
  actionType: ReggieLensActionType;
  priority: ReggieLensPriority;
  layoutChange?: ReggieLensLayoutChange;
  visualChange?: ReggieLensVisualChange;
  imageReplacement?: {
    uploadedImageUrl?: string;
    uploadedImageName?: string;
    prompt?: string;
    edit?: {
      resizeWidth?: number;
      resizeHeight?: number;
      cropAspectRatio?: string;
      cropFocus?: ReggieImageCropFocus;
      fitMode?: ReggieImageFitMode;
      notes?: string;
    };
  };
  createdAt: string;
};

export type ReggieLensSession = {
  sessionId: string;
  site?: string;
  conversationId?: string;
  conversationMessageId?: string;
  createdAt: string;
  updatedAt: string;
  annotations: ReggieLensAnnotation[];
};

export type ReggieRevisionPacket = {
  id: string;
  source: "manual" | "reggie_lens";
  title: string;
  conversationId?: string;
  conversationMessageId?: string;
  originalNotes: ReggieLensAnnotation[];
  interpretedGoal: string;
  affectedPages: string[];
  affectedElements: Array<{
    page: string;
    label: string;
    selector?: string;
    currentText?: string;
    note: string;
    actionType: ReggieLensActionType;
    priority: ReggieLensPriority;
    layoutChange?: ReggieLensLayoutChange;
    visualChange?: ReggieLensVisualChange;
    imageReplacement?: ReggieLensAnnotation["imageReplacement"];
    confidence?: ReggieElementConfidence;
    source?: ReggieLensAnnotation["target"]["source"];
  }>;
  riskLevel: ReggieRiskLevel;
  riskReason: string;
  doNotChange: string[];
  acceptanceCriteria: string[];
  vagueNotes: ReggieLensAnnotation[];
  codexPrompt: string;
  createdAt: string;
};

export const reggieLensActionTypes: Array<{
  value: ReggieLensActionType;
  label: string;
}> = [
  { value: "rewrite_copy", label: "Rewrite" },
  { value: "shorten_copy", label: "Shorten" },
  { value: "make_warmer", label: "Warmer" },
  { value: "make_more_premium", label: "More premium" },
  { value: "improve_cta", label: "Stronger CTA" },
  { value: "replace_image", label: "Replace image" },
  { value: "adjust_image", label: "Resize/crop image" },
  { value: "change_typography", label: "Typography" },
  { value: "redesign_layout", label: "Redesign layout" },
  { value: "reposition_element", label: "Reposition element" },
  { value: "resize_element", label: "Resize element" },
  { value: "move_section", label: "Move" },
  { value: "fix_spacing", label: "Fix spacing" },
  { value: "add_trust", label: "Add trust" },
  { value: "hide_section", label: "Hide" },
  { value: "add_local_detail", label: "Add local detail" },
  { value: "add_review_social_proof", label: "Add proof" },
  { value: "improve_mobile_layout", label: "Mobile layout" },
  { value: "other", label: "Other" },
];

export const reggieLensPriorities: Array<{
  value: ReggieLensPriority;
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const vagueNotePatterns = [
  /^make it pop\.?$/i,
  /^better\.?$/i,
  /^fix this\.?$/i,
  /^make cool\.?$/i,
  /^looks bad\.?$/i,
  /^i don'?t like this\.?$/i,
  /^can this be better\??$/i,
];

const highRiskTerms = [
  "admin",
  "auth",
  "authentication",
  "booking",
  "checkout",
  "cloudflare",
  "database",
  "deploy",
  "environment",
  "form",
  "login",
  "password",
  "payment",
  "price",
  "pricing",
  "secret",
  "token",
  "webhook",
];

const mediumRiskTerms = [
  "navigation",
  "navbar",
  "menu",
  "route",
  "service area",
  "offer",
  "layout",
  "move",
  "section",
];

const doNotChangeRules = [
  "Do not change pricing unless the note explicitly requests pricing changes.",
  "Do not change booking links unless the note explicitly requests link changes.",
  "Do not change form behavior unless the note explicitly requests form changes.",
  "Do not change routes unless the note explicitly requests route changes.",
  "Do not change authentication, admin permissions, secrets, workflows, or deployment configuration.",
  "Preserve existing design system, component patterns, and mobile usability.",
];

export function createReggieLensSession(site?: string, conversation?: { conversationId?: string; conversationMessageId?: string }): ReggieLensSession {
  const now = new Date().toISOString();
  return {
    sessionId: makeReggieId("lens"),
    site,
    conversationId: conversation?.conversationId,
    conversationMessageId: conversation?.conversationMessageId,
    createdAt: now,
    updatedAt: now,
    annotations: [],
  };
}

export function makeReggieId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getReggieLensActionLabel(value: ReggieLensActionType) {
  return reggieLensActionTypes.find((entry) => entry.value === value)?.label ?? "Other";
}

export function isVagueLensNote(note: string) {
  const normalized = note.trim();
  if (normalized.length > 0 && normalized.length < 12) {
    return true;
  }

  return vagueNotePatterns.some((pattern) => pattern.test(normalized));
}

export function getAnnotationLabel(annotation: ReggieLensAnnotation) {
  if (annotation.target.label) return annotation.target.label;
  if (annotation.target.parentSummary?.nearestHeading) return annotation.target.parentSummary.nearestHeading;
  if (annotation.target.text) return truncateText(annotation.target.text, 70);
  if (annotation.target.alt) return `Image: ${truncateText(annotation.target.alt, 56)}`;
  return annotation.target.tagName.toLowerCase();
}

export function computeReggieRisk(annotations: ReggieLensAnnotation[]): {
  riskLevel: ReggieRiskLevel;
  riskReason: string;
} {
  let score = 0;
  const reasons = new Set<string>();

  for (const annotation of annotations) {
    const haystack = [
      annotation.note,
      annotation.actionType,
      annotation.pathname,
      annotation.target.tagName,
      annotation.target.label,
      annotation.target.text,
      annotation.target.href,
      annotation.target.role,
      annotation.target.ariaLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (annotation.priority === "high") score += 1;
    if (["FORM", "INPUT", "TEXTAREA", "SELECT"].includes(annotation.target.tagName)) {
      score += 3;
      reasons.add("Selected element appears to be part of a form or lead-capture flow.");
    }

    if (annotation.target.tagName === "A" || annotation.target.tagName === "BUTTON") {
      score += 1;
      reasons.add("Selected element is an interactive CTA/link.");
    }

    if (annotation.layoutChange || annotation.visualChange?.structure || ["redesign_layout", "reposition_element", "resize_element", "move_section", "improve_mobile_layout"].includes(annotation.actionType)) {
      score += 2;
      reasons.add("Requested change may affect layout or mobile presentation.");
    }

    if (["replace_image", "adjust_image", "hide_section", "add_local_detail", "add_review_social_proof"].includes(annotation.actionType)) {
      score += 1;
    }

    if (annotation.visualChange?.typography) {
      score += 1;
      reasons.add("Requested change modifies typography presentation.");
    }

    if (highRiskTerms.some((term) => haystack.includes(term))) {
      score += 3;
      reasons.add("Notes mention high-risk areas such as pricing, forms, auth, secrets, deployment, or booking.");
    }

    if (mediumRiskTerms.some((term) => haystack.includes(term))) {
      score += 1;
      reasons.add("Notes mention layout, navigation, offers, service areas, or routes.");
    }
  }

  if (score >= 4) {
    return {
      riskLevel: "high",
      riskReason: Array.from(reasons).join(" ") || "This revision may affect important user flows.",
    };
  }

  if (score >= 2) {
    return {
      riskLevel: "medium",
      riskReason: Array.from(reasons).join(" ") || "This revision includes structural or interaction-adjacent changes.",
    };
  }

  return {
    riskLevel: "low",
    riskReason: "Requested changes appear limited to copy, imagery, or small presentation improvements.",
  };
}

export function buildReggieRevisionPacket(params: {
  id?: string;
  title?: string;
  annotations: ReggieLensAnnotation[];
  siteMemory?: string;
  createdBy?: string;
  conversationId?: string;
  conversationMessageId?: string;
}): ReggieRevisionPacket {
  const createdAt = new Date().toISOString();
  const affectedPages = Array.from(new Set(params.annotations.map((annotation) => annotation.pathname || "/")));
  const { riskLevel, riskReason } = computeReggieRisk(params.annotations);
  const vagueNotes = params.annotations.filter((annotation) => isVagueLensNote(annotation.note));
  const interpretedGoal = buildInterpretedGoal(params.annotations, vagueNotes);
  const packet: ReggieRevisionPacket = {
    id: params.id?.trim() || makeReggieId("packet"),
    source: "reggie_lens",
    title: params.title?.trim() || buildPacketTitle(affectedPages),
    conversationId: params.conversationId?.trim() || undefined,
    conversationMessageId: params.conversationMessageId?.trim() || undefined,
    originalNotes: params.annotations,
    interpretedGoal,
    affectedPages,
    affectedElements: params.annotations.map((annotation) => ({
      page: annotation.pathname || "/",
      label: getAnnotationLabel(annotation),
      selector: annotation.target.selector,
      currentText: annotation.target.text,
      note: annotation.note,
      actionType: annotation.actionType,
      priority: annotation.priority,
      layoutChange: annotation.layoutChange,
      visualChange: annotation.visualChange,
      imageReplacement: annotation.imageReplacement,
      confidence: annotation.target.confidence,
      source: annotation.target.source,
    })),
    riskLevel,
    riskReason,
    doNotChange: doNotChangeRules,
    acceptanceCriteria: buildAcceptanceCriteria(params.annotations, riskLevel),
    vagueNotes,
    codexPrompt: "",
    createdAt,
  };

  return {
    ...packet,
    codexPrompt: buildReggieCodexPrompt(packet, params.siteMemory),
  };
}

export function buildReggieCodexPrompt(packet: Omit<ReggieRevisionPacket, "codexPrompt">, siteMemory?: string) {
  const annotations = packet.originalNotes
    .map((annotation, index) => {
      const label = getAnnotationLabel(annotation);
      return [
        `${index + 1}. Target: ${label}`,
        `   Page: ${annotation.pathname || "/"}`,
        `   Captured viewport: ${annotation.viewport.width} x ${annotation.viewport.height}`,
        `   Current visible text: ${annotation.target.text ? quote(annotation.target.text) : "Not captured"}`,
        annotation.visualChange?.text ? `   Approved replacement text: ${quote(annotation.visualChange.text.content)}` : "",
        annotation.visualChange?.headlineStyle ? `   Headline split intent: ${formatHeadlineStyle(annotation.visualChange.headlineStyle)}` : "",
        `   Current image src: ${annotation.target.src ?? "Not captured"}`,
        `   Current image alt: ${annotation.target.alt ?? "Not captured"}`,
        `   User note: ${quote(annotation.note)}`,
        `   Action type: ${annotation.actionType}`,
        `   Priority: ${annotation.priority}`,
        annotation.layoutChange ? `   Drag/resize intent: ${formatLayoutChange(annotation.layoutChange)}` : "",
        annotation.visualChange ? `   Visual preview changes: ${formatVisualChange(annotation.visualChange)}` : "",
        annotation.imageReplacement?.uploadedImageUrl ? `   Uploaded replacement image: ${annotation.imageReplacement.uploadedImageUrl}` : "",
        annotation.imageReplacement?.uploadedImageName ? `   Uploaded replacement filename: ${annotation.imageReplacement.uploadedImageName}` : "",
        annotation.imageReplacement?.prompt ? `   Replacement image prompt: ${quote(annotation.imageReplacement.prompt)}` : "",
        annotation.imageReplacement?.edit ? `   Image edit instructions: ${formatImageEdit(annotation.imageReplacement.edit)}` : "",
        `   DOM hint: ${annotation.target.selector || annotation.target.domPath || "No stable selector captured"}`,
        `   Source hint: ${formatSourceHint(annotation.target.source)}`,
        `   Parent context: ${annotation.target.parentSummary?.sectionText ? truncateText(annotation.target.parentSummary.sectionText, 360) : "Not captured"}`,
        `   Element confidence: ${annotation.target.confidence ?? "medium"}${annotation.target.confidenceReason ? ` (${annotation.target.confidenceReason})` : ""}`,
      ].join("\n");
    })
    .join("\n\n");

  const siteMemoryBlock = siteMemory?.trim()
    ? `\nSite memory / brand rules:\n${siteMemory.trim()}\n`
    : "\nSite memory / brand rules:\nNo site memory file was supplied. Preserve the existing voice and patterns in the codebase.\n";

  const riskBlock = packet.riskLevel === "high"
    ? "\nHigh-risk warning:\nThis revision may affect lead capture, booking, payment, authentication, deployment, or other important flows. Keep changes tightly scoped and call out anything that requires manual review.\n"
    : packet.riskLevel === "medium"
      ? "\nMedium-risk warning:\nThis revision may affect layout, navigation, service areas, offers, or user flow clarity. Keep changes scoped and verify mobile behavior.\n"
      : "";

  return `You are modifying a Next.js App Router website using the Reggie revision system.

This revision was generated from Reggie Lens visual annotations. The user clicked specific areas of the live site and left notes. Use the DOM context and visible text to locate the relevant components/files, but do not rely only on brittle selectors. Prefer searching for current text in the codebase.

Goal:
${packet.interpretedGoal}

Source:
Reggie Lens visual annotations.

Affected pages:
${packet.affectedPages.map((page) => `- ${page}`).join("\n")}

Annotations:
${annotations}
${siteMemoryBlock}
Risk level:
${packet.riskLevel}

Risk reason:
${packet.riskReason}
${riskBlock}
Do not change:
${packet.doNotChange.map((rule) => `- ${rule}`).join("\n")}

Acceptance criteria:
${packet.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}

Implementation guidance:
- Start with a high-confidence Source hint when present, then verify the visible text and DOM context before editing. Treat lower-confidence candidates as search leads, not proof.
- Search the codebase for visible text from annotations to locate relevant components.
- Make the smallest safe change that satisfies the request.
- Keep copy concise and mobile-friendly.
- For replace_image notes, use any uploaded replacement image URL when provided. If an image prompt is provided instead, create or source an appropriate image asset during the revision and wire it into the selected image location.
- For adjust_image notes or image edit instructions, update image sizing, aspect ratio, object-fit, object-position, crop, source dimensions, or wrapper layout as needed while preserving responsive quality and alt text.
- For any annotation with Drag/resize intent, treat the captured geometry as visual intent at the captured viewport, not as a command to add brittle absolute positioning. Prefer the existing layout system (grid, flexbox, spacing, sizing, ordering, or responsive wrappers), preserve document flow and semantics, and verify nearby content and other breakpoints.
- For annotations with Visual preview changes, reproduce the preview through the site's existing components and design tokens. Use the selected asset URL and alt text when supplied. Apply typography through reusable styles or the site's font system, not one-off inline styles, and preserve responsive readability.
- For Headline split intent, preserve or create a maintainable large-line/small-line heading structure. Apply separate sizes and weights only to the intended line/span, keep the H1 semantic, and verify mobile wrapping.
- When Approved replacement text is present, use that exact copy unless a factual or safety conflict requires calling it out. Do not generate a different rewrite.
- For uploaded font assets, add the font through the site's existing font system or a local @font-face asset with font-display: swap and an appropriate fallback. Preserve the supplied family name and do not load the font on unrelated pages.
- For layout preset previews, reproduce the structural intent with maintainable grid or flex styles at the identified container. Stack columns at narrow breakpoints and preserve semantic order, focus order, forms, and interactive behavior.
- Avoid generic marketing fluff.
- Preserve existing design system and component style.
- If a note is vague, make a conservative interpretation and mention the assumption in your summary.
- Do not edit secrets, workflows, auth, deployment settings, API routes, or package files unless the revision explicitly requires it.

Verification:
- Run lint/build/tests if available.
- Report any assumptions or skipped items.

Final response:
- List files changed.
- Summarize user-visible changes.
- Confirm verification results.
- Mention anything that requires manual review.
`;
}

function formatSourceHint(source: ReggieLensAnnotation["target"]["source"]) {
  if (!source?.candidates?.length) return "No build-time source candidate was captured";
  return source.candidates.slice(0, 4).map((candidate) => {
    const location = `${candidate.filePath}:${candidate.line}:${candidate.column}`;
    return `${location}${candidate.symbol ? ` (${candidate.symbol})` : ""} via ${candidate.strategy}, ${candidate.confidence} confidence`;
  }).join("; ");
}

function formatHeadlineStyle(style: NonNullable<ReggieLensVisualChange["headlineStyle"]>) {
  return [
    style.largeText ? `large line ${quote(style.largeText)}` : "",
    style.smallText ? `small line ${quote(style.smallText)}` : "",
    style.largeSize ? `large size ${style.largeSize}px` : "",
    style.smallSize ? `small size ${style.smallSize}px` : "",
    style.largeWeight ? `large weight ${style.largeWeight}` : "",
    style.smallWeight ? `small weight ${style.smallWeight}` : "",
    style.smallPosition ? `small line ${style.smallPosition}` : "",
  ].filter(Boolean).join("; ");
}

function buildInterpretedGoal(annotations: ReggieLensAnnotation[], vagueNotes: ReggieLensAnnotation[]) {
  const pageList = Array.from(new Set(annotations.map((annotation) => annotation.pathname || "/")));
  const actionList = Array.from(new Set(annotations.map((annotation) => getReggieLensActionLabel(annotation.actionType).toLowerCase())));
  const targetList = annotations.map((annotation) => getAnnotationLabel(annotation)).slice(0, 4);

  const base = `Apply the requested visual revision notes across ${pageList.join(", ")}. Focus on ${actionList.join(", ")} for ${targetList.join(", ")} while preserving existing layout, booking flow, routes, and mobile usability unless a note explicitly requests structural changes.`;

  if (vagueNotes.length > 0) {
    return `${base} Some notes are vague; interpret them conservatively using the clicked element context and preserve the site's current brand direction.`;
  }

  return base;
}

function buildPacketTitle(affectedPages: string[]) {
  if (affectedPages.length === 1) {
    return `Visual revision for ${affectedPages[0]}`;
  }

  return `Visual revision for ${affectedPages.length} pages`;
}

function buildAcceptanceCriteria(annotations: ReggieLensAnnotation[], riskLevel: ReggieRiskLevel) {
  const criteria = [
    "All requested annotation notes are addressed or explicitly called out if skipped.",
    "Changes remain scoped to the affected pages/elements.",
    "Primary CTAs, booking links, form behavior, routes, auth, and deployment configuration remain unchanged unless explicitly requested.",
    "Copy and layout remain readable on mobile.",
    "Lint/build/tests pass where available.",
    "Summary explains all user-visible changes.",
  ];

  if (annotations.some((annotation) => annotation.actionType === "replace_image" || annotation.actionType === "adjust_image")) {
    criteria.push("Image replacements or crop/resize adjustments include appropriate alt text and preserve layout quality.");
  }

  if (annotations.some((annotation) => annotation.layoutChange)) {
    criteria.push("Dragged or resized elements match the requested visual intent at the captured viewport and remain usable without overlap or clipping at other breakpoints.");
  }

  if (annotations.some((annotation) => annotation.visualChange)) {
    criteria.push("Visual image and typography previews are implemented through maintainable site styles and match the captured viewport without degrading other breakpoints.");
  }

  if (annotations.some((annotation) => annotation.visualChange?.text)) {
    criteria.push("Approved replacement copy matches the Lens preview exactly and does not introduce unsupported claims, offers, guarantees, or pricing.");
  }

  if (annotations.some((annotation) => annotation.visualChange?.typography?.fontAsset)) {
    criteria.push("Uploaded fonts use font-display: swap, a suitable fallback, and only load where the selected typography requires them.");
  }

  if (annotations.some((annotation) => annotation.visualChange?.structure)) {
    criteria.push("Selected layout presets preserve content order and interaction behavior, remain readable on mobile, and introduce no overlap or clipping.");
  }

  if (riskLevel === "high") {
    criteria.push("High-risk areas are clearly documented for manual review before publishing.");
  }

  return criteria;
}

export function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function quote(value: string) {
  return `"${truncateText(value, 500).replace(/"/g, '\\"')}"`;
}

function formatImageEdit(edit: NonNullable<NonNullable<ReggieLensAnnotation["imageReplacement"]>["edit"]>) {
  if (!edit) return "None";
  const parts = [
    edit.resizeWidth ? `target width ${edit.resizeWidth}px` : "",
    edit.resizeHeight ? `target height ${edit.resizeHeight}px` : "",
    edit.cropAspectRatio ? `crop/aspect ratio ${edit.cropAspectRatio}` : "",
    edit.cropFocus ? `crop focus ${edit.cropFocus}` : "",
    edit.fitMode ? `fit mode ${edit.fitMode}` : "",
    edit.notes ? `notes ${quote(edit.notes)}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : "Preserve current image sizing unless the note says otherwise.";
}

function formatLayoutChange(change: ReggieLensLayoutChange) {
  const original = change.original;
  const proposed = change.proposed;
  return [
    `${change.kind.replaceAll("_", " ")} in viewport coordinates`,
    `original x ${original.x}px, y ${original.y}px, width ${original.width}px, height ${original.height}px`,
    `proposed x ${proposed.x}px, y ${proposed.y}px, width ${proposed.width}px, height ${proposed.height}px`,
    `delta x ${signedPixels(change.delta.x)}, y ${signedPixels(change.delta.y)}, width ${signedPixels(change.delta.width)}, height ${signedPixels(change.delta.height)}`,
  ].join("; ");
}

function signedPixels(value: number) {
  return `${value >= 0 ? "+" : ""}${value}px`;
}

function formatVisualChange(change: ReggieLensVisualChange) {
  const parts: string[] = [];
  if (change.text) {
    parts.push(`replacement text ${quote(change.text.content)}`);
    parts.push(`rewrite mode ${change.text.mode}`);
    if (change.text.instruction) parts.push(`rewrite feedback ${quote(change.text.instruction)}`);
  }
  if (change.image) {
    parts.push(`image ${change.image.src}`);
    if (change.image.assetPublicId) parts.push(`asset ${change.image.assetPublicId}`);
    if (change.image.alt !== undefined) parts.push(`alt ${quote(change.image.alt)}`);
    if (change.image.fitMode) parts.push(`fit ${change.image.fitMode}`);
    if (change.image.objectPosition) parts.push(`position ${change.image.objectPosition}`);
  }
  if (change.typography) {
    const typography = change.typography;
    if (typography.fontFamily) parts.push(`font ${typography.fontFamily}`);
    if (typography.fontAsset) parts.push(`uploaded font ${typography.fontAsset.family} (${typography.fontAsset.url})`);
    if (typography.fontSize) parts.push(`size ${typography.fontSize}px`);
    if (typography.fontWeight) parts.push(`weight ${typography.fontWeight}`);
    if (typography.fontStyle) parts.push(`style ${typography.fontStyle}`);
    if (typography.lineHeight) parts.push(`line height ${typography.lineHeight}`);
    if (typography.textAlign) parts.push(`align ${typography.textAlign}`);
    if (typography.color) parts.push(`color ${typography.color}`);
  }
  if (change.structure) {
    parts.push(`layout preset ${change.structure.label}`);
    if (change.structure.platformTemplate) {
      parts.push(`PoopSites system ${change.structure.platformTemplate.name} (${change.structure.platformTemplate.id})`);
      parts.push(`system intent ${quote(change.structure.platformTemplate.signature)}`);
      if (change.structure.platformTemplate.fit) parts.push(`best fit ${quote(change.structure.platformTemplate.fit)}`);
      if (change.structure.platformTemplate.mobileTransformation) parts.push(`mobile transformation ${quote(change.structure.platformTemplate.mobileTransformation)}`);
    }
    parts.push(`layout target ${change.structure.target.selector || change.structure.target.domPath || change.structure.target.tagName}`);
    parts.push(`desktop columns ${change.structure.preview.columns}`);
    parts.push(`mobile columns ${change.structure.preview.mobileColumns}`);
    if (change.structure.preview.childPattern) parts.push(`child pattern ${change.structure.preview.childPattern.replaceAll("_", " ")}`);
    if (change.structure.preview.containerMaxWidth) parts.push(`container max width ${change.structure.preview.containerMaxWidth}`);
    if (change.structure.preview.padding) parts.push(`container padding ${change.structure.preview.padding}`);
  }
  return parts.join("; ") || "No visual override captured.";
}
