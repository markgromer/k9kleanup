"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { clearSavedAdminPassword, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import {
  buildReggieRevisionPacket,
  computeReggieRisk,
  createReggieLensSession,
  getAnnotationLabel,
  getReggieLensActionLabel,
  isVagueLensNote,
  makeReggieId,
  reggieLensActionTypes,
  reggieLensPriorities,
  truncateText,
  type ReggieLensActionType,
  type ReggieLensAnnotation,
  type ReggieLensBoundingBox,
  type ReggieElementConfidence,
  type ReggieImageCropFocus,
  type ReggieImageFitMode,
  type ReggieLensLayoutChange,
  type ReggieLensLayoutContextKind,
  type ReggieLensLayoutPresetId,
  type ReggieLensRewriteMode,
  type ReggieLensSourceCandidate,
  type ReggieLensStructureChange,
  type ReggieLensVisualChange,
  type ReggieLensPriority,
  type ReggieLensSession,
  type ReggieRevisionPacket,
} from "@/lib/reggie-lens";
import styles from "./ReggieLensWorkspace.module.css";

type LensMode = "select" | "drag" | "navigate";
type LensViewportPreset = "desktop" | "tablet" | "mobile";
type LensZoomPreset = "fit" | "75" | "100";
type LensSidebarTab = "edit" | "layouts" | "media" | "brand" | "fonts" | "notes";
type LensMediaSource = "site" | "poopsites";

type CandidateTarget = Omit<ReggieLensAnnotation, "id" | "note" | "actionType" | "priority" | "createdAt">;
type LensSourceMapEntry = {
  type: "reggieId" | "component" | "section" | "testid" | "text";
  value: string;
  filePath: string;
  line: number;
  column: number;
  symbol: string;
};
type ReggieImageEdit = NonNullable<NonNullable<ReggieLensAnnotation["imageReplacement"]>["edit"]>;
type LensMediaAsset = {
  id?: string;
  url?: string;
  assetId: string;
  publicId: string;
  secureUrl: string;
  fileName: string;
  displayName?: string;
  contentType?: string;
  altText?: string;
  previewUrl?: string;
  source?: LensMediaSource;
  imageType?: string;
  styles?: string[];
  width?: number;
  height?: number;
};
type LensFontAsset = {
  assetId: string;
  publicId: string;
  secureUrl: string;
  fileName: string;
  family: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
  weight: number;
  style: "normal" | "italic";
  licenseName?: string;
  licenseUrl?: string;
  rightsConfirmedAt?: string;
  bytes?: number;
};
type LensPlatformTemplate = {
  id: string;
  name: string;
  description: string;
  fit: string;
  variant: string;
  signature: string;
  mobileTransformation: string;
  preview: { columns: number[]; blocks: number[] };
};
type LensBrandProfile = {
  tone: string;
  audience: string;
  ctaStyle: string;
  notes: string;
  approvedPhrases: string[];
  forbiddenClaims: string[];
  source: string;
  updatedAt: string;
};
type LensApiErrorResponse = { error?: string };
type LensSourceMapResponse = { entries?: LensSourceMapEntry[] };
type LensMediaLibraryResponse = LensApiErrorResponse & {
  configured?: boolean;
  assets?: LensMediaAsset[];
};
type LensMediaMutationResponse = LensApiErrorResponse & { asset?: LensMediaAsset };
type LensPlatformCatalogResponse = LensApiErrorResponse & {
  assets?: {
    items?: Array<Record<string, unknown>>;
    pagination?: { total?: number };
    filters?: { imageTypes?: string[]; styles?: string[] };
  };
  templates?: LensPlatformTemplate[];
};
type LensBrandProfileResponse = LensApiErrorResponse & { profile?: Partial<LensBrandProfile> };
type LensFontLibraryResponse = LensApiErrorResponse & {
  configured?: boolean;
  assets?: LensFontAsset[];
};
type LensFontMutationResponse = LensApiErrorResponse & { asset?: LensFontAsset };
type LensRewriteResponse = LensApiErrorResponse & { text?: string };
type PreviewSnapshot = {
  element: HTMLElement;
  styleAttribute: string | null;
  textNodes: Array<{ node: Text; value: string }>;
  image: HTMLImageElement | null;
  imageStyleAttribute: string | null;
  imageSrc: string | null;
  imageSrcset: string | null;
  imageSizes: string | null;
  imageAlt: string | null;
  layoutContainer: HTMLElement | null;
  layoutStyleAttribute: string | null;
  layoutChildren: Array<{ element: HTMLElement; styleAttribute: string | null }>;
};
type LayoutHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};
type LayoutPreviewController = {
  destroy: () => void;
  focus: () => void;
  redo: () => void;
  reset: () => void;
  setAspectLocked: (locked: boolean) => void;
  setPreviewVisible: (visible: boolean) => void;
  undo: () => void;
};

const storageKey = "reggie:lens:session:v1";
const defaultStartPath = "/";
const viewportPresets: Record<LensViewportPreset, { label: string; width: number; height: number }> = {
  desktop: { label: "Desktop", width: 1440, height: 900 },
  tablet: { label: "Tablet", width: 834, height: 1112 },
  mobile: { label: "Mobile", width: 390, height: 844 },
};
const imageFitModes: Array<{ value: ReggieImageFitMode; label: string }> = [
  { value: "preserve_current", label: "Preserve current" },
  { value: "cover", label: "Fill crop" },
  { value: "contain", label: "Fit whole image" },
];
const imageCropFocuses: Array<{ value: ReggieImageCropFocus; label: string }> = [
  { value: "center", label: "Center" },
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "face_or_subject", label: "Face/subject" },
];
const rewriteActions: Array<{ mode: ReggieLensRewriteMode; label: string; actionType: ReggieLensActionType }> = [
  { mode: "rewrite", label: "Rewrite", actionType: "rewrite_copy" },
  { mode: "shorten", label: "Shorter", actionType: "shorten_copy" },
  { mode: "warmer", label: "Warmer", actionType: "make_warmer" },
  { mode: "stronger_cta", label: "Stronger CTA", actionType: "improve_cta" },
];
type LensLayoutPreset = {
  id: ReggieLensLayoutPresetId;
  label: string;
  columns: string;
  gap: string;
  alignItems: ReggieLensStructureChange["preview"]["alignItems"];
  wireframe: number[];
  childPattern?: NonNullable<ReggieLensStructureChange["preview"]["childPattern"]>;
  containerMaxWidth?: string;
  padding?: string;
};
const layoutPresets: LensLayoutPreset[] = [
  { id: "stack_compact", label: "Compact stack", columns: "minmax(0, 1fr)", gap: "12px", alignItems: "stretch", wireframe: [100, 100, 100], childPattern: "uniform" },
  { id: "stack", label: "Stacked", columns: "minmax(0, 1fr)", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "stretch", wireframe: [100, 100, 100], childPattern: "uniform" },
  { id: "stack_airy", label: "Airy stack", columns: "minmax(0, 1fr)", gap: "clamp(28px, 4vw, 48px)", alignItems: "stretch", wireframe: [100, 100, 100], childPattern: "uniform" },
  { id: "split", label: "Balanced split", columns: "repeat(2, minmax(0, 1fr))", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "start", wireframe: [50, 50], childPattern: "rail_selected_left", containerMaxWidth: "1040px" },
  { id: "focus_left", label: "Focus left", columns: "minmax(0, 1.4fr) minmax(0, 0.6fr)", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "start", wireframe: [68, 32], childPattern: "rail_selected_left", containerMaxWidth: "1040px" },
  { id: "focus_right", label: "Focus right", columns: "minmax(0, 0.6fr) minmax(0, 1.4fr)", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "start", wireframe: [32, 68], childPattern: "rail_selected_right", containerMaxWidth: "1040px" },
  { id: "grid_2", label: "Two-card grid", columns: "repeat(2, minmax(0, 1fr))", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "stretch", wireframe: [50, 50, 50, 50], childPattern: "uniform", containerMaxWidth: "1040px" },
  { id: "grid_3", label: "Three-card grid", columns: "repeat(3, minmax(0, 1fr))", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "stretch", wireframe: [33, 33, 33], childPattern: "uniform", containerMaxWidth: "1180px" },
];
const fontWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const emptyBrandProfile: LensBrandProfile = {
  tone: "",
  audience: "",
  ctaStyle: "",
  notes: "",
  approvedPhrases: [],
  forbiddenClaims: [],
  source: "unconfigured",
  updatedAt: "",
};

function getLayoutPresetsForKind(kind: ReggieLensLayoutContextKind) {
  const ids = kind === "split"
    ? new Set<ReggieLensLayoutPresetId>(["stack", "split", "focus_left", "focus_right"])
    : kind === "collection"
      ? new Set<ReggieLensLayoutPresetId>(["stack", "grid_2", "grid_3"])
      : new Set<ReggieLensLayoutPresetId>(["stack_compact", "stack", "stack_airy", "split", "focus_left", "focus_right"]);
  return layoutPresets.filter((preset) => ids.has(preset.id));
}

function presetForPlatformTemplate(template: LensPlatformTemplate, kind: ReggieLensLayoutContextKind): LensLayoutPreset {
  const preset = (id: ReggieLensLayoutPresetId, overrides: Partial<LensLayoutPreset> = {}): LensLayoutPreset => ({
    ...(layoutPresets.find((entry) => entry.id === id) ?? getLayoutPresetsForKind(kind)[0]),
    ...overrides,
    label: template.name,
  });
  const ratioColumns = template.preview.columns.length > 1
    ? template.preview.columns.map((width) => `minmax(0, ${Math.max(1, width)}fr)`).join(" ")
    : undefined;

  switch (template.variant) {
    case "rail":
      return preset("focus_left", { columns: ratioColumns ?? "minmax(0, 0.34fr) minmax(0, 0.66fr)", childPattern: "rail_selected_left" });
    case "narrative":
      return preset("focus_left", { columns: "minmax(0, 0.42fr) minmax(0, 0.58fr)", childPattern: "rail_selected_left", gap: "clamp(28px, 4vw, 52px)" });
    case "pinned":
      return preset("focus_left", { columns: "minmax(0, 0.48fr) minmax(0, 0.52fr)", childPattern: "rail_selected_left", padding: "clamp(12px, 2vw, 24px)" });
    case "command":
      return preset("focus_right", { columns: ratioColumns ?? "minmax(0, 0.66fr) minmax(0, 0.34fr)", childPattern: "rail_selected_right" });
    case "atlas":
      return preset("focus_right", { columns: "minmax(0, 0.56fr) minmax(0, 0.44fr)", childPattern: "rail_selected_right", gap: "clamp(20px, 3vw, 40px)" });
    case "bento":
      return preset("grid_2", { columns: "repeat(2, minmax(0, 1fr))", childPattern: "bento", gap: "clamp(12px, 2vw, 24px)", padding: "clamp(12px, 2vw, 24px)" });
    case "gallery":
      return preset("grid_3", { columns: "repeat(3, minmax(0, 1fr))", childPattern: "uniform" });
    case "reel":
      return preset("grid_3", { columns: "repeat(3, minmax(0, 1fr))", childPattern: "feature_selected", gap: "clamp(12px, 2vw, 24px)" });
    case "bands":
      return preset("split", { columns: "repeat(2, minmax(0, 1fr))", childPattern: "alternating", gap: "clamp(20px, 3vw, 40px)" });
    case "contained":
      return preset("grid_2", { childPattern: "uniform", padding: "clamp(16px, 2.5vw, 32px)" });
    case "editorial":
      return preset("focus_left", { columns: ratioColumns ?? "minmax(0, 0.75fr) minmax(0, 1.25fr)", childPattern: "alternating", gap: "clamp(28px, 4vw, 56px)" });
    case "pavilion":
      return preset("split", { columns: ratioColumns ?? "repeat(2, minmax(0, 1fr))", childPattern: "feature_selected", gap: "clamp(24px, 3.5vw, 48px)", padding: "clamp(12px, 2vw, 24px)" });
    case "cinematic":
      return preset("split", { columns: "repeat(2, minmax(0, 1fr))", childPattern: "feature_selected", gap: "clamp(32px, 5vw, 64px)" });
    case "poster":
      return preset("focus_right", { childPattern: "feature_selected", containerMaxWidth: "960px", padding: "clamp(20px, 4vw, 48px)" });
    case "split":
      return preset("split", { columns: ratioColumns ?? "repeat(2, minmax(0, 1fr))", childPattern: "alternating" });
    case "compact":
      return preset("stack_compact", { containerMaxWidth: "760px" });
    default:
      return preset(kind === "collection" ? "grid_2" : kind === "split" ? "split" : "stack_airy", ratioColumns ? { columns: ratioColumns } : {});
  }
}

function platformTemplatesForKind(templates: LensPlatformTemplate[], kind: ReggieLensLayoutContextKind) {
  const preferred = kind === "collection"
    ? new Set(["bento", "contained", "command", "rail", "bands"])
    : kind === "split"
      ? new Set(["split", "editorial", "pavilion", "gallery", "cinematic"])
      : new Set(["compact", "narrative", "pinned", "poster", "bands"]);
  const ranked = [...templates].sort((left, right) => Number(preferred.has(right.variant)) - Number(preferred.has(left.variant)));
  return ranked.slice(0, 8);
}

export function ReggieLensWorkspace() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const hoverElementRef = useRef<Element | null>(null);
  const selectedElementRef = useRef<Element | null>(null);
  const maskNodesRef = useRef<HTMLDivElement[]>([]);
  const layoutOverlayRef = useRef<HTMLDivElement | null>(null);
  const layoutPreviewControllerRef = useRef<LayoutPreviewController | null>(null);
  const previewSnapshotRef = useRef<PreviewSnapshot | null>(null);
  const previewAnimationFrameRef = useRef<number | null>(null);
  const rewriteRequestRef = useRef(0);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const platformMediaRequestRef = useRef(0);
  const frameCleanupRef = useRef<(() => void) | null>(null);
  const reviewDialogRef = useRef<HTMLDivElement | null>(null);
  const reviewSubmitButtonRef = useRef<HTMLButtonElement | null>(null);
  const [password, setPassword] = useState(() => readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => Boolean(readSavedAdminPassword()));
  const [mode, setMode] = useState<LensMode>("select");
  const [viewportPreset, setViewportPreset] = useState<LensViewportPreset>("desktop");
  const [viewportRotated, setViewportRotated] = useState(false);
  const [zoomPreset, setZoomPreset] = useState<LensZoomPreset>("fit");
  const [canvasAvailableWidth, setCanvasAvailableWidth] = useState(1280);
  const [framePath, setFramePath] = useState(defaultStartPath);
  const [pathInput, setPathInput] = useState(defaultStartPath);
  const [frameLoadKey, setFrameLoadKey] = useState(0);
  const [frameStatus, setFrameStatus] = useState("Preview loading");
  const [session, setSession] = useState<ReggieLensSession>(() => createReggieLensSession(getBrowserHost(), readLensConversationContext()));
  const [sessionStorageReady, setSessionStorageReady] = useState(false);
  const [candidate, setCandidate] = useState<CandidateTarget | null>(null);
  const [sourceMapEntries, setSourceMapEntries] = useState<LensSourceMapEntry[]>([]);
  const [layoutDetailsOpen, setLayoutDetailsOpen] = useState(false);
  const [layoutPreviewVisible, setLayoutPreviewVisible] = useState(true);
  const [layoutAspectLocked, setLayoutAspectLocked] = useState(false);
  const [layoutHistoryState, setLayoutHistoryState] = useState<LayoutHistoryState>({ canUndo: false, canRedo: false });
  const [sidebarTab, setSidebarTab] = useState<LensSidebarTab>("edit");
  const [visualHistory, setVisualHistory] = useState<ReggieLensVisualChange[]>([]);
  const [visualHistoryIndex, setVisualHistoryIndex] = useState(-1);
  const [mediaAssets, setMediaAssets] = useState<LensMediaAsset[]>([]);
  const [mediaSource, setMediaSource] = useState<LensMediaSource>("site");
  const [mediaConfigured, setMediaConfigured] = useState<boolean | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  const [mediaUploadFile, setMediaUploadFile] = useState<File | null>(null);
  const [mediaMessage, setMediaMessage] = useState("");
  const [platformMediaAssets, setPlatformMediaAssets] = useState<LensMediaAsset[]>([]);
  const [platformMediaLoading, setPlatformMediaLoading] = useState(false);
  const [platformMediaMessage, setPlatformMediaMessage] = useState("");
  const [platformMediaType, setPlatformMediaType] = useState("");
  const [platformMediaStyle, setPlatformMediaStyle] = useState("");
  const [platformMediaTypes, setPlatformMediaTypes] = useState<string[]>([]);
  const [platformMediaStyles, setPlatformMediaStyles] = useState<string[]>([]);
  const [platformMediaTotal, setPlatformMediaTotal] = useState(0);
  const [platformTemplates, setPlatformTemplates] = useState<LensPlatformTemplate[]>([]);
  const [platformTemplatesLoading, setPlatformTemplatesLoading] = useState(false);
  const [platformTemplatesMessage, setPlatformTemplatesMessage] = useState("");
  const [fontAssets, setFontAssets] = useState<LensFontAsset[]>([]);
  const [fontsConfigured, setFontsConfigured] = useState<boolean | null>(null);
  const [fontsLoading, setFontsLoading] = useState(false);
  const [fontUploadFile, setFontUploadFile] = useState<File | null>(null);
  const [fontFamily, setFontFamily] = useState("");
  const [fontWeight, setFontWeight] = useState(400);
  const [fontStyle, setFontStyle] = useState<"normal" | "italic">("normal");
  const [fontLicenseName, setFontLicenseName] = useState("");
  const [fontLicenseUrl, setFontLicenseUrl] = useState("");
  const [fontRightsConfirmed, setFontRightsConfirmed] = useState(false);
  const [fontMessage, setFontMessage] = useState("");
  const [fontEditingPublicId, setFontEditingPublicId] = useState("");
  const [fontEditFamily, setFontEditFamily] = useState("");
  const [fontEditWeight, setFontEditWeight] = useState(400);
  const [fontEditStyle, setFontEditStyle] = useState<"normal" | "italic">("normal");
  const [fontEditLicenseName, setFontEditLicenseName] = useState("");
  const [fontEditLicenseUrl, setFontEditLicenseUrl] = useState("");
  const [fontConfirmDeletePublicId, setFontConfirmDeletePublicId] = useState("");
  const [brandProfile, setBrandProfile] = useState<LensBrandProfile>(emptyBrandProfile);
  const [brandApprovedPhrases, setBrandApprovedPhrases] = useState("");
  const [brandForbiddenClaims, setBrandForbiddenClaims] = useState("");
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [brandMessage, setBrandMessage] = useState("");
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriteLoadingMode, setRewriteLoadingMode] = useState<ReggieLensRewriteMode | "">("");
  const [rewriteMessage, setRewriteMessage] = useState("");
  const [popoverPosition, setPopoverPosition] = useState({ left: 24, top: 88 });
  const [note, setNote] = useState("");
  const [replacementImageFile, setReplacementImageFile] = useState<File | null>(null);
  const [replacementImageUrl, setReplacementImageUrl] = useState("");
  const [replacementImageName, setReplacementImageName] = useState("");
  const [replacementImagePrompt, setReplacementImagePrompt] = useState("");
  const [replacementImageStatus, setReplacementImageStatus] = useState("");
  const [imageResizeWidth, setImageResizeWidth] = useState("");
  const [imageResizeHeight, setImageResizeHeight] = useState("");
  const [imageCropAspectRatio, setImageCropAspectRatio] = useState("");
  const [imageCropFocus, setImageCropFocus] = useState<ReggieImageCropFocus>("center");
  const [imageFitMode, setImageFitMode] = useState<ReggieImageFitMode>("preserve_current");
  const [imageEditNotes, setImageEditNotes] = useState("");
  const [actionType, setActionType] = useState<ReggieLensActionType>("rewrite_copy");
  const [priority, setPriority] = useState<ReggieLensPriority>("normal");
  const [editingAnnotationId, setEditingAnnotationId] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState("");
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [packet, setPacket] = useState<ReggieRevisionPacket | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const risk = useMemo(() => computeReggieRisk(session.annotations), [session.annotations]);
  const activeViewport = useMemo(() => {
    const preset = viewportPresets[viewportPreset];
    const canRotate = viewportPreset !== "desktop" && viewportRotated;
    return {
      ...preset,
      width: canRotate ? preset.height : preset.width,
      height: canRotate ? preset.width : preset.height,
      rotated: canRotate,
    };
  }, [viewportPreset, viewportRotated]);
  const shellWidth = activeViewport.width + deviceBorderSize(viewportPreset) * 2;
  const shellHeight = activeViewport.height + 34 + deviceBorderSize(viewportPreset) * 2;
  const canvasScale = useMemo(() => {
    if (zoomPreset === "100") return 1;
    if (zoomPreset === "75") return 0.75;
    return Math.min(1, Math.max(0.25, (canvasAvailableWidth - 48) / shellWidth));
  }, [canvasAvailableWidth, shellWidth, zoomPreset]);
  const groupedAnnotations = useMemo(() => {
    return session.annotations.reduce<Record<string, ReggieLensAnnotation[]>>((groups, annotation) => {
      const key = annotation.pathname || "/";
      groups[key] = groups[key] ?? [];
      groups[key].push(annotation);
      return groups;
    }, {});
  }, [session.annotations]);
  const filteredMediaAssets = useMemo(() => {
    if (mediaSource === "poopsites") return platformMediaAssets;
    const query = mediaSearch.trim().toLowerCase();
    if (!query) return mediaAssets;
    return mediaAssets.filter((asset) => [asset.fileName, asset.displayName, asset.altText, asset.publicId].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [mediaAssets, mediaSearch, mediaSource, platformMediaAssets]);

  useEffect(() => {
    if (!authed || !frameWrapRef.current) return;
    const frameWrap = frameWrapRef.current;
    const updateWidth = () => setCanvasAvailableWidth(Math.max(320, frameWrap.clientWidth));
    updateWidth();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateWidth);
    observer?.observe(frameWrap);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [authed]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as unknown;
      if (isStoredLensSession(parsed)) {
        setSession({ ...parsed, ...readLensConversationContext() });
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      setError("Lens could not restore the saved revision tray in this browser.");
    } finally {
      setSessionStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionStorageReady) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      setError("Lens could not save the revision tray. Browser storage may be unavailable or full.");
    }
  }, [session, sessionStorageReady]);

  useEffect(() => {
    if (!reviewOpen) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const animationFrame = requestAnimationFrame(() => reviewSubmitButtonRef.current?.focus());
    const handleReviewKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setReviewOpen(false);
        setPacket(null);
        return;
      }
      if (event.key !== "Tab" || !reviewDialogRef.current) return;

      const focusable = getFocusableElements(reviewDialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        reviewDialogRef.current.focus();
        return;
      }

      const activeElement = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (activeElement === first || !reviewDialogRef.current.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleReviewKey);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleReviewKey);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }));
    };
  }, [reviewOpen]);

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${password}` }), [password]);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    void fetch(adminApiUrl("/api/admin/reggie-source-map"), { headers: authHeaders(), cache: "no-store" })
      .then((response) => response.ok
        ? response.json() as Promise<LensSourceMapResponse>
        : Promise.reject(new Error("Source map unavailable")))
      .then((data) => {
        if (!cancelled) setSourceMapEntries(Array.isArray(data.entries) ? data.entries : []);
      })
      .catch(() => {
        if (!cancelled) setSourceMapEntries([]);
      });
    return () => { cancelled = true; };
  }, [authHeaders, authed]);

  const loadMediaAssets = useCallback(async (force = false) => {
    if (mediaLoading || (!force && mediaConfigured !== null)) return;
    setMediaLoading(true);
    setMediaMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/media"), { headers: authHeaders() });
      const data = await res.json().catch(() => ({})) as LensMediaLibraryResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load the media library.");
      setMediaConfigured(data.configured === true);
      setMediaAssets(normalizeLensMediaAssets(data.assets));
    } catch (err) {
      setMediaConfigured(false);
      setMediaMessage(err instanceof Error ? err.message : "Could not load the media library.");
    } finally {
      setMediaLoading(false);
    }
  }, [authHeaders, mediaConfigured, mediaLoading]);

  useEffect(() => {
    if (authed && sidebarTab === "media" && mediaSource === "site" && mediaConfigured === null && !mediaLoading) {
      void loadMediaAssets();
    }
  }, [authed, loadMediaAssets, mediaConfigured, mediaLoading, mediaSource, sidebarTab]);

  const loadPlatformMedia = useCallback(async (offset = 0) => {
    const requestId = platformMediaRequestRef.current + 1;
    platformMediaRequestRef.current = requestId;
    setPlatformMediaLoading(true);
    setPlatformMediaMessage("");
    const params = new URLSearchParams({ include: "assets,context", limit: "24", offset: String(offset) });
    if (mediaSearch.trim()) params.set("q", mediaSearch.trim());
    if (platformMediaType) params.set("imageType", platformMediaType);
    if (platformMediaStyle) params.set("style", platformMediaStyle);
    try {
      const res = await fetch(adminApiUrl(`/api/admin/reggie-catalog?${params}`), { headers: authHeaders() });
      const data = await res.json().catch(() => ({})) as LensPlatformCatalogResponse;
      if (!res.ok || !data.assets) throw new Error(data.error ?? "Could not load the PoopSites library.");
      if (requestId !== platformMediaRequestRef.current) return;
      const items = Array.isArray(data.assets.items) ? data.assets.items.map((asset: Record<string, unknown>) => ({
        assetId: String(asset.id ?? ""),
        publicId: `poopsites:${String(asset.id ?? "")}`,
        secureUrl: String(asset.originalUrl ?? ""),
        previewUrl: String(asset.previewUrl ?? asset.originalUrl ?? ""),
        fileName: String(asset.title ?? "PoopSites image"),
        displayName: String(asset.title ?? "PoopSites image"),
        altText: String(asset.altText ?? ""),
        imageType: String(asset.imageType ?? ""),
        styles: Array.isArray(asset.styles) ? asset.styles.filter((value): value is string => typeof value === "string") : [],
        width: typeof asset.width === "number" ? asset.width : undefined,
        height: typeof asset.height === "number" ? asset.height : undefined,
        source: "poopsites" as const,
      })).filter((asset: LensMediaAsset) => asset.assetId && asset.secureUrl) : [];
      setPlatformMediaAssets((current) => offset === 0 ? items : [...current, ...items.filter((asset: LensMediaAsset) => !current.some((entry) => entry.assetId === asset.assetId))]);
      setPlatformMediaTotal(Number(data.assets.pagination?.total ?? items.length));
      setPlatformMediaTypes(Array.isArray(data.assets.filters?.imageTypes) ? data.assets.filters.imageTypes : []);
      setPlatformMediaStyles(Array.isArray(data.assets.filters?.styles) ? data.assets.filters.styles : []);
    } catch (err) {
      if (requestId === platformMediaRequestRef.current) setPlatformMediaMessage(err instanceof Error ? err.message : "Could not load the PoopSites library.");
    } finally {
      if (requestId === platformMediaRequestRef.current) setPlatformMediaLoading(false);
    }
  }, [authHeaders, mediaSearch, platformMediaStyle, platformMediaType]);

  useEffect(() => {
    if (!authed || sidebarTab !== "media" || mediaSource !== "poopsites") return;
    const timer = window.setTimeout(() => void loadPlatformMedia(0), 250);
    return () => window.clearTimeout(timer);
  }, [authed, loadPlatformMedia, mediaSource, sidebarTab]);

  const loadPlatformTemplates = useCallback(async () => {
    if (platformTemplatesLoading || platformTemplates.length > 0) return;
    setPlatformTemplatesLoading(true);
    setPlatformTemplatesMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/reggie-catalog?include=templates,context"), { headers: authHeaders() });
      const data = await res.json().catch(() => ({})) as LensPlatformCatalogResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load PoopSites layouts.");
      setPlatformTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (err) {
      setPlatformTemplatesMessage(err instanceof Error ? err.message : "Could not load PoopSites layouts.");
    } finally {
      setPlatformTemplatesLoading(false);
    }
  }, [authHeaders, platformTemplates.length, platformTemplatesLoading]);

  useEffect(() => {
    if (authed && sidebarTab === "layouts" && platformTemplates.length === 0 && !platformTemplatesLoading && !platformTemplatesMessage) void loadPlatformTemplates();
  }, [authed, loadPlatformTemplates, platformTemplates.length, platformTemplatesLoading, platformTemplatesMessage, sidebarTab]);

  const loadBrandProfile = useCallback(async () => {
    if (brandLoading || brandLoaded) return;
    setBrandLoading(true);
    setBrandMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/reggie-brand-voice"), { headers: authHeaders() });
      const data = await res.json().catch(() => ({})) as LensBrandProfileResponse;
      if (!res.ok || !data.profile) throw new Error(data.error ?? "Could not load the brand voice.");
      const profile = { ...emptyBrandProfile, ...data.profile } as LensBrandProfile;
      setBrandProfile(profile);
      setBrandApprovedPhrases(profile.approvedPhrases.join("\n"));
      setBrandForbiddenClaims(profile.forbiddenClaims.join("\n"));
      setBrandLoaded(true);
    } catch (err) {
      setBrandMessage(err instanceof Error ? err.message : "Could not load the brand voice.");
    } finally {
      setBrandLoading(false);
    }
  }, [authHeaders, brandLoaded, brandLoading]);

  useEffect(() => {
    if (authed && sidebarTab === "brand" && !brandLoaded && !brandLoading && !brandMessage) void loadBrandProfile();
  }, [authed, brandLoaded, brandLoading, brandMessage, loadBrandProfile, sidebarTab]);

  const loadFontAssets = useCallback(async (force = false) => {
    if (fontsLoading || (!force && fontsConfigured !== null)) return;
    setFontsLoading(true);
    setFontMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/fonts"), { headers: authHeaders() });
      const data = await res.json().catch(() => ({})) as LensFontLibraryResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not load uploaded fonts.");
      setFontsConfigured(data.configured === true);
      setFontAssets(Array.isArray(data.assets) ? data.assets.map((asset: LensFontAsset) => ({ ...asset, weight: asset.weight || 400, style: asset.style === "italic" ? "italic" : "normal" })) : []);
    } catch (err) {
      setFontsConfigured(false);
      setFontMessage(err instanceof Error ? err.message : "Could not load uploaded fonts.");
    } finally {
      setFontsLoading(false);
    }
  }, [authHeaders, fontsConfigured, fontsLoading]);

  useEffect(() => {
    if (authed && sidebarTab === "fonts" && fontsConfigured === null && !fontsLoading) {
      void loadFontAssets();
    }
  }, [authed, fontsConfigured, fontsLoading, loadFontAssets, sidebarTab]);

  const scheduleVisualPreview = useCallback((change?: ReggieLensVisualChange) => {
    if (previewAnimationFrameRef.current !== null) cancelAnimationFrame(previewAnimationFrameRef.current);
    previewAnimationFrameRef.current = requestAnimationFrame(() => {
      applyVisualPreview(previewSnapshotRef.current, change);
      previewAnimationFrameRef.current = null;
    });
  }, []);

  const commitVisualChange = useCallback((next: ReggieLensVisualChange) => {
    setCandidate((current) => current ? { ...current, visualChange: next } : current);
    setVisualHistory((current) => [...current.slice(0, visualHistoryIndex + 1), next].slice(-30));
    setVisualHistoryIndex((current) => Math.min(29, current + 1));
    scheduleVisualPreview(next);
  }, [scheduleVisualPreview, visualHistoryIndex]);

  const updateVisualChange = useCallback((update: (current: ReggieLensVisualChange) => ReggieLensVisualChange) => {
    if (!candidate) return;
    commitVisualChange(update(candidate.visualChange ?? {}));
  }, [candidate, commitVisualChange]);

  const undoVisualChange = useCallback(() => {
    if (visualHistoryIndex <= 0) return;
    const nextIndex = visualHistoryIndex - 1;
    const next = visualHistory[nextIndex];
    setVisualHistoryIndex(nextIndex);
    setCandidate((current) => current ? { ...current, visualChange: next } : current);
    scheduleVisualPreview(next);
  }, [scheduleVisualPreview, visualHistory, visualHistoryIndex]);

  const redoVisualChange = useCallback(() => {
    if (visualHistoryIndex >= visualHistory.length - 1) return;
    const nextIndex = visualHistoryIndex + 1;
    const next = visualHistory[nextIndex];
    setVisualHistoryIndex(nextIndex);
    setCandidate((current) => current ? { ...current, visualChange: next } : current);
    scheduleVisualPreview(next);
  }, [scheduleVisualPreview, visualHistory, visualHistoryIndex]);

  const resetVisualChange = useCallback(() => {
    const baseline = visualHistory[0];
    if (!baseline) return;
    commitVisualChange(baseline);
  }, [commitVisualChange, visualHistory]);

  const authenticateLens = useCallback(async (token: string) => {
    const res = await fetch(adminApiUrl("/api/admin/reggie-lens/auth"), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("That password was not accepted. Check it and try again.");
      }
      throw new Error("Reggie Lens could not connect. Please try again.");
    }

    setAuthed(true);
    saveAdminPassword(token);
  }, []);

  useEffect(() => {
    if (authed || password) {
      return;
    }

    const savedPassword = readSavedAdminPassword();
    if (!savedPassword) {
      return;
    }

    setPassword(savedPassword);
    void authenticateLens(savedPassword).catch(() => {
      clearSavedAdminPassword();
      setPassword("");
    });
  }, [authenticateLens, authed, password]);

  const validateLogin = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      await authenticateLens(password);
    } catch (err) {
      clearSavedAdminPassword();
      setError(err instanceof Error ? err.message : "Reggie Lens could not sign in. Please try again.");
    }
  }, [authenticateLens, password]);

  const clearFrameMarks = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const previewSnapshot = previewSnapshotRef.current;
    rewriteRequestRef.current += 1;
    rewriteAbortRef.current?.abort();
    rewriteAbortRef.current = null;
    if (previewAnimationFrameRef.current !== null) {
      cancelAnimationFrame(previewAnimationFrameRef.current);
      previewAnimationFrameRef.current = null;
    }
    layoutPreviewControllerRef.current?.destroy();
    layoutPreviewControllerRef.current = null;
    previewSnapshotRef.current = null;
    layoutOverlayRef.current?.remove();
    layoutOverlayRef.current = null;
    if (isElementNode(hoverElementRef.current)) {
      hoverElementRef.current.style.outline = "";
      hoverElementRef.current.style.outlineOffset = "";
    }
    if (isElementNode(selectedElementRef.current)) {
      selectedElementRef.current.style.outline = "";
      selectedElementRef.current.style.outlineOffset = "";
    }
    restoreVisualPreview(previewSnapshot);
    hoverElementRef.current = null;
    selectedElementRef.current = null;
    for (const node of maskNodesRef.current) {
      node.remove();
    }
    maskNodesRef.current = [];
    setLayoutHistoryState({ canUndo: false, canRedo: false });

    const style = doc?.getElementById("reggie-lens-style");
    style?.remove();
  }, []);

  const loadPreviewPath = useCallback((event: FormEvent) => {
    event.preventDefault();
    const nextPath = pathInput.trim() || "/";
    if (normalizeFramePath(nextPath) === normalizeFramePath(framePath)) {
      clearFrameMarks();
      setCandidate(null);
      setFrameLoadKey((current) => current + 1);
      return;
    }
    setFrameStatus("Preview loading");
    setFramePath(nextPath);
  }, [clearFrameMarks, framePath, pathInput]);

  const installFrameHandlers = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!iframe || !doc || !win) return () => undefined;

    let style = doc.getElementById("reggie-lens-style") as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement("style");
      style.id = "reggie-lens-style";
      style.textContent = `
        [data-reggie-lens-mask="1"] {
          position: fixed;
          z-index: 2147483645;
          background: rgba(0, 0, 0, 0.42);
          pointer-events: none;
        }
        [data-reggie-lens-layout-overlay="1"] {
          position: fixed;
          z-index: 2147483646;
          box-sizing: border-box;
          border: 2px solid #cf4c2f;
          border-radius: 2px;
          background: rgba(207, 76, 47, 0.04);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9), 0 10px 30px rgba(0, 0, 0, 0.12);
          cursor: move;
          touch-action: none;
          user-select: none;
        }
        [data-reggie-lens-layout-overlay="1"]:focus-visible,
        [data-reggie-lens-resize-handle]:focus-visible {
          outline: 3px solid #1f6feb;
          outline-offset: 3px;
        }
        [data-reggie-lens-layout-original="1"] {
          position: fixed;
          z-index: 2147483643;
          box-sizing: border-box;
          border: 2px dashed rgba(25, 25, 25, 0.56);
          background: rgba(255, 255, 255, 0.08);
          pointer-events: none;
        }
        [data-reggie-lens-layout-ghost="1"] {
          position: fixed;
          z-index: 2147483644;
          box-sizing: border-box;
          margin: 0 !important;
          overflow: hidden;
          opacity: 0.62;
          pointer-events: none !important;
          transform: none !important;
          transform-origin: center center;
          contain: layout paint style;
          filter: saturate(0.92);
        }
        [data-reggie-lens-layout-ghost="1"] *,
        [data-reggie-lens-layout-ghost-clone="1"] {
          pointer-events: none !important;
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
        [data-reggie-lens-layout-ghost-clone="1"] {
          position: relative !important;
          inset: auto !important;
          display: block !important;
          box-sizing: border-box !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: none !important;
          height: 100% !important;
          min-height: 0 !important;
          max-height: none !important;
          margin: 0 !important;
          transform: none !important;
          outline: 0 !important;
        }
        [data-reggie-lens-layout-label="1"] {
          position: absolute;
          left: -2px;
          bottom: calc(100% + 6px);
          max-width: min(320px, calc(100vw - 16px));
          padding: 4px 7px;
          border-radius: 4px;
          background: #191919;
          color: #ffffff;
          font: 700 12px/1.25 Arial, sans-serif;
          white-space: nowrap;
          pointer-events: none;
          transform: scale(var(--reggie-lens-editor-inverse-scale, 1));
          transform-origin: bottom left;
        }
        [data-reggie-lens-resize-handle] {
          position: absolute;
          width: 14px;
          height: 14px;
          padding: 0;
          box-sizing: border-box;
          border: 2px solid #ffffff;
          border-radius: 2px;
          background: #cf4c2f;
          transform-origin: center;
        }
        [data-reggie-lens-resize-handle="n"] { left: 50%; top: -8px; transform: translateX(-50%) scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: ns-resize; }
        [data-reggie-lens-resize-handle="ne"] { right: -8px; top: -8px; transform: scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: nesw-resize; }
        [data-reggie-lens-resize-handle="e"] { right: -8px; top: 50%; transform: translateY(-50%) scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: ew-resize; }
        [data-reggie-lens-resize-handle="se"] { right: -8px; bottom: -8px; transform: scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: nwse-resize; }
        [data-reggie-lens-resize-handle="s"] { left: 50%; bottom: -8px; transform: translateX(-50%) scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: ns-resize; }
        [data-reggie-lens-resize-handle="sw"] { left: -8px; bottom: -8px; transform: scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: nesw-resize; }
        [data-reggie-lens-resize-handle="w"] { left: -8px; top: 50%; transform: translateY(-50%) scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: ew-resize; }
        [data-reggie-lens-resize-handle="nw"] { left: -8px; top: -8px; transform: scale(var(--reggie-lens-editor-inverse-scale, 1)); cursor: nwse-resize; }
      `;
      doc.head.appendChild(style);
    }

    const handleHover = (event: MouseEvent) => {
      if (mode === "navigate") return;
      if (isLensOverlayTarget(event.target)) return;
      const target = findLensTarget(event, doc);
      if (!target || target === hoverElementRef.current) return;
      if (isElementNode(hoverElementRef.current) && hoverElementRef.current !== selectedElementRef.current) {
        hoverElementRef.current.style.outline = "";
        hoverElementRef.current.style.outlineOffset = "";
      }
      hoverElementRef.current = target;
      target.style.outline = "2px solid #a7ae2e";
      target.style.outlineOffset = "3px";
    };

    const handleClick = (event: MouseEvent) => {
      if (mode === "navigate") return;
      if (isLensOverlayTarget(event.target)) return;
      const target = findLensTarget(event, doc);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();

      rewriteRequestRef.current += 1;
      rewriteAbortRef.current?.abort();
      rewriteAbortRef.current = null;

      layoutPreviewControllerRef.current?.destroy();
      layoutPreviewControllerRef.current = null;
      if (isElementNode(selectedElementRef.current)) {
        selectedElementRef.current.style.outline = "";
        selectedElementRef.current.style.outlineOffset = "";
      }
      restoreVisualPreview(previewSnapshotRef.current);
      const layoutContainer = findLayoutContainer(target, win);
      previewSnapshotRef.current = capturePreviewSnapshot(target, layoutContainer);
      selectedElementRef.current = target;
      target.style.outline = "3px solid #cf4c2f";
      target.style.outlineOffset = "4px";
      const captured = captureTarget(target, win, layoutContainer, sourceMapEntries);
      const baselineVisualChange: ReggieLensVisualChange = { original: captureOriginalVisualStyle(target, win) };
      captured.visualChange = baselineVisualChange;
      setCandidate(captured);
      setVisualHistory([baselineVisualChange]);
      setVisualHistoryIndex(0);
      setSidebarTab("edit");
      setNote("");
      setReplacementImageFile(null);
      setReplacementImageUrl("");
      setReplacementImageName("");
      setReplacementImagePrompt("");
      setReplacementImageStatus("");
      setImageResizeWidth("");
      setImageResizeHeight("");
      setImageCropAspectRatio("");
      setImageCropFocus("center");
      setImageFitMode("preserve_current");
      setImageEditNotes("");
      setRewriteInstruction("");
      setRewriteLoadingMode("");
      setRewriteMessage("");
      setActionType(mode === "drag" ? "reposition_element" : captured.target.src ? "replace_image" : "rewrite_copy");
      setPriority("normal");
      setEditingAnnotationId("");
      setLayoutDetailsOpen(false);
      setLayoutPreviewVisible(true);
      setLayoutHistoryState({ canUndo: false, canRedo: false });
      setError("");

      if (mode === "drag") {
        const aspectLocked = Boolean(captured.target.src);
        setLayoutAspectLocked(aspectLocked);
        layoutPreviewControllerRef.current = installLayoutOverlay({
          doc,
          win,
          target,
          captured,
          overlayRef: layoutOverlayRef,
          aspectLocked,
          onChange: (layoutChange) => {
            setCandidate((current) => current ? { ...current, layoutChange } : current);
            if (layoutChange) {
              setActionType(layoutChange.kind === "move" ? "reposition_element" : "resize_element");
              setFrameStatus("Preview updated. Keep adjusting or save this change.");
            }
          },
          onHistoryChange: setLayoutHistoryState,
        });
        layoutPreviewControllerRef.current.focus();
      }

      const frameRect = iframe.getBoundingClientRect();
      const scaleX = frameRect.width / Math.max(1, captured.viewport.width);
      const scaleY = frameRect.height / Math.max(1, captured.viewport.height);
      const preferredPopoverTop = frameRect.top + (captured.target.boundingBox.y * scaleY) + 12;
      const maxPopoverTop = Math.max(76, window.innerHeight - 680);
      const maxPopoverLeft = Math.max(12, window.innerWidth - 392);
      setPopoverPosition({
        left: Math.min(maxPopoverLeft, Math.max(12, frameRect.left + (captured.target.boundingBox.x * scaleX) + 12)),
        top: Math.min(maxPopoverTop, Math.max(76, preferredPopoverTop)),
      });
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCandidate(null);
        setNote("");
        clearFrameMarks();
      }
    };

    doc.addEventListener("mousemove", handleHover, true);
    doc.addEventListener("click", handleClick, true);
    doc.addEventListener("keydown", handleKey, true);
    doc.documentElement.dataset.reggieLensReady = "1";
    setFrameStatus(lensReadyStatus(mode));

    return () => {
      doc.removeEventListener("mousemove", handleHover, true);
      doc.removeEventListener("click", handleClick, true);
      doc.removeEventListener("keydown", handleKey, true);
      delete doc.documentElement.dataset.reggieLensReady;
    };
  }, [clearFrameMarks, mode, sourceMapEntries]);

  const activateFrameHandlers = useCallback(() => {
    frameCleanupRef.current?.();
    frameCleanupRef.current = installFrameHandlers();
  }, [installFrameHandlers]);

  const switchViewport = useCallback((nextPreset: LensViewportPreset) => {
    setViewportPreset(nextPreset);
    if (nextPreset === "desktop") {
      setViewportRotated(false);
    }
    clearFrameMarks();
    setCandidate(null);
    setFrameStatus("Preview loading");
    setFrameLoadKey((current) => current + 1);
  }, [clearFrameMarks]);

  const switchMode = useCallback((nextMode: LensMode) => {
    clearFrameMarks();
    setCandidate(null);
    setNote("");
    setLayoutDetailsOpen(false);
    setMode(nextMode);
  }, [clearFrameMarks]);

  const rotateViewport = useCallback(() => {
    if (viewportPreset === "desktop") {
      return;
    }
    setViewportRotated((current) => !current);
    clearFrameMarks();
    setCandidate(null);
    setFrameStatus("Preview loading");
    setFrameLoadKey((current) => current + 1);
  }, [clearFrameMarks, viewportPreset]);

  useEffect(() => {
    if (!authed) return;
    let activeDocument: Document | null = null;
    const attachWhenInteractive = () => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc || doc === activeDocument || doc.readyState === "loading" || doc.URL === "about:blank") return;
      activeDocument = doc;
      activateFrameHandlers();
    };

    attachWhenInteractive();
    const interval = window.setInterval(attachWhenInteractive, 50);
    return () => {
      window.clearInterval(interval);
      frameCleanupRef.current?.();
      frameCleanupRef.current = null;
    };
  }, [activateFrameHandlers, authed, frameLoadKey]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!authed || !doc) return;
    doc.documentElement.style.setProperty("--reggie-lens-editor-inverse-scale", String(1 / Math.max(0.25, canvasScale)));
  }, [authed, canvasScale, frameLoadKey]);

  const uploadReplacementImage = useCallback(async () => {
    if (!replacementImageFile) {
      return {
        uploadedImageUrl: replacementImageUrl,
        uploadedImageName: replacementImageName,
      };
    }

    setReplacementImageStatus("Uploading image...");
    const formData = new FormData();
    formData.append("file", replacementImageFile);
    formData.append("folder", "reggie-lens");

    const res = await fetch(adminApiUrl("/api/admin/media"), {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    const data = await res.json().catch(() => ({})) as LensMediaMutationResponse;
    const asset = normalizeLensMediaAsset(data.asset);
    if (!res.ok || !asset) {
      throw new Error(data.error ?? "Could not upload replacement image.");
    }

    return {
      uploadedImageUrl: asset.secureUrl,
      uploadedImageName: replacementImageFile.name,
    };
  }, [authHeaders, replacementImageFile, replacementImageName, replacementImageUrl]);

  const applyMediaAsset = useCallback((asset: LensMediaAsset) => {
    if (!candidate) return;
    const currentImage = candidate.visualChange?.image;
    updateVisualChange((current) => ({
      ...current,
      image: {
        src: asset.secureUrl,
        assetPublicId: asset.publicId,
        assetName: asset.displayName || asset.fileName,
        alt: asset.altText ?? currentImage?.alt ?? candidate.target.alt ?? "",
        fitMode: currentImage?.fitMode ?? "cover",
        objectPosition: currentImage?.objectPosition ?? "50% 50%",
      },
    }));
    setReplacementImageUrl(asset.secureUrl);
    setReplacementImageName(asset.displayName || asset.fileName);
    setActionType("replace_image");
    setSidebarTab("edit");
    setMediaMessage("Image preview applied. Save the visual edit when it looks right.");
  }, [candidate, updateVisualChange]);

  const uploadMediaAsset = useCallback(async () => {
    if (!mediaUploadFile) return;
    setMediaLoading(true);
    setMediaMessage("Uploading image...");
    try {
      const formData = new FormData();
      formData.append("file", mediaUploadFile);
      formData.append("folder", "reggie-lens");
      const res = await fetch(adminApiUrl("/api/admin/media"), { method: "POST", headers: authHeaders(), body: formData });
      const data = await res.json().catch(() => ({})) as LensMediaMutationResponse;
      const asset = normalizeLensMediaAsset(data.asset);
      if (!res.ok || !asset) throw new Error(data.error ?? "Could not upload image.");
      setMediaAssets((current) => [asset, ...current.filter((entry) => entry.assetId !== asset.assetId)]);
      setMediaUploadFile(null);
      applyMediaAsset(asset);
    } catch (err) {
      setMediaMessage(err instanceof Error ? err.message : "Could not upload image.");
    } finally {
      setMediaLoading(false);
    }
  }, [applyMediaAsset, authHeaders, mediaUploadFile]);

  const rewriteSelectedText = useCallback(async (mode: ReggieLensRewriteMode) => {
    if (!candidate || !canRewriteText(candidate)) return;
    const original = candidate.visualChange?.text?.content || candidate.target.text?.trim() || "";
    if (!original) return;
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = rewriteRequestRef.current + 1;
    const selectedElement = selectedElementRef.current;
    rewriteRequestRef.current = requestId;
    rewriteAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    setRewriteLoadingMode(mode);
    setRewriteMessage("");
    setError("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/reggie-rewrite"), {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: original,
          mode,
          instruction: rewriteInstruction.trim(),
          pagePath: candidate.pathname,
          elementLabel: getAnnotationLabel(candidate as ReggieLensAnnotation),
          sectionContext: candidate.target.parentSummary?.sectionText ?? "",
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({})) as LensRewriteResponse;
      if (requestId !== rewriteRequestRef.current || selectedElementRef.current !== selectedElement) return;
      if (!res.ok || typeof data.text !== "string" || !data.text.trim()) {
        throw new Error(data.error ?? "Reggie did not return usable copy.");
      }
      const nextText = data.text.trim();
      const matchedAction = rewriteActions.find((entry) => entry.mode === mode)?.actionType ?? "rewrite_copy";
      setActionType(matchedAction);
      updateVisualChange((current) => ({
        ...current,
        text: {
          content: nextText,
          original: current.text?.original || candidate.target.text?.trim() || original,
          mode,
          instruction: rewriteInstruction.trim() || undefined,
          source: "reggie",
        },
      }));
      setRewriteMessage("Rewrite previewed on the page. Edit it directly or save the visual edit.");
    } catch (err) {
      if (requestId !== rewriteRequestRef.current || selectedElementRef.current !== selectedElement) return;
      setRewriteMessage(err instanceof DOMException && err.name === "AbortError"
        ? "Reggie took too long to respond. Try again."
        : err instanceof Error ? err.message : "Reggie could not rewrite this text right now.");
    } finally {
      window.clearTimeout(timeout);
      if (requestId === rewriteRequestRef.current) {
        rewriteAbortRef.current = null;
        setRewriteLoadingMode("");
      }
    }
  }, [authHeaders, candidate, rewriteInstruction, updateVisualChange]);

  const updateCopyPreview = useCallback((content: string) => {
    if (!candidate) return;
    setActionType("rewrite_copy");
    updateVisualChange((current) => ({
      ...current,
      text: {
        content,
        original: current.text?.original || candidate.target.text?.trim() || "",
        mode: current.text?.mode ?? "custom",
        instruction: rewriteInstruction.trim() || current.text?.instruction,
        source: "manual",
      },
    }));
  }, [candidate, rewriteInstruction, updateVisualChange]);

  const updateHeadlineStyle = useCallback((updates: NonNullable<ReggieLensVisualChange["headlineStyle"]>) => {
    if (!candidate) return;
    setActionType("change_typography");
    updateVisualChange((current) => ({
      ...current,
      headlineStyle: {
        ...current.headlineStyle,
        ...updates,
      },
    }));
  }, [candidate, updateVisualChange]);

  const applyFontAsset = useCallback(async (asset: LensFontAsset) => {
    if (!candidate || !canEditTypography(candidate)) {
      setFontMessage("Select a text element in the preview before applying a font.");
      return;
    }
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const selectedElement = selectedElementRef.current;
    setFontsLoading(true);
    setFontMessage(`Loading ${asset.family}...`);
    try {
      const source = `url(${JSON.stringify(asset.secureUrl)}) format(${JSON.stringify(asset.format)})`;
      const loaded = await withTimeout(new FontFace(asset.family, source, { weight: String(asset.weight || 400), style: asset.style || "normal" }).load(), 15_000, "Font loading timed out.");
      if (selectedElementRef.current !== selectedElement || !selectedElement?.isConnected) return;
      doc.fonts.add(loaded);
      setActionType("change_typography");
      updateVisualChange((current) => ({
        ...current,
        typography: {
          ...current.typography,
          fontFamily: `${quoteCssFontFamily(asset.family)}, system-ui, sans-serif`,
          fontWeight: asset.weight || 400,
          fontStyle: asset.style || "normal",
          fontAsset: {
            family: asset.family,
            url: asset.secureUrl,
            publicId: asset.publicId,
            fileName: asset.fileName,
            format: asset.format,
            weight: asset.weight || 400,
            style: asset.style || "normal",
            licenseName: asset.licenseName,
            licenseUrl: asset.licenseUrl,
            rightsConfirmedAt: asset.rightsConfirmedAt,
          },
        },
      }));
      setSidebarTab("edit");
      setFontMessage(`${asset.family} is previewing on the selected text.`);
    } catch {
      setFontMessage("This font could not be loaded in the preview. Check the file and try another format.");
    } finally {
      setFontsLoading(false);
    }
  }, [candidate, updateVisualChange]);

  const uploadFontAsset = useCallback(async () => {
    if (!fontUploadFile) return;
    setFontsLoading(true);
    setFontMessage("Uploading font...");
    try {
      const formData = new FormData();
      formData.append("file", fontUploadFile);
      formData.append("family", fontFamily.trim());
      formData.append("weight", String(fontWeight));
      formData.append("style", fontStyle);
      formData.append("licenseName", fontLicenseName.trim());
      formData.append("licenseUrl", fontLicenseUrl.trim());
      formData.append("rightsConfirmed", String(fontRightsConfirmed));
      const res = await fetch(adminApiUrl("/api/admin/fonts"), { method: "POST", headers: authHeaders(), body: formData });
      const data = await res.json().catch(() => ({})) as LensFontMutationResponse;
      if (!res.ok || !data.asset?.secureUrl) throw new Error(data.error ?? "Could not upload this font.");
      const asset = data.asset;
      setFontAssets((current) => [asset, ...current.filter((entry) => entry.assetId !== asset.assetId)]);
      setFontUploadFile(null);
      setFontFamily("");
      setFontWeight(400);
      setFontStyle("normal");
      setFontLicenseName("");
      setFontLicenseUrl("");
      setFontRightsConfirmed(false);
      setFontMessage(`${asset.family} was added to the font library.`);
      if (candidate && canEditTypography(candidate)) await applyFontAsset(asset);
    } catch (err) {
      setFontMessage(err instanceof Error ? err.message : "Could not upload this font.");
    } finally {
      setFontsLoading(false);
    }
  }, [applyFontAsset, authHeaders, candidate, fontFamily, fontLicenseName, fontLicenseUrl, fontRightsConfirmed, fontStyle, fontUploadFile, fontWeight]);

  const beginFontEdit = useCallback((asset: LensFontAsset) => {
    setFontEditingPublicId(asset.publicId);
    setFontEditFamily(asset.family);
    setFontEditWeight(asset.weight || 400);
    setFontEditStyle(asset.style === "italic" ? "italic" : "normal");
    setFontEditLicenseName(asset.licenseName || "");
    setFontEditLicenseUrl(asset.licenseUrl || "");
    setFontConfirmDeletePublicId("");
    setFontMessage("");
  }, []);

  const saveFontMetadata = useCallback(async () => {
    if (!fontEditingPublicId) return;
    setFontsLoading(true);
    setFontMessage("Saving font details...");
    try {
      const res = await fetch(adminApiUrl("/api/admin/fonts"), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          publicId: fontEditingPublicId,
          family: fontEditFamily.trim(),
          weight: fontEditWeight,
          style: fontEditStyle,
          licenseName: fontEditLicenseName.trim(),
          licenseUrl: fontEditLicenseUrl.trim(),
        }),
      });
      const data = await res.json().catch(() => ({})) as LensFontMutationResponse;
      if (!res.ok || !data.asset) throw new Error(data.error ?? "Could not update this font.");
      setFontAssets((current) => current.map((asset) => asset.publicId === fontEditingPublicId ? { ...asset, ...data.asset } : asset));
      setFontEditingPublicId("");
      setFontMessage("Font details saved.");
    } catch (err) {
      setFontMessage(err instanceof Error ? err.message : "Could not update this font.");
    } finally {
      setFontsLoading(false);
    }
  }, [authHeaders, fontEditFamily, fontEditLicenseName, fontEditLicenseUrl, fontEditStyle, fontEditWeight, fontEditingPublicId]);

  const deleteFontAsset = useCallback(async (asset: LensFontAsset) => {
    if (fontConfirmDeletePublicId !== asset.publicId) {
      setFontConfirmDeletePublicId(asset.publicId);
      setFontMessage(`Choose Delete again to remove ${asset.family}.`);
      return;
    }
    setFontsLoading(true);
    try {
      const res = await fetch(adminApiUrl("/api/admin/fonts"), {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: asset.publicId }),
      });
      const data = await res.json().catch(() => ({})) as LensApiErrorResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not delete this font.");
      setFontAssets((current) => current.filter((entry) => entry.publicId !== asset.publicId));
      setFontEditingPublicId("");
      setFontConfirmDeletePublicId("");
      setFontMessage(`${asset.family} was removed from the font library.`);
    } catch (err) {
      setFontMessage(err instanceof Error ? err.message : "Could not delete this font.");
    } finally {
      setFontsLoading(false);
    }
  }, [authHeaders, fontConfirmDeletePublicId]);

  const saveBrandVoice = useCallback(async () => {
    setBrandLoading(true);
    setBrandMessage("Saving brand voice...");
    try {
      const payload = {
        ...brandProfile,
        approvedPhrases: splitEditorLines(brandApprovedPhrases),
        forbiddenClaims: splitEditorLines(brandForbiddenClaims),
      };
      const res = await fetch(adminApiUrl("/api/admin/reggie-brand-voice"), {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({})) as LensBrandProfileResponse;
      if (!res.ok || !data.profile) throw new Error(data.error ?? "Could not save the brand voice.");
      setBrandProfile({ ...emptyBrandProfile, ...data.profile });
      setBrandMessage("Brand voice saved. Reggie will use it for future rewrites.");
      setBrandLoaded(true);
    } catch (err) {
      setBrandMessage(err instanceof Error ? err.message : "Could not save the brand voice.");
    } finally {
      setBrandLoading(false);
    }
  }, [authHeaders, brandApprovedPhrases, brandForbiddenClaims, brandProfile]);

  const applyLayoutPreset = useCallback((preset: LensLayoutPreset, platformTemplate?: LensPlatformTemplate) => {
    const layoutContext = candidate?.target.layoutContext;
    if (!candidate || !layoutContext) return;
    setActionType("redesign_layout");
    updateVisualChange((current) => ({
      ...current,
      structure: {
        presetId: preset.id,
        label: preset.label,
        target: {
          tagName: layoutContext.tagName,
          label: layoutContext.label,
          selector: layoutContext.selector,
          domPath: layoutContext.domPath,
          directChildCount: layoutContext.directChildCount,
          kind: layoutContext.kind,
        },
        preview: {
          display: "grid",
          columns: preset.columns,
          mobileColumns: "minmax(0, 1fr)",
          gap: preset.gap,
          alignItems: preset.alignItems,
          childPattern: preset.childPattern,
          containerMaxWidth: preset.containerMaxWidth,
          padding: preset.padding,
        },
        platformTemplate: platformTemplate ? {
          id: platformTemplate.id,
          name: platformTemplate.name,
          variant: platformTemplate.variant,
          signature: platformTemplate.signature,
          fit: platformTemplate.fit,
          mobileTransformation: platformTemplate.mobileTransformation,
        } : undefined,
      },
    }));
    setFrameStatus(`${platformTemplate?.name || preset.label} preview applied.`);
    setRewriteMessage("");
  }, [candidate, updateVisualChange]);

  const saveAnnotation = useCallback(async () => {
    const trimmed = note.trim();
    const imagePrompt = replacementImagePrompt.trim();
    const isImageAction = actionType === "replace_image" || actionType === "adjust_image";
    const imageEdit = buildImageEdit({
      resizeWidth: imageResizeWidth,
      resizeHeight: imageResizeHeight,
      cropAspectRatio: imageCropAspectRatio,
      cropFocus: imageCropFocus,
      fitMode: imageFitMode,
      notes: imageEditNotes,
    });
    if (!candidate) {
      return;
    }

    const hasLayoutChange = Boolean(candidate.layoutChange);
    const hasVisualChange = hasAppliedVisualChange(candidate.visualChange);
    if (!trimmed && !hasLayoutChange && !hasVisualChange && (!isImageAction || (!replacementImageFile && !replacementImageUrl && !imagePrompt && !imageEdit))) {
      setError(mode === "drag"
        ? "Move or resize the selected element before saving, or add details that explain the intended layout."
        : isImageAction
          ? "Add a note, upload an image, write an image prompt, or set crop/resize details before saving."
          : "Write a note before saving.");
      return;
    }

    const now = new Date().toISOString();
    let imageReplacement: ReggieLensAnnotation["imageReplacement"];
    try {
      if (isImageAction) {
        const uploaded = await uploadReplacementImage();
        imageReplacement = {
          uploadedImageUrl: uploaded.uploadedImageUrl || undefined,
          uploadedImageName: uploaded.uploadedImageName || undefined,
          prompt: imagePrompt || undefined,
          edit: imageEdit,
        };
        if (!imageReplacement.uploadedImageUrl && !imageReplacement.prompt && !imageReplacement.edit) {
          imageReplacement = undefined;
        }
      }

      const annotation: ReggieLensAnnotation = {
        ...candidate,
        id: editingAnnotationId || makeReggieId("annotation"),
        note: trimmed || defaultVisualNote(candidate.visualChange) || defaultLayoutNote(candidate.layoutChange) || defaultImageNote(imageReplacement),
        actionType,
        priority,
        imageReplacement,
        createdAt: editingAnnotationId
          ? session.annotations.find((entry) => entry.id === editingAnnotationId)?.createdAt ?? now
          : now,
      };

      setSession((current) => ({
        ...current,
        updatedAt: now,
        annotations: editingAnnotationId
          ? current.annotations.map((entry) => entry.id === editingAnnotationId ? annotation : entry)
          : [...current.annotations, annotation],
      }));

      setCandidate(null);
      setNote("");
      setReplacementImageFile(null);
      setReplacementImageUrl("");
      setReplacementImageName("");
      setReplacementImagePrompt("");
      setReplacementImageStatus("");
      setImageResizeWidth("");
      setImageResizeHeight("");
      setImageCropAspectRatio("");
      setImageCropFocus("center");
      setImageFitMode("preserve_current");
      setImageEditNotes("");
      setRewriteInstruction("");
      setRewriteLoadingMode("");
      setRewriteMessage("");
      setEditingAnnotationId("");
      setLayoutDetailsOpen(false);
      setVisualHistory([]);
      setVisualHistoryIndex(-1);
      clearFrameMarks();
      setFrameStatus(lensReadyStatus(mode));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the image replacement note.");
      setReplacementImageStatus("");
    }
  }, [actionType, candidate, clearFrameMarks, editingAnnotationId, imageCropAspectRatio, imageCropFocus, imageEditNotes, imageFitMode, imageResizeHeight, imageResizeWidth, mode, note, priority, replacementImageFile, replacementImagePrompt, replacementImageUrl, session.annotations, uploadReplacementImage]);

  const editAnnotation = useCallback((annotation: ReggieLensAnnotation) => {
    setCandidate(annotation);
    setNote(annotation.note);
    setReplacementImageFile(null);
    setReplacementImageUrl(annotation.imageReplacement?.uploadedImageUrl ?? "");
    setReplacementImageName(annotation.imageReplacement?.uploadedImageName ?? "");
    setReplacementImagePrompt(annotation.imageReplacement?.prompt ?? "");
    setReplacementImageStatus("");
    setImageResizeWidth(annotation.imageReplacement?.edit?.resizeWidth ? String(annotation.imageReplacement.edit.resizeWidth) : "");
    setImageResizeHeight(annotation.imageReplacement?.edit?.resizeHeight ? String(annotation.imageReplacement.edit.resizeHeight) : "");
    setImageCropAspectRatio(annotation.imageReplacement?.edit?.cropAspectRatio ?? "");
    setImageCropFocus(annotation.imageReplacement?.edit?.cropFocus ?? "center");
    setImageFitMode(annotation.imageReplacement?.edit?.fitMode ?? "preserve_current");
    setImageEditNotes(annotation.imageReplacement?.edit?.notes ?? "");
    setRewriteInstruction(annotation.visualChange?.text?.instruction ?? "");
    setRewriteLoadingMode("");
    setRewriteMessage("");
    setActionType(annotation.actionType);
    setPriority(annotation.priority);
    setEditingAnnotationId(annotation.id);
    setLayoutDetailsOpen(true);
    setVisualHistory(annotation.visualChange ? [annotation.visualChange] : []);
    setVisualHistoryIndex(annotation.visualChange ? 0 : -1);
    setPopoverPosition({ left: 24, top: 92 });
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setSession((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      annotations: current.annotations.filter((entry) => entry.id !== id),
    }));
    setConfirmingDeleteId("");
  }, []);

  const jumpToAnnotation = useCallback((annotation: ReggieLensAnnotation) => {
    const nextPath = annotation.pathname || "/";
    setPathInput(nextPath);
    setFramePath(nextPath);
    switchMode("navigate");
  }, [switchMode]);

  const openReview = useCallback(() => {
    if (session.annotations.length === 0) {
      setError("Save at least one change before opening review.");
      return;
    }
    setError("");
    setPacket(buildReggieRevisionPacket({ id: `packet-${session.sessionId}`, annotations: session.annotations, title: `Visual revision for ${getBrowserHost()}`, conversationId: session.conversationId, conversationMessageId: session.conversationMessageId }));
    setReviewOpen(true);
  }, [session.annotations, session.conversationId, session.conversationMessageId, session.sessionId]);

  const submitPacket = useCallback(async () => {
    if (!packet) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const res = await withTimeout(fetch(adminApiUrl("/api/admin/reggie-mission"), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: packet.title,
          targetPath: packet.affectedPages[0] ?? "/",
          notes: `Reggie Lens packet ${packet.id}. Risk: ${packet.riskLevel}.`,
          prompt: packet.codexPrompt,
          requestedBy: "reggie-lens",
          idempotencyKey: packet.id,
          metadata: {
            title: packet.title,
            targetPath: packet.affectedPages[0] ?? "/",
            notes: `Reggie Lens packet ${packet.id}. Risk: ${packet.riskLevel}.`,
            revisionPacketId: packet.id,
            inputContext: {
              kind: "reggie_lens",
              schemaVersion: 1,
              conversationId: packet.conversationId || null,
              conversationMessageId: packet.conversationMessageId || null,
            },
            revisionAnnotations: packet.originalNotes.map((annotation) => ({
              id: annotation.id,
              page: annotation.pathname || "/",
              label: getAnnotationLabel(annotation),
              actionType: annotation.actionType,
              selector: annotation.target.selector,
              domPath: annotation.target.domPath,
              text: annotation.target.text,
              alt: annotation.target.alt,
              src: annotation.target.src,
              viewport: annotation.viewport,
              scroll: annotation.scroll,
              boundingBox: annotation.target.boundingBox,
              layoutSelector: annotation.visualChange?.structure?.target.selector || annotation.target.layoutContext?.selector,
              layoutBoundingBox: annotation.target.layoutContext?.boundingBox,
              replacementText: annotation.visualChange?.text?.content,
              headlineStyle: annotation.visualChange?.headlineStyle,
              replacementImageUrl: annotation.imageReplacement?.uploadedImageUrl || annotation.visualChange?.image?.src,
              replacementImageName: annotation.imageReplacement?.uploadedImageName || annotation.visualChange?.image?.assetName,
              replacementImagePrompt: annotation.imageReplacement?.prompt,
              imageFitMode: annotation.visualChange?.image?.fitMode,
              imageObjectPosition: annotation.visualChange?.image?.objectPosition,
              source: annotation.target.source,
            })),
          },
        }),
      }), 30_000, "Reggie did not respond within 30 seconds. Try again; your saved changes are still here.");

      const data = await res.json().catch(() => ({})) as LensApiErrorResponse;
      if (!res.ok) {
        setError(data.error ?? "Could not submit the Lens revision.");
        return;
      }

      localStorage.removeItem(storageKey);
      setSession(createReggieLensSession(getBrowserHost(), {
        conversationId: session.conversationId,
        conversationMessageId: session.conversationMessageId,
      }));
      setReviewOpen(false);
      setPacket(null);
      setMessage("Changes sent to Reggie. Track progress in the Revision Queue.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reggie could not be reached. Check your connection and try again; your saved changes are still here.");
    } finally {
      setSubmitting(false);
    }
  }, [authHeaders, packet, session.conversationId, session.conversationMessageId]);

  if (!authed) {
    return (
      <main className={styles.page}>
        <form className={styles.login} onSubmit={validateLogin}>
          <h1>Reggie Lens</h1>
          <p className={styles.muted}>Open your website in a visual workspace, preview changes, and review them before anything goes live.</p>
          <input className={styles.visuallyHidden} type="text" name="username" autoComplete="username" value="admin" readOnly tabIndex={-1} aria-hidden="true" />
          <label className={styles.field}>
            Admin password
            <input className={styles.input} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <div className={styles.row}>
            <button className={styles.button} type="submit">Enter Lens</button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.brand}>
            <strong>Reggie Lens</strong>
            <span>Preview changes here. Your live site stays unchanged until publishing.</span>
          </div>
          <div className={styles.modeGroup} aria-label="Lens mode">
            <button className={`${styles.modeButton} ${mode === "select" ? styles.activeMode : ""}`} type="button" onClick={() => switchMode("select")}>Edit</button>
            <button className={`${styles.modeButton} ${mode === "drag" ? styles.activeMode : ""}`} type="button" onClick={() => switchMode("drag")}>Move &amp; Resize</button>
            <button className={`${styles.modeButton} ${mode === "navigate" ? styles.activeMode : ""}`} type="button" onClick={() => switchMode("navigate")}>Browse</button>
          </div>
          <div className={styles.modeGroup} aria-label="Preview viewport">
            {(Object.keys(viewportPresets) as LensViewportPreset[]).map((presetKey) => (
              <button
                className={`${styles.modeButton} ${viewportPreset === presetKey ? styles.activeMode : ""}`}
                type="button"
                onClick={() => switchViewport(presetKey)}
                key={presetKey}
              >
                {viewportPresets[presetKey].label}
              </button>
            ))}
            <button className={styles.modeButton} type="button" onClick={rotateViewport} disabled={viewportPreset === "desktop"}>
              Rotate
            </button>
          </div>
          <div className={styles.modeGroup} aria-label="Canvas zoom">
            {(["fit", "75", "100"] as LensZoomPreset[]).map((zoom) => (
              <button className={`${styles.modeButton} ${zoomPreset === zoom ? styles.activeMode : ""}`} type="button" onClick={() => setZoomPreset(zoom)} key={zoom}>
                {zoom === "fit" ? `Fit (${Math.round(canvasScale * 100)}%)` : `${zoom}%`}
              </button>
            ))}
          </div>
          <span className={styles.count}>{session.annotations.length} changes</span>
          <span className={riskClassName(risk.riskLevel, styles)}>{risk.riskLevel} risk</span>
        </div>
        <div className={styles.toolbarRight}>
          <form className={styles.pathForm} onSubmit={loadPreviewPath}>
            <input className={styles.input} value={pathInput} onChange={(event) => setPathInput(event.target.value)} aria-label="Page path" />
            <button className={styles.secondaryButton} type="submit">Go</button>
          </form>
          <span className={styles.status}>{frameStatus}</span>
          <button className={styles.secondaryButton} type="button" onClick={openReview}>Review Changes</button>
          <button className={styles.secondaryButton} type="button" onClick={() => switchMode(mode === "navigate" ? "select" : "navigate")}>{mode === "navigate" ? "Edit Page" : "Browse Page"}</button>
          <a className={styles.secondaryButton} href="/admin">Exit Lens</a>
        </div>
      </div>

      <div className={styles.workspace}>
        <div ref={frameWrapRef} className={styles.frameWrap}>
          <div className={styles.deviceStage}>
            <div
              className={styles.deviceScaler}
              style={{
                width: `${Math.round(shellWidth * canvasScale)}px`,
                height: `${Math.round(shellHeight * canvasScale)}px`,
              }}
            >
              <div
                className={`${styles.deviceShell} ${styles[`device-${viewportPreset}`]}`}
                style={{
                  width: `${shellWidth}px`,
                  height: `${shellHeight}px`,
                  transform: `scale(${canvasScale})`,
                }}
              >
                <div className={styles.deviceBar}>
                  <span>{activeViewport.label}{activeViewport.rotated ? " landscape" : ""}</span>
                  <span>{activeViewport.width} x {activeViewport.height}</span>
                </div>
                <iframe
                  ref={iframeRef}
                  className={styles.frame}
                  src={normalizeFramePath(framePath)}
                  title="Reggie Lens site preview"
                  onLoad={() => {
                    const handlersReady = iframeRef.current?.contentDocument?.documentElement.dataset.reggieLensReady === "1";
                    if (!handlersReady) {
                      clearFrameMarks();
                      setCandidate(null);
                      setFrameStatus("Preview loading");
                      try {
                        iframeRef.current?.contentWindow?.scrollTo(0, 0);
                      } catch {
                        // Same-origin previews should allow this; ignore browser edge cases.
                      }
                    }
                    setFrameLoadKey((current) => current + 1);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <aside className={styles.tray} data-reggie-lens-tray="true">
          <div className={styles.sidebarHeader}>
            <div>
              <h2 className={styles.panelTitle}>Lens Editor</h2>
              <p className={styles.muted}>{candidate ? getAnnotationLabel(candidate as ReggieLensAnnotation) : "Select an element in the preview."}</p>
            </div>
            <div className={styles.sidebarTabs} role="tablist" aria-label="Lens editor panels">
              {(["edit", "layouts", "media", "brand", "fonts", "notes"] as LensSidebarTab[]).map((tab) => (
                <button
                  className={`${styles.sidebarTab} ${sidebarTab === tab ? styles.activeSidebarTab : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === tab}
                  disabled={tab === "layouts" && !candidate?.target.layoutContext}
                  title={tab === "layouts" && !candidate?.target.layoutContext ? "Select a section or multi-item container to use layout presets" : undefined}
                  onClick={() => setSidebarTab(tab)}
                  key={tab}
                >
                  {tab === "edit" ? "Edit" : tab === "layouts" ? "Layouts" : tab === "media" ? "Media" : tab === "brand" ? "Brand" : tab === "fonts" ? "Fonts" : `Changes (${session.annotations.length})`}
                </button>
              ))}
            </div>
          </div>
          {message ? <p className={styles.notice}>{message}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}

          {sidebarTab === "edit" ? (
            candidate ? (
              mode === "drag" && !editingAnnotationId ? (
                <div className={styles.editorPanel}>
                  <div className={styles.editorToolbar} aria-label="Layout history">
                    <button className={styles.iconTextButton} type="button" onClick={() => layoutPreviewControllerRef.current?.undo()} disabled={!layoutHistoryState.canUndo} title="Undo layout change">Undo</button>
                    <button className={styles.iconTextButton} type="button" onClick={() => layoutPreviewControllerRef.current?.redo()} disabled={!layoutHistoryState.canRedo} title="Redo layout change">Redo</button>
                    <button className={styles.iconTextButton} type="button" onClick={() => layoutPreviewControllerRef.current?.reset()} disabled={!candidate.layoutChange} title="Restore original size and position">Reset</button>
                  </div>

                  <section className={styles.controlSection}>
                    <div className={styles.controlSectionHeader}>
                      <h3>Layout</h3>
                      <span className={styles.previewBadge}>{candidate.layoutChange ? "Changed" : "Original"}</span>
                    </div>
                    <div className={styles.layoutMetrics} aria-label="Preview dimensions and position">
                      <div><span>Position</span><strong>{Math.round((candidate.layoutChange?.proposed ?? candidate.target.boundingBox).x)}, {Math.round((candidate.layoutChange?.proposed ?? candidate.target.boundingBox).y)}</strong></div>
                      <div><span>Size</span><strong>{Math.round((candidate.layoutChange?.proposed ?? candidate.target.boundingBox).width)} x {Math.round((candidate.layoutChange?.proposed ?? candidate.target.boundingBox).height)}</strong></div>
                    </div>
                    <div className={styles.compareControl} aria-label="Canvas comparison">
                      <span>Canvas</span>
                      <div className={styles.segmentedControl}>
                        <button className={layoutPreviewVisible ? styles.activeSegment : ""} type="button" onClick={() => { setLayoutPreviewVisible(true); layoutPreviewControllerRef.current?.setPreviewVisible(true); }}>Preview</button>
                        <button className={!layoutPreviewVisible ? styles.activeSegment : ""} type="button" onClick={() => { setLayoutPreviewVisible(false); layoutPreviewControllerRef.current?.setPreviewVisible(false); }}>Original</button>
                      </div>
                    </div>
                    <label className={styles.toggleField}>
                      <input type="checkbox" checked={layoutAspectLocked} onChange={(event) => { const locked = event.target.checked; setLayoutAspectLocked(locked); layoutPreviewControllerRef.current?.setAspectLocked(locked); }} />
                      <span>Lock proportions</span>
                    </label>
                  </section>

                  <div className={styles.editorActions}>
                    <button className={styles.button} type="button" disabled={!candidate.layoutChange} onClick={() => void saveAnnotation()}>Save Layout Change</button>
                    <button className={styles.secondaryButton} type="button" onClick={() => setLayoutDetailsOpen(true)}>Add Details</button>
                  </div>
                </div>
              ) : (
              <div className={styles.editorPanel}>
                <div className={`${styles.editorToolbar} ${styles.visualEditorToolbar}`} aria-label="Preview history and save">
                  <button className={styles.iconTextButton} type="button" onClick={undoVisualChange} disabled={visualHistoryIndex <= 0} title="Undo preview change">Undo</button>
                  <button className={styles.iconTextButton} type="button" onClick={redoVisualChange} disabled={visualHistoryIndex >= visualHistory.length - 1} title="Redo preview change">Redo</button>
                  <button className={styles.iconTextButton} type="button" onClick={resetVisualChange} disabled={!hasAppliedVisualChange(candidate.visualChange)} title="Reset selected element">Reset</button>
                  <button className={`${styles.iconTextButton} ${styles.quickSaveButton}`} type="button" onClick={() => void saveAnnotation()} disabled={!hasAppliedVisualChange(candidate.visualChange)} title="Save visual edit">Save</button>
                </div>

                {canRewriteText(candidate) ? (
                  <section className={styles.controlSection}>
                    <div className={styles.controlSectionHeader}>
                      <h3>Copy</h3>
                      <span className={styles.previewBadge}>{candidate.visualChange?.text ? "Rewritten" : "Original"}</span>
                    </div>
                    <label className={styles.field}>Preview text
                      <textarea
                        className={`${styles.textarea} ${styles.copyTextarea}`}
                        aria-label="Preview text"
                        value={candidate.visualChange?.text?.content ?? candidate.target.text ?? ""}
                        onChange={(event) => updateCopyPreview(event.target.value)}
                      />
                    </label>
                    <div className={styles.rewriteActions} aria-label="Quick rewrite options">
                      {rewriteActions.map((entry) => (
                        <button
                          className={styles.rewriteButton}
                          type="button"
                          disabled={Boolean(rewriteLoadingMode)}
                          onClick={() => void rewriteSelectedText(entry.mode)}
                          key={entry.mode}
                        >
                          {rewriteLoadingMode === entry.mode ? "Writing..." : entry.label}
                        </button>
                      ))}
                    </div>
                    <label className={styles.field}>Feedback for Reggie
                      <textarea
                        className={styles.textarea}
                        value={rewriteInstruction}
                        maxLength={500}
                        onChange={(event) => setRewriteInstruction(event.target.value)}
                        placeholder="Optional: keep the local tone, mention weekly service, and avoid exclamation points."
                      />
                    </label>
                    <button className={styles.secondaryButton} type="button" disabled={!rewriteInstruction.trim() || Boolean(rewriteLoadingMode)} onClick={() => void rewriteSelectedText("custom")}>
                      {rewriteLoadingMode === "custom" ? "Writing..." : "Rewrite with Feedback"}
                    </button>
                    {rewriteMessage ? <p className={styles.notice} aria-live="polite">{rewriteMessage}</p> : null}
                  </section>
                ) : null}

                {candidate.target.src ? (
                  <section className={styles.controlSection}>
                    <div className={styles.controlSectionHeader}>
                      <h3>Image</h3>
                      <button className={styles.secondaryButton} type="button" onClick={() => setSidebarTab("media")}>Replace</button>
                    </div>
                    {candidate.visualChange?.image?.src ? (
                      <>
                        {/* Dynamic admin media can come from any site-configured host. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className={styles.selectedImagePreview} src={candidate.visualChange.image.src} alt="Selected replacement preview" loading="lazy" decoding="async" />
                      </>
                    ) : null}
                    <div className={styles.grid2}>
                      <label className={styles.field}>Fit
                        <select className={styles.select} aria-label="Fit" value={candidate.visualChange?.image?.fitMode ?? "cover"} onChange={(event) => updateVisualChange((current) => ({ ...current, image: { ...current.image!, src: current.image?.src || candidate.target.src || "", fitMode: event.target.value as "cover" | "contain" | "fill" } }))}>
                          <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Stretch</option>
                        </select>
                      </label>
                      <label className={styles.field}>Focus
                        <select className={styles.select} aria-label="Focus" value={candidate.visualChange?.image?.objectPosition ?? "50% 50%"} onChange={(event) => updateVisualChange((current) => ({ ...current, image: { ...current.image!, src: current.image?.src || candidate.target.src || "", objectPosition: event.target.value } }))}>
                          <option value="50% 50%">Center</option><option value="50% 0%">Top</option><option value="100% 50%">Right</option><option value="50% 100%">Bottom</option><option value="0% 50%">Left</option>
                        </select>
                      </label>
                    </div>
                    <label className={styles.field}>Alt text
                      <input className={styles.input} aria-label="Alt text" value={candidate.visualChange?.image?.alt ?? candidate.target.alt ?? ""} onChange={(event) => updateVisualChange((current) => ({ ...current, image: { ...current.image!, src: current.image?.src || candidate.target.src || "", alt: event.target.value } }))} />
                    </label>
                  </section>
                ) : null}

                {canEditTypography(candidate) ? (
                  <section className={styles.controlSection}>
                    <h3>Typography</h3>
                    <label className={styles.field}>Font
                      <select className={styles.select} aria-label="Font" value={candidate.visualChange?.typography?.fontFamily ?? ""} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, fontFamily: event.target.value || undefined } })); }}>
                        <option value="">Current font</option>
                        <option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option><option value="Verdana, sans-serif">Verdana</option><option value="'Trebuchet MS', sans-serif">Trebuchet</option><option value="'Times New Roman', serif">Times New Roman</option><option value="system-ui, sans-serif">System UI</option>
                      </select>
                    </label>
                    <button className={styles.secondaryButton} type="button" onClick={() => setSidebarTab("fonts")}>Upload or Choose Font</button>
                    <div className={styles.grid2}>
                      <label className={styles.field}>Size
                        <input className={styles.input} aria-label="Size" type="number" min="8" max="240" value={candidate.visualChange?.typography?.fontSize ?? candidate.visualChange?.original?.fontSize ?? 16} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, fontSize: clampNumberInput(event.target.value, 8, 240) } })); }} />
                      </label>
                      <label className={styles.field}>Weight
                        <select className={styles.select} aria-label="Weight" value={candidate.visualChange?.typography?.fontWeight ?? candidate.visualChange?.original?.fontWeight ?? 400} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, fontWeight: Number(event.target.value) } })); }}>
                          {[300, 400, 500, 600, 700, 800, 900].map((weight) => <option value={weight} key={weight}>{weight}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className={styles.grid2}>
                      <label className={styles.field}>Line height
                        <input className={styles.input} aria-label="Line height" type="number" min="0.8" max="3" step="0.05" value={candidate.visualChange?.typography?.lineHeight ?? candidate.visualChange?.original?.lineHeight ?? 1.2} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, lineHeight: clampNumberInput(event.target.value, 0.8, 3) } })); }} />
                      </label>
                      <label className={styles.field}>Color
                        <input className={styles.colorInput} aria-label="Color" type="color" value={normalizeColorForInput(candidate.visualChange?.typography?.color ?? candidate.visualChange?.original?.color)} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, color: event.target.value } })); }} />
                      </label>
                    </div>
                    <div className={styles.grid2}>
                      <label className={styles.field}>Alignment
                        <select className={styles.select} aria-label="Alignment" value={candidate.visualChange?.typography?.textAlign ?? normalizeTextAlign(candidate.visualChange?.original?.textAlign)} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, textAlign: event.target.value as "left" | "center" | "right" } })); }}>
                          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                        </select>
                      </label>
                      <label className={styles.field}>Style
                        <select className={styles.select} aria-label="Font style" value={candidate.visualChange?.typography?.fontStyle ?? "normal"} onChange={(event) => { setActionType("change_typography"); updateVisualChange((current) => ({ ...current, typography: { ...current.typography, fontStyle: event.target.value === "italic" ? "italic" : "normal" } })); }}>
                          <option value="normal">Normal</option><option value="italic">Italic</option>
                        </select>
                      </label>
                    </div>
                    {candidate.target.tagName === "H1" ? (
                      <div className={styles.headlineSplitBox}>
                        <div className={styles.controlSectionHeader}>
                          <h4>Headline split</h4>
                          <span className={styles.previewBadge}>{candidate.visualChange?.headlineStyle ? "Custom" : "Optional"}</span>
                        </div>
                        <label className={styles.field}>Large line text
                          <input className={styles.input} value={candidate.visualChange?.headlineStyle?.largeText ?? ""} onChange={(event) => updateHeadlineStyle({ largeText: event.target.value })} placeholder="Main headline words" />
                        </label>
                        <label className={styles.field}>Small line text
                          <input className={styles.input} value={candidate.visualChange?.headlineStyle?.smallText ?? ""} onChange={(event) => updateHeadlineStyle({ smallText: event.target.value })} placeholder="Supporting headline words" />
                        </label>
                        <div className={styles.grid2}>
                          <label className={styles.field}>Large size
                            <input className={styles.input} type="number" min="12" max="180" value={candidate.visualChange?.headlineStyle?.largeSize ?? ""} onChange={(event) => updateHeadlineStyle({ largeSize: optionalNumberInput(event.target.value, 12, 180) })} placeholder="px" />
                          </label>
                          <label className={styles.field}>Small size
                            <input className={styles.input} type="number" min="10" max="120" value={candidate.visualChange?.headlineStyle?.smallSize ?? ""} onChange={(event) => updateHeadlineStyle({ smallSize: optionalNumberInput(event.target.value, 10, 120) })} placeholder="px" />
                          </label>
                        </div>
                        <div className={styles.grid2}>
                          <label className={styles.field}>Large weight
                            <select className={styles.select} value={candidate.visualChange?.headlineStyle?.largeWeight ?? ""} onChange={(event) => updateHeadlineStyle({ largeWeight: optionalNumberInput(event.target.value, 100, 900) })}>
                              <option value="">Current</option>
                              {fontWeights.map((weight) => <option value={weight} key={`large-${weight}`}>{weight}</option>)}
                            </select>
                          </label>
                          <label className={styles.field}>Small weight
                            <select className={styles.select} value={candidate.visualChange?.headlineStyle?.smallWeight ?? ""} onChange={(event) => updateHeadlineStyle({ smallWeight: optionalNumberInput(event.target.value, 100, 900) })}>
                              <option value="">Current</option>
                              {fontWeights.map((weight) => <option value={weight} key={`small-${weight}`}>{weight}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className={styles.field}>Small line position
                          <select className={styles.select} value={candidate.visualChange?.headlineStyle?.smallPosition ?? "below"} onChange={(event) => updateHeadlineStyle({ smallPosition: event.target.value === "above" ? "above" : "below" })}>
                            <option value="below">Below large line</option>
                            <option value="above">Above large line</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className={styles.editorActions}>
                  <button className={styles.button} type="button" disabled={!hasAppliedVisualChange(candidate.visualChange)} onClick={() => void saveAnnotation()}>Save Visual Edit</button>
                  <button className={styles.secondaryButton} type="button" onClick={() => setLayoutDetailsOpen(true)}>Add Revision Note</button>
                </div>
              </div>
              )
            ) : <div className={styles.emptyPanel}><strong>{mode === "drag" ? "Choose an element to reposition" : mode === "navigate" ? "Browsing is active" : "Choose an element to edit"}</strong><span>{mode === "navigate" ? "Switch to Edit or Move & Resize when you reach the area you need." : "Select the element directly in the page preview."}</span></div>
          ) : null}

          {sidebarTab === "layouts" ? (
            candidate?.target.layoutContext ? (
              <div className={styles.editorPanel}>
                <div className={styles.layoutContextHeader}>
                  <strong>{candidate.target.layoutContext.label || "Selected container"}</strong>
                  <span>{candidate.target.layoutContext.directChildCount} items</span>
                </div>
                <div className={styles.layoutPresetGrid} aria-label="Layout presets">
                  {getLayoutPresetsForKind(candidate.target.layoutContext.kind).map((preset) => (
                    <button
                      className={`${styles.layoutPresetButton} ${candidate.visualChange?.structure?.presetId === preset.id ? styles.activeLayoutPreset : ""}`}
                      type="button"
                      aria-pressed={candidate.visualChange?.structure?.presetId === preset.id}
                      onClick={() => applyLayoutPreset(preset)}
                      key={preset.id}
                    >
                      <span className={`${styles.wireframe} ${styles[`wireframe-${preset.id}`]}`} aria-hidden="true">
                        {preset.wireframe.map((width, index) => <i style={{ flexBasis: `${width}%` }} key={`${preset.id}-${index}`} />)}
                      </span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.panelSectionHeader}>
                  <strong>PoopSites systems</strong>
                  <span>Section patterns</span>
                </div>
                {platformTemplatesLoading ? <p className={styles.muted}>Loading layouts...</p> : null}
                {platformTemplatesMessage ? (
                  <div className={styles.emptyPanel}>
                    <strong>Layouts unavailable</strong>
                    <span>{platformTemplatesMessage}</span>
                    <button className={styles.secondaryButton} type="button" onClick={() => { setPlatformTemplatesMessage(""); void loadPlatformTemplates(); }}>Retry</button>
                  </div>
                ) : null}
                <div className={styles.platformTemplateGrid} aria-label="PoopSites section systems">
                  {platformTemplatesForKind(platformTemplates, candidate.target.layoutContext.kind).map((template) => {
                    const active = candidate.visualChange?.structure?.platformTemplate?.id === template.id;
                    return (
                      <button
                        className={`${styles.platformTemplateButton} ${active ? styles.activeLayoutPreset : ""}`}
                        type="button"
                        aria-pressed={active}
                        onClick={() => applyLayoutPreset(presetForPlatformTemplate(template, candidate.target.layoutContext!.kind), template)}
                        key={template.id}
                      >
                        <span className={styles.platformWireframe} aria-hidden="true">
                          <span>{template.preview.columns.map((width, index) => <i style={{ flexBasis: `${width}%` }} key={`${template.id}-column-${index}`} />)}</span>
                          <span>{template.preview.blocks.slice(0, 4).map((height, index) => <i style={{ height: `${Math.max(5, Math.round(height / 8))}px` }} key={`${template.id}-block-${index}`} />)}</span>
                        </span>
                        <span><strong>{template.name}</strong><small>{template.fit}</small></span>
                      </button>
                    );
                  })}
                </div>
                {candidate.visualChange?.structure ? (
                  <div className={styles.layoutSelectionSummary}>
                    <strong>{candidate.visualChange.structure.platformTemplate?.name || candidate.visualChange.structure.label}</strong>
                    <span>Mobile: stacked</span>
                  </div>
                ) : null}
                <div className={styles.editorActions}>
                  <button className={styles.button} type="button" disabled={!candidate.visualChange?.structure} onClick={() => void saveAnnotation()}>Save Layout</button>
                  <button className={styles.secondaryButton} type="button" onClick={() => setSidebarTab("edit")}>Back to Edit</button>
                </div>
              </div>
            ) : <div className={styles.emptyPanel}><strong>No layout container selected</strong><span>Select a section or a group with multiple items.</span></div>
          ) : null}

          {sidebarTab === "media" ? (
            <div className={styles.editorPanel}>
              <div className={styles.sourceControl} aria-label="Media source">
                <button className={mediaSource === "site" ? styles.activeSegment : ""} type="button" onClick={() => setMediaSource("site")}>Site uploads</button>
                <button className={mediaSource === "poopsites" ? styles.activeSegment : ""} type="button" onClick={() => setMediaSource("poopsites")}>PoopSites library</button>
              </div>
              {mediaSource === "site" ? (
                <div className={styles.uploadPanel}>
                  <input className={styles.fileInput} aria-label="Upload image" type="file" accept="image/*" onChange={(event) => setMediaUploadFile(event.target.files?.[0] ?? null)} />
                  <button className={styles.button} type="button" disabled={!mediaUploadFile || mediaLoading || !candidate?.target.src} onClick={() => void uploadMediaAsset()}>{mediaLoading && mediaUploadFile ? "Uploading..." : "Upload and Use"}</button>
                </div>
              ) : null}
              <input className={styles.input} aria-label="Search images" type="search" placeholder={mediaSource === "site" ? "Search site uploads" : "Search PoopSites images"} value={mediaSearch} onChange={(event) => setMediaSearch(event.target.value)} />
              {mediaSource === "poopsites" ? (
                <div className={styles.grid2}>
                  <label className={styles.field}>Image type
                    <select className={styles.select} value={platformMediaType} onChange={(event) => setPlatformMediaType(event.target.value)}>
                      <option value="">All types</option>
                      {platformMediaTypes.map((value) => <option value={value} key={value}>{humanizeLabel(value)}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}>Style
                    <select className={styles.select} value={platformMediaStyle} onChange={(event) => setPlatformMediaStyle(event.target.value)}>
                      <option value="">All styles</option>
                      {platformMediaStyles.map((value) => <option value={value} key={value}>{humanizeLabel(value)}</option>)}
                    </select>
                  </label>
                </div>
              ) : null}
              {mediaMessage ? <p className={styles.notice}>{mediaMessage}</p> : null}
              {platformMediaMessage && mediaSource === "poopsites" ? <div className={styles.emptyPanel}><strong>PoopSites library unavailable</strong><span>{platformMediaMessage}</span><button className={styles.secondaryButton} type="button" onClick={() => void loadPlatformMedia(0)}>Retry</button></div> : null}
              {((mediaSource === "site" && mediaLoading && mediaAssets.length === 0) || (mediaSource === "poopsites" && platformMediaLoading && platformMediaAssets.length === 0)) ? <p className={styles.muted}>Loading media...</p> : null}
              {mediaSource === "site" && mediaConfigured === false && !mediaLoading ? <div className={styles.emptyPanel}><strong>Site uploads unavailable</strong><span>Cloudinary is not connected for this site.</span><button className={styles.secondaryButton} type="button" onClick={() => { setMediaConfigured(null); void loadMediaAssets(true); }}>Retry</button></div> : null}
              <div className={styles.mediaGrid}>
                {filteredMediaAssets.map((asset) => (
                  <button className={styles.mediaTile} type="button" onClick={() => applyMediaAsset(asset)} disabled={!candidate?.target.src} title={candidate?.target.src ? `Use ${asset.displayName || asset.fileName}` : "Select an image in the preview first"} key={asset.assetId || asset.publicId}>
                    {/* Dynamic admin media can come from any site-configured host. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.previewUrl || asset.secureUrl} alt={asset.altText || asset.displayName || asset.fileName} loading="lazy" decoding="async" />
                    <span>{asset.displayName || asset.fileName}</span>
                    <small>{asset.source === "poopsites" ? humanizeLabel(asset.imageType || "PoopSites") : asset.width && asset.height ? `${asset.width} x ${asset.height}` : "Site upload"}</small>
                  </button>
                ))}
              </div>
              {mediaSource === "poopsites" && platformMediaAssets.length < platformMediaTotal ? (
                <button className={styles.secondaryButton} type="button" disabled={platformMediaLoading} onClick={() => void loadPlatformMedia(platformMediaAssets.length)}>
                  {platformMediaLoading ? "Loading..." : `Load more (${platformMediaAssets.length} of ${platformMediaTotal})`}
                </button>
              ) : null}
            </div>
          ) : null}

          {sidebarTab === "brand" ? (
            <div className={styles.editorPanel}>
              <div className={styles.panelSectionHeader}>
                <strong>Brand voice</strong>
                <span>{brandProfile.source === "poopsites-platform" ? "PoopSites intake" : brandProfile.source === "manual" ? "Custom" : "Not configured"}</span>
              </div>
              {brandLoading && !brandLoaded ? <p className={styles.muted}>Loading brand voice...</p> : null}
              {brandMessage ? <p className={styles.notice} aria-live="polite">{brandMessage}</p> : null}
              {!brandLoaded && brandMessage ? <button className={styles.secondaryButton} type="button" onClick={() => { setBrandMessage(""); void loadBrandProfile(); }}>Retry</button> : null}
              {brandLoaded ? (
                <>
                  <label className={styles.field}>Tone
                    <input className={styles.input} value={brandProfile.tone} maxLength={160} onChange={(event) => setBrandProfile((current) => ({ ...current, tone: event.target.value }))} placeholder="Friendly, local, direct" />
                  </label>
                  <label className={styles.field}>Audience
                    <textarea className={styles.textarea} value={brandProfile.audience} maxLength={240} onChange={(event) => setBrandProfile((current) => ({ ...current, audience: event.target.value }))} />
                  </label>
                  <label className={styles.field}>CTA style
                    <input className={styles.input} value={brandProfile.ctaStyle} maxLength={160} onChange={(event) => setBrandProfile((current) => ({ ...current, ctaStyle: event.target.value }))} placeholder="Clear and low-friction" />
                  </label>
                  <label className={styles.field}>Voice notes
                    <textarea className={styles.textarea} value={brandProfile.notes} maxLength={1200} onChange={(event) => setBrandProfile((current) => ({ ...current, notes: event.target.value }))} />
                  </label>
                  <label className={styles.field}>Preferred phrases
                    <textarea className={styles.textarea} value={brandApprovedPhrases} onChange={(event) => setBrandApprovedPhrases(event.target.value)} placeholder="One phrase per line" />
                  </label>
                  <label className={styles.field}>Claims to avoid
                    <textarea className={styles.textarea} value={brandForbiddenClaims} onChange={(event) => setBrandForbiddenClaims(event.target.value)} placeholder="One claim per line" />
                  </label>
                  <button className={styles.button} type="button" disabled={brandLoading} onClick={() => void saveBrandVoice()}>{brandLoading ? "Saving..." : "Save Brand Voice"}</button>
                </>
              ) : null}
            </div>
          ) : null}

          {sidebarTab === "fonts" ? (
            <div className={styles.editorPanel}>
              <div className={styles.fontUploadPanel}>
                <label className={styles.field}>Font file
                  <input
                    className={styles.fileInput}
                    aria-label="Upload font file"
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setFontUploadFile(file);
                      if (file) setFontFamily(deriveFontFamily(file.name));
                      setFontMessage("");
                    }}
                  />
                </label>
                <label className={styles.field}>Family name
                  <input className={styles.input} value={fontFamily} maxLength={64} onChange={(event) => setFontFamily(event.target.value)} placeholder="Example: Acme Sans" />
                </label>
                <div className={styles.grid2}>
                  <label className={styles.field}>Weight
                    <select className={styles.select} value={fontWeight} onChange={(event) => setFontWeight(Number(event.target.value))}>
                      {fontWeights.map((weight) => <option value={weight} key={weight}>{weight}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}>Style
                    <select className={styles.select} value={fontStyle} onChange={(event) => setFontStyle(event.target.value === "italic" ? "italic" : "normal")}>
                      <option value="normal">Normal</option><option value="italic">Italic</option>
                    </select>
                  </label>
                </div>
                <label className={styles.field}>License name
                  <input className={styles.input} value={fontLicenseName} maxLength={120} onChange={(event) => setFontLicenseName(event.target.value)} placeholder="Commercial license" />
                </label>
                <label className={styles.field}>License link
                  <input className={styles.input} type="url" value={fontLicenseUrl} maxLength={500} onChange={(event) => setFontLicenseUrl(event.target.value)} placeholder="https://" />
                </label>
                <label className={styles.toggleField}>
                  <input type="checkbox" checked={fontRightsConfirmed} onChange={(event) => setFontRightsConfirmed(event.target.checked)} />
                  <span>I have permission to use this font.</span>
                </label>
                <button className={styles.button} type="button" disabled={!fontUploadFile || !fontFamily.trim() || !fontRightsConfirmed || fontsLoading} onClick={() => void uploadFontAsset()}>
                  {fontsLoading && fontUploadFile ? "Uploading..." : candidate && canEditTypography(candidate) ? "Upload and Use" : "Upload Font"}
                </button>
              </div>
              {fontMessage ? <p className={styles.notice} aria-live="polite">{fontMessage}</p> : null}
              {fontsLoading && fontAssets.length === 0 ? <p className={styles.muted}>Loading fonts...</p> : null}
              {fontsConfigured === false && !fontsLoading ? <div className={styles.emptyPanel}><strong>Font library unavailable</strong><span>Connect the media library before uploading fonts.</span><button className={styles.secondaryButton} type="button" onClick={() => { setFontsConfigured(null); void loadFontAssets(true); }}>Retry</button></div> : null}
              <div className={styles.fontList}>
                {fontAssets.map((asset) => (
                  <article className={styles.fontManagerRow} key={asset.assetId || asset.publicId}>
                    <div className={styles.fontManagerSummary}>
                      <button className={styles.fontTile} type="button" onClick={() => void applyFontAsset(asset)} disabled={!candidate || !canEditTypography(candidate) || fontsLoading} title={`Use ${asset.family}`}>
                        <span className={styles.fontPreviewMark} aria-hidden="true">Aa</span>
                        <span><strong>{asset.family}</strong><small>{asset.weight || 400} {asset.style || "normal"}{asset.bytes ? ` - ${formatFileSize(asset.bytes)}` : ""}</small></span>
                      </button>
                      <button className={styles.iconTextButton} type="button" onClick={() => beginFontEdit(asset)}>Manage</button>
                    </div>
                    {fontEditingPublicId === asset.publicId ? (
                      <div className={styles.fontEditor}>
                        <label className={styles.field}>Family name
                          <input className={styles.input} value={fontEditFamily} maxLength={64} onChange={(event) => setFontEditFamily(event.target.value)} />
                        </label>
                        <div className={styles.grid2}>
                          <label className={styles.field}>Weight
                            <select className={styles.select} value={fontEditWeight} onChange={(event) => setFontEditWeight(Number(event.target.value))}>
                              {fontWeights.map((weight) => <option value={weight} key={weight}>{weight}</option>)}
                            </select>
                          </label>
                          <label className={styles.field}>Style
                            <select className={styles.select} value={fontEditStyle} onChange={(event) => setFontEditStyle(event.target.value === "italic" ? "italic" : "normal")}>
                              <option value="normal">Normal</option><option value="italic">Italic</option>
                            </select>
                          </label>
                        </div>
                        <label className={styles.field}>License name
                          <input className={styles.input} value={fontEditLicenseName} maxLength={120} onChange={(event) => setFontEditLicenseName(event.target.value)} />
                        </label>
                        <label className={styles.field}>License link
                          <input className={styles.input} type="url" value={fontEditLicenseUrl} maxLength={500} onChange={(event) => setFontEditLicenseUrl(event.target.value)} placeholder="https://" />
                        </label>
                        {asset.rightsConfirmedAt ? <span className={styles.metadataLine}>Rights confirmed {formatShortDate(asset.rightsConfirmedAt)}</span> : <span className={styles.metadataLine}>Legacy font - confirm licensing before reuse.</span>}
                        <div className={styles.editorActions}>
                          <button className={styles.button} type="button" disabled={!fontEditFamily.trim() || fontsLoading} onClick={() => void saveFontMetadata()}>Save</button>
                          <button className={styles.secondaryButton} type="button" onClick={() => { setFontEditingPublicId(""); setFontConfirmDeletePublicId(""); }}>Cancel</button>
                          <button className={styles.dangerButton} type="button" disabled={fontsLoading} onClick={() => void deleteFontAsset(asset)}>{fontConfirmDeletePublicId === asset.publicId ? "Confirm Delete" : "Delete"}</button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {sidebarTab === "notes" ? (
            <>
              <div className={styles.noteList}>
                {session.annotations.length === 0 ? <div className={styles.emptyPanel}><strong>No saved changes</strong><span>Saved visual and layout changes will appear here.</span></div> : session.annotations.map((annotation) => (
                  <article className={styles.noteCard} key={annotation.id}>
                    <strong>{getAnnotationLabel(annotation)}</strong>
                    <div className={styles.noteMeta}><span className={styles.pill}>{annotation.pathname || "/"}</span><span className={styles.pill}>{getReggieLensActionLabel(annotation.actionType)}</span><span className={styles.pill}>{annotation.priority}</span></div>
                    <p>{annotation.note}</p>
                    {annotation.layoutChange ? <p className={styles.layoutSummary}>{formatLayoutChangeSummary(annotation.layoutChange)}</p> : null}
                    {annotation.visualChange ? <p className={styles.layoutSummary}>{formatVisualChangeSummary(annotation.visualChange)}</p> : null}
                    <div className={styles.row}>
                      <button className={styles.secondaryButton} type="button" onClick={() => editAnnotation(annotation)}>Edit</button>
                      <button className={styles.secondaryButton} type="button" onClick={() => jumpToAnnotation(annotation)}>View</button>
                      {confirmingDeleteId === annotation.id ? (
                        <>
                          <button className={styles.dangerButton} type="button" onClick={() => deleteAnnotation(annotation.id)}>Confirm Delete</button>
                          <button className={styles.secondaryButton} type="button" onClick={() => setConfirmingDeleteId("")}>Cancel</button>
                        </>
                      ) : <button className={styles.dangerButton} type="button" onClick={() => setConfirmingDeleteId(annotation.id)}>Delete</button>}
                    </div>
                  </article>
                ))}
              </div>
              <div className={styles.row}>
                <button className={styles.button} type="button" onClick={openReview} disabled={session.annotations.length === 0}>Review Changes</button>
                {confirmingClearAll ? (
                  <>
                    <button className={styles.dangerButton} type="button" onClick={() => {
                      setSession(createReggieLensSession(getBrowserHost(), {
                        conversationId: session.conversationId,
                        conversationMessageId: session.conversationMessageId,
                      }));
                      setConfirmingClearAll(false);
                    }}>Confirm Clear All</button>
                    <button className={styles.secondaryButton} type="button" onClick={() => setConfirmingClearAll(false)}>Cancel</button>
                  </>
                ) : <button className={styles.dangerButton} type="button" onClick={() => setConfirmingClearAll(true)} disabled={session.annotations.length === 0}>Clear All</button>}
              </div>
            </>
          ) : null}
        </aside>
      </div>

      {candidate && mode === "drag" && !layoutDetailsOpen && !editingAnnotationId ? (
        <div className={styles.layoutDock} role="region" aria-label="Selected layout change">
          <div>
            <strong>{candidate.layoutChange ? formatLayoutChangeSummary(candidate.layoutChange) : getAnnotationLabel(candidate as ReggieLensAnnotation)}</strong>
            <span>{candidate.layoutChange ? "Preview ready to save" : "Selected for layout editing"}</span>
          </div>
          <div className={styles.row}>
            {candidate.layoutChange ? <button className={styles.button} type="button" onClick={() => void saveAnnotation()}>Save Change</button> : null}
            <button className={styles.secondaryButton} type="button" onClick={() => setLayoutDetailsOpen(true)}>Add Details</button>
            <button className={styles.secondaryButton} type="button" onClick={() => { setCandidate(null); setNote(""); setLayoutDetailsOpen(false); clearFrameMarks(); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {candidate && (layoutDetailsOpen || Boolean(editingAnnotationId)) ? (
        <div className={styles.popover} style={{ left: popoverPosition.left, top: popoverPosition.top }}>
          <div className={styles.popoverBody}>
            <h2>{editingAnnotationId ? "Edit note" : candidate.layoutChange ? "Confirm layout change" : "What should Reggie change here?"}</h2>
            <p className={styles.muted}>{getAnnotationLabel(candidate as ReggieLensAnnotation)}</p>
            {mode === "drag" && !candidate.layoutChange ? <p className={styles.layoutHint}>Layout preview active. The selected element is still at its original size and position.</p> : null}
            {candidate.layoutChange ? (
              <div className={styles.layoutSummary}>
                <strong>{formatLayoutChangeSummary(candidate.layoutChange)}</strong>
                <span>Captured at {candidate.viewport.width} x {candidate.viewport.height}. Reggie will preserve responsive layout at other sizes.</span>
              </div>
            ) : null}
            <label className={styles.field}>
              Note
              <textarea className={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Example: Make this headline warmer and mention veteran-owned without making it longer." />
            </label>
            <div className={styles.grid2}>
              <label className={styles.field}>
                Action
                <select className={styles.select} value={actionType} onChange={(event) => setActionType(event.target.value as ReggieLensActionType)}>
                  {reggieLensActionTypes.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                Priority
                <select className={styles.select} value={priority} onChange={(event) => setPriority(event.target.value as ReggieLensPriority)}>
                  {reggieLensPriorities.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}
                </select>
              </label>
            </div>
            {isVagueLensNote(note) ? <p className={styles.error}>This sounds vague. Pick a specific action or add what kind of improvement you mean.</p> : null}
            {(actionType === "replace_image" || actionType === "adjust_image") ? (
              <div className={styles.imageReplaceBox}>
              {actionType === "replace_image" ? (
                <>
                  <label className={styles.field}>
                    Upload replacement image
                    <input
                      className={styles.fileInput}
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setReplacementImageFile(file);
                        setReplacementImageName(file?.name ?? replacementImageName);
                        setReplacementImageStatus("");
                      }}
                    />
                  </label>
                  {replacementImageName ? <p className={styles.muted}>Selected: {replacementImageName}</p> : null}
                  {replacementImageUrl ? <p className={styles.muted}>Uploaded URL: {replacementImageUrl}</p> : null}
                </>
              ) : null}
              <label className={styles.field}>
                Or prompt an image
                <textarea
                  className={styles.textarea}
                  value={replacementImagePrompt}
                  onChange={(event) => setReplacementImagePrompt(event.target.value)}
                  placeholder="Example: Photorealistic team member beside a branded service truck in natural light, friendly and trustworthy."
                />
              </label>
              <div className={styles.grid2}>
                <label className={styles.field}>
                  Target width
                  <input className={styles.input} inputMode="numeric" placeholder="px" value={imageResizeWidth} onChange={(event) => setImageResizeWidth(cleanNumberInput(event.target.value))} />
                </label>
                <label className={styles.field}>
                  Target height
                  <input className={styles.input} inputMode="numeric" placeholder="px" value={imageResizeHeight} onChange={(event) => setImageResizeHeight(cleanNumberInput(event.target.value))} />
                </label>
              </div>
              <div className={styles.grid2}>
                <label className={styles.field}>
                  Crop ratio
                  <select className={styles.select} value={imageCropAspectRatio} onChange={(event) => setImageCropAspectRatio(event.target.value)}>
                    <option value="">Preserve current</option>
                    <option value="1:1">Square 1:1</option>
                    <option value="4:3">Standard 4:3</option>
                    <option value="3:2">Photo 3:2</option>
                    <option value="16:9">Wide 16:9</option>
                    <option value="21:9">Hero wide 21:9</option>
                    <option value="3:4">Portrait 3:4</option>
                    <option value="4:5">Social portrait 4:5</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Crop focus
                  <select className={styles.select} value={imageCropFocus} onChange={(event) => setImageCropFocus(event.target.value as ReggieImageCropFocus)}>
                    {imageCropFocuses.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}
                  </select>
                </label>
              </div>
              <label className={styles.field}>
                Fit mode
                <select className={styles.select} value={imageFitMode} onChange={(event) => setImageFitMode(event.target.value as ReggieImageFitMode)}>
                  {imageFitModes.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                Crop or resize notes
                <textarea
                  className={styles.textarea}
                  value={imageEditNotes}
                  onChange={(event) => setImageEditNotes(event.target.value)}
                  placeholder="Example: Keep the face visible, crop tighter on mobile, and make this image match the height of the card beside it."
                />
              </label>
              <p className={styles.muted}>Use upload when you have the exact image. Use crop and resize when the current image is right but the framing or dimensions need work.</p>
              {replacementImageStatus ? <p className={styles.notice}>{replacementImageStatus}</p> : null}
              </div>
            ) : null}
          </div>
          <div className={`${styles.row} ${styles.popoverActions}`}>
            <button className={styles.button} type="button" onClick={() => void saveAnnotation()}>{candidate.layoutChange ? "Save Layout Change" : "Save Note"}</button>
            {mode === "drag" && !editingAnnotationId ? <button className={styles.secondaryButton} type="button" onClick={() => setLayoutDetailsOpen(false)}>Keep Adjusting</button> : null}
            <button className={styles.secondaryButton} type="button" onClick={() => { setCandidate(null); setNote(""); setLayoutDetailsOpen(false); setReplacementImageFile(null); setReplacementImageUrl(""); setReplacementImageName(""); setReplacementImagePrompt(""); setReplacementImageStatus(""); setImageResizeWidth(""); setImageResizeHeight(""); setImageCropAspectRatio(""); setImageCropFocus("center"); setImageFitMode("preserve_current"); setImageEditNotes(""); clearFrameMarks(); }}>Cancel</button>
          </div>
        </div>
      ) : null}

      {reviewOpen && packet ? (
        <div ref={reviewDialogRef} className={styles.reviewOverlay} role="dialog" aria-modal="true" aria-labelledby="reggie-review-title" aria-describedby="reggie-review-description" tabIndex={-1}>
          <div className={styles.review}>
            <div className={styles.reviewHeader}>
              <h2 id="reggie-review-title" className={styles.reviewTitle}>Review Changes</h2>
              <p id="reggie-review-description" className={styles.muted}>Confirm the requested updates before sending them to Reggie. Your live site remains unchanged.</p>
            </div>
            <div className={styles.reviewBody}>
              <div className={styles.row}>
                <span className={riskClassName(packet.riskLevel, styles)}>{packet.riskLevel} risk</span>
                <span className={styles.pill}>{packet.originalNotes.length} changes</span>
                <span className={styles.pill}>{packet.affectedPages.length} pages</span>
              </div>
              <p>{packet.interpretedGoal}</p>
              {packet.riskLevel === "high" ? <p className={styles.error}>High-risk revision. Require explicit review before publish.</p> : null}

              {Object.entries(groupedAnnotations).map(([page, annotations]) => (
                <section className={styles.pageGroup} key={page}>
                  <h3>{page}</h3>
                  {annotations.map((annotation, index) => (
                    <article className={styles.noteCard} key={annotation.id}>
                      <strong>{index + 1}. {getAnnotationLabel(annotation)}</strong>
                      <p className={styles.muted}>Current: {truncateText(annotation.target.text || annotation.target.alt || "No visible text captured", 180)}</p>
                      {annotation.visualChange?.text ? <p><strong>Replacement:</strong> {annotation.visualChange.text.content}</p> : null}
                      <p>Note: {annotation.note}</p>
                      {annotation.layoutChange ? <p className={styles.layoutSummary}>{formatLayoutChangeSummary(annotation.layoutChange)}</p> : null}
                      {annotation.visualChange ? <p className={styles.layoutSummary}>{formatVisualChangeSummary(annotation.visualChange)}</p> : null}
                      {annotation.visualChange?.headlineStyle ? <p className={styles.layoutSummary}>{formatHeadlineStyleSummary(annotation.visualChange.headlineStyle)}</p> : null}
                      {annotation.imageReplacement?.uploadedImageUrl ? (
                        <>
                          {/* Dynamic admin media can come from any site-configured host. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className={styles.reviewImage} src={annotation.imageReplacement.uploadedImageUrl} alt={annotation.imageReplacement.uploadedImageName || "Selected replacement"} loading="lazy" decoding="async" />
                        </>
                      ) : null}
                      {annotation.imageReplacement?.prompt ? <p className={styles.muted}>Image prompt: {annotation.imageReplacement.prompt}</p> : null}
                      {annotation.imageReplacement?.edit ? <p className={styles.muted}>Image edit: {formatImageEditSummary(annotation.imageReplacement.edit)}</p> : null}
                      <div className={styles.noteMeta}>
                        <span className={styles.pill}>{getReggieLensActionLabel(annotation.actionType)}</span>
                        <span className={styles.pill}>{annotation.priority}</span>
                      </div>
                    </article>
                  ))}
                </section>
              ))}

              <details className={styles.implementationDetails}>
                <summary>Implementation details</summary>
                <p className={styles.muted}>This brief is sent to Reggie with the visual context above.</p>
                <pre className={styles.promptPreview}>{packet.codexPrompt}</pre>
              </details>
            </div>

            <div className={`${styles.row} ${styles.reviewActions}`}>
              {error ? <p className={`${styles.errorBanner} ${styles.reviewActionError}`} role="alert" data-reggie-lens-submit-error="true">{error}</p> : null}
              <button ref={reviewSubmitButtonRef} className={styles.button} type="button" onClick={() => void submitPacket()} disabled={submitting} aria-label="Send Changes to Reggie">
                {submitting ? "Sending..." : error ? "Try Again" : "Send to Reggie"}
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => setReviewOpen(false)}>Edit Changes</button>
              <button className={styles.secondaryButton} type="button" onClick={() => { setReviewOpen(false); setPacket(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function buildImageEdit(params: {
  resizeWidth: string;
  resizeHeight: string;
  cropAspectRatio: string;
  cropFocus: ReggieImageCropFocus;
  fitMode: ReggieImageFitMode;
  notes: string;
}): ReggieImageEdit | undefined {
  const edit: ReggieImageEdit = {
    resizeWidth: parsePositiveInteger(params.resizeWidth),
    resizeHeight: parsePositiveInteger(params.resizeHeight),
    cropAspectRatio: params.cropAspectRatio.trim() || undefined,
    cropFocus: params.cropAspectRatio.trim() || params.notes.trim() ? params.cropFocus : undefined,
    fitMode: params.fitMode !== "preserve_current" ? params.fitMode : undefined,
    notes: params.notes.trim() || undefined,
  };

  return Object.values(edit).some(Boolean) ? edit : undefined;
}

function defaultImageNote(imageReplacement: ReggieLensAnnotation["imageReplacement"]) {
  if (imageReplacement?.uploadedImageUrl) return "Replace this image with the uploaded image.";
  if (imageReplacement?.prompt) return "Replace this image using the image prompt.";
  if (imageReplacement?.edit) return "Adjust this image crop or size.";
  return "";
}

function defaultVisualNote(change?: ReggieLensVisualChange) {
  if (change?.headlineStyle) return "Apply the approved large-line and small-line headline styling.";
  if (change?.text && (change.image || change.typography || change.structure)) return "Apply the approved copy and visual preview.";
  if (change?.text) return "Replace this text with the approved copy preview.";
  if (change?.structure) return `Redesign this container using the ${change.structure.label} layout preview.`;
  if (change?.image && change.typography) return "Apply this image and typography preview.";
  if (change?.image) return "Replace this image and preserve the previewed crop and focal point.";
  if (change?.typography) return "Apply the previewed typography to this element.";
  return "";
}

function lensReadyStatus(mode: LensMode) {
  if (mode === "select") return "Edit mode ready";
  if (mode === "drag") return "Move & Resize ready";
  return "Browse mode ready";
}

function defaultLayoutNote(layoutChange?: ReggieLensLayoutChange) {
  if (!layoutChange) return "";
  if (layoutChange.kind === "move") return "Reposition this element to match the captured layout preview.";
  if (layoutChange.kind === "resize") return "Resize this element to match the captured layout preview.";
  return "Reposition and resize this element to match the captured layout preview.";
}

function cleanNumberInput(value: string) {
  return value.replace(/[^\d]/g, "").slice(0, 5);
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatImageEditSummary(edit: ReggieImageEdit) {
  if (!edit) return "";
  return [
    edit.resizeWidth ? `width ${edit.resizeWidth}px` : "",
    edit.resizeHeight ? `height ${edit.resizeHeight}px` : "",
    edit.cropAspectRatio ? `ratio ${edit.cropAspectRatio}` : "",
    edit.cropFocus ? `focus ${edit.cropFocus}` : "",
    edit.fitMode ? `fit ${edit.fitMode}` : "",
    edit.notes ? edit.notes : "",
  ].filter(Boolean).join("; ");
}

function formatLayoutChangeSummary(change: ReggieLensLayoutChange) {
  const parts: string[] = [];
  const movement = [
    formatDirectionalPixels(change.delta.x, "right", "left"),
    formatDirectionalPixels(change.delta.y, "down", "up"),
  ].filter(Boolean).join(" and ");
  if (movement) parts.push(`Moved ${movement}`);
  if (change.delta.width || change.delta.height) parts.push(`Resized to ${change.proposed.width} x ${change.proposed.height} px`);
  return `${parts.join(". ")}.`;
}

function formatDirectionalPixels(value: number, positiveDirection: string, negativeDirection: string) {
  if (!value) return "";
  return `${Math.abs(value)} px ${value > 0 ? positiveDirection : negativeDirection}`;
}

function formatVisualChangeSummary(change: ReggieLensVisualChange) {
  const parts: string[] = [];
  if (change.text) parts.push(`copy: ${truncateText(change.text.content, 90)}`);
  if (change.image) parts.push(`image: ${change.image.assetName || change.image.assetPublicId || change.image.src}`);
  if (change.image?.fitMode) parts.push(`fit: ${change.image.fitMode}`);
  if (change.typography?.fontFamily) parts.push(`font: ${change.typography.fontFamily}`);
  if (change.typography?.fontAsset) parts.push(`uploaded font: ${change.typography.fontAsset.family}`);
  if (change.typography?.fontSize) parts.push(`size: ${change.typography.fontSize}px`);
  if (change.typography?.fontWeight) parts.push(`weight: ${change.typography.fontWeight}`);
  if (change.typography?.fontStyle) parts.push(`style: ${change.typography.fontStyle}`);
  if (change.typography?.color) parts.push(`color: ${change.typography.color}`);
  if (change.headlineStyle) parts.push(`headline split: ${formatHeadlineStyleSummary(change.headlineStyle)}`);
  if (change.structure) parts.push(`layout: ${change.structure.platformTemplate?.name || change.structure.label}`);
  return parts.join("; ");
}

function normalizeLensMediaAssets(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeLensMediaAsset).filter((asset): asset is LensMediaAsset => Boolean(asset)) : [];
}

function normalizeLensMediaAsset(value: unknown): LensMediaAsset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const asset = value as Record<string, unknown>;
  const secureUrl = String(asset.secureUrl ?? asset.url ?? "").trim();
  const assetId = String(asset.assetId ?? asset.id ?? asset.publicId ?? "").trim();
  const fileName = String(asset.fileName ?? asset.displayName ?? "Uploaded image").trim() || "Uploaded image";
  const contentType = typeof asset.contentType === "string" ? asset.contentType.trim().toLowerCase() : "";
  if (!secureUrl || !assetId || (contentType && !contentType.startsWith("image/"))) return null;
  return {
    id: typeof asset.id === "string" ? asset.id : undefined,
    url: typeof asset.url === "string" ? asset.url : undefined,
    assetId,
    publicId: String(asset.publicId ?? assetId),
    secureUrl,
    fileName,
    displayName: typeof asset.displayName === "string" && asset.displayName.trim() ? asset.displayName.trim() : fileName,
    contentType: contentType || undefined,
    altText: typeof asset.altText === "string" ? asset.altText : undefined,
    previewUrl: typeof asset.previewUrl === "string" ? asset.previewUrl : secureUrl,
    source: asset.source === "poopsites" ? "poopsites" : asset.source === "site" ? "site" : undefined,
    imageType: typeof asset.imageType === "string" ? asset.imageType : undefined,
    styles: Array.isArray(asset.styles) ? asset.styles.filter((item): item is string => typeof item === "string") : undefined,
    width: typeof asset.width === "number" ? asset.width : undefined,
    height: typeof asset.height === "number" ? asset.height : undefined,
  };
}

function hasAppliedVisualChange(change?: ReggieLensVisualChange) {
  const changedText = Boolean(change?.text && change.text.content.trim() && change.text.content.trim() !== change.text.original.trim());
  return Boolean(changedText || change?.image || change?.structure || (change?.headlineStyle && Object.values(change.headlineStyle).some((value) => value !== undefined && value !== "")) || (change?.typography && Object.values(change.typography).some((value) => value !== undefined && value !== "")));
}

function canEditTypography(candidate: CandidateTarget) {
  return Boolean(candidate.target.text?.trim()) && !["IMG", "VIDEO", "SVG", "INPUT", "TEXTAREA"].includes(candidate.target.tagName);
}

function canRewriteText(candidate: CandidateTarget) {
  return Boolean(candidate.target.text?.trim()) && /^(H1|H2|H3|H4|H5|H6|P|A|BUTTON|LI|LABEL|BLOCKQUOTE|FIGCAPTION)$/.test(candidate.target.tagName);
}

function capturePreviewSnapshot(element: HTMLElement, layoutContainer: HTMLElement | null): PreviewSnapshot {
  const image = (element.tagName === "IMG" ? element : element.querySelector("img")) as HTMLImageElement | null;
  return {
    element,
    styleAttribute: element.getAttribute("style"),
    textNodes: captureTextNodes(element),
    image,
    imageStyleAttribute: image?.getAttribute("style") ?? null,
    imageSrc: image?.getAttribute("src") ?? null,
    imageSrcset: image?.getAttribute("srcset") ?? null,
    imageSizes: image?.getAttribute("sizes") ?? null,
    imageAlt: image?.getAttribute("alt") ?? null,
    layoutContainer,
    layoutStyleAttribute: layoutContainer?.getAttribute("style") ?? null,
    layoutChildren: layoutContainer
      ? getLayoutFlowChildren(layoutContainer, layoutContainer.ownerDocument.defaultView).map((child) => ({ element: child, styleAttribute: child.getAttribute("style") }))
      : [],
  };
}

function restoreVisualPreview(snapshot: PreviewSnapshot | null) {
  if (!snapshot || !snapshot.element.isConnected) return;
  restoreAttribute(snapshot.element, "style", snapshot.styleAttribute);
  for (const textNode of snapshot.textNodes) {
    if (textNode.node.isConnected) textNode.node.nodeValue = textNode.value;
  }
  if (snapshot.image?.isConnected) {
    restoreAttribute(snapshot.image, "style", snapshot.imageStyleAttribute);
    restoreAttribute(snapshot.image, "src", snapshot.imageSrc);
    restoreAttribute(snapshot.image, "srcset", snapshot.imageSrcset);
    restoreAttribute(snapshot.image, "sizes", snapshot.imageSizes);
    restoreAttribute(snapshot.image, "alt", snapshot.imageAlt);
  }
  if (snapshot.layoutContainer?.isConnected) restoreAttribute(snapshot.layoutContainer, "style", snapshot.layoutStyleAttribute);
  for (const child of snapshot.layoutChildren) {
    if (child.element.isConnected) restoreAttribute(child.element, "style", child.styleAttribute);
  }
}

function applyVisualPreview(snapshot: PreviewSnapshot | null, change?: ReggieLensVisualChange) {
  if (!snapshot || !snapshot.element.isConnected) return;
  restoreVisualPreview(snapshot);
  const typography = change?.typography;
  if (typography?.fontFamily) snapshot.element.style.setProperty("font-family", typography.fontFamily, "important");
  if (typography?.fontSize) snapshot.element.style.setProperty("font-size", `${typography.fontSize}px`, "important");
  if (typography?.fontWeight) snapshot.element.style.setProperty("font-weight", String(typography.fontWeight), "important");
  if (typography?.fontStyle) snapshot.element.style.setProperty("font-style", typography.fontStyle, "important");
  if (typography?.lineHeight) snapshot.element.style.setProperty("line-height", String(typography.lineHeight), "important");
  if (typography?.textAlign) snapshot.element.style.setProperty("text-align", typography.textAlign, "important");
  if (typography?.color) snapshot.element.style.setProperty("color", typography.color, "important");
  if (change?.text) applyTextPreview(snapshot, change.text.content);
  if (change?.structure) applyStructurePreview(snapshot, change.structure);
  snapshot.element.style.setProperty("outline", "3px solid #cf4c2f", "important");
  snapshot.element.style.setProperty("outline-offset", "4px", "important");

  if (change?.image && snapshot.image) {
    snapshot.image.setAttribute("src", change.image.src);
    snapshot.image.removeAttribute("srcset");
    snapshot.image.removeAttribute("sizes");
    if (change.image.alt !== undefined) snapshot.image.setAttribute("alt", change.image.alt);
    if (change.image.fitMode) snapshot.image.style.setProperty("object-fit", change.image.fitMode, "important");
    if (change.image.objectPosition) snapshot.image.style.setProperty("object-position", change.image.objectPosition, "important");
  }
}

function captureOriginalVisualStyle(element: HTMLElement, win: Window): NonNullable<ReggieLensVisualChange["original"]> {
  const computed = win.getComputedStyle(element);
  const image = (element.tagName === "IMG" ? element : element.querySelector("img")) as HTMLImageElement | null;
  const fontSize = Number.parseFloat(computed.fontSize) || 16;
  const rawLineHeight = Number.parseFloat(computed.lineHeight);
  const rawWeight = Number.parseInt(computed.fontWeight, 10);
  return {
    imageSrc: image?.currentSrc || image?.src || undefined,
    text: readVisibleText(element, win) || undefined,
    fontFamily: computed.fontFamily,
    fontSize: Math.round(fontSize * 100) / 100,
    fontWeight: Number.isFinite(rawWeight) ? rawWeight : computed.fontWeight === "bold" ? 700 : 400,
    fontStyle: computed.fontStyle,
    lineHeight: Number.isFinite(rawLineHeight) ? Math.round((rawLineHeight / fontSize) * 100) / 100 : 1.2,
    textAlign: computed.textAlign,
    color: computed.color,
  };
}

function captureTextNodes(element: HTMLElement) {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.nodeValue?.trim() || !parent || parent.closest("script,style,noscript,svg")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes: Array<{ node: Text; value: string }> = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push({ node: current as Text, value: current.nodeValue ?? "" });
    current = walker.nextNode();
  }
  return textNodes;
}

function applyTextPreview(snapshot: PreviewSnapshot, content: string) {
  const entries = snapshot.textNodes.filter((entry) => entry.value.trim());
  if (entries.length === 0) return;
  const segments = distributeWords(content.trim(), entries.map((entry) => entry.value.trim().length));
  for (const [index, entry] of entries.entries()) {
    if (!entry.node.isConnected) continue;
    const leading = entry.value.match(/^\s*/)?.[0] ?? "";
    const trailing = entry.value.match(/\s*$/)?.[0] ?? "";
    const separator = index < entries.length - 1 && segments[index] && !trailing ? " " : "";
    entry.node.nodeValue = `${leading}${segments[index] ?? ""}${separator}${trailing}`;
  }
}

function distributeWords(content: string, originalLengths: number[]) {
  if (originalLengths.length <= 1) return [content];
  const words = content ? content.split(/\s+/) : [];
  const totalOriginal = originalLengths.reduce((sum, length) => sum + length, 0) || 1;
  const segments: string[] = [];
  let wordIndex = 0;
  let consumedTarget = 0;
  for (let index = 0; index < originalLengths.length; index += 1) {
    if (index === originalLengths.length - 1) {
      segments.push(words.slice(wordIndex).join(" "));
      break;
    }
    consumedTarget += (content.length * originalLengths[index]) / totalOriginal;
    const segmentWords: string[] = [];
    while (wordIndex < words.length) {
      const nextLength = segments.join(" ").length + segmentWords.join(" ").length + words[wordIndex].length;
      if (segmentWords.length > 0 && nextLength >= consumedTarget) break;
      segmentWords.push(words[wordIndex]);
      wordIndex += 1;
    }
    segments.push(segmentWords.join(" "));
  }
  while (segments.length < originalLengths.length) segments.push("");
  return segments;
}

function applyStructurePreview(snapshot: PreviewSnapshot, structure: ReggieLensStructureChange) {
  const container = snapshot.layoutContainer;
  if (!container?.isConnected) return;
  const isMobile = (container.ownerDocument.defaultView?.innerWidth ?? 1440) <= 680;
  container.style.setProperty("display", structure.preview.display, "important");
  container.style.setProperty("grid-template-columns", isMobile ? structure.preview.mobileColumns : structure.preview.columns, "important");
  container.style.setProperty("grid-auto-flow", "row", "important");
  container.style.setProperty("gap", structure.preview.gap, "important");
  container.style.setProperty("align-items", structure.preview.alignItems, "important");
  container.style.setProperty("box-sizing", "border-box", "important");
  container.style.setProperty("outline", "3px solid rgba(167, 174, 46, 0.92)", "important");
  container.style.setProperty("outline-offset", "6px", "important");
  container.style.setProperty("transition", "grid-template-columns 180ms ease, gap 180ms ease, padding 180ms ease", "important");
  if (structure.preview.containerMaxWidth) {
    const leftInset = Math.max(24, Math.round(container.getBoundingClientRect().left + 24));
    container.style.setProperty("width", isMobile ? "100%" : `min(${structure.preview.containerMaxWidth}, calc(100vw - ${leftInset}px))`, "important");
    container.style.setProperty("max-width", structure.preview.containerMaxWidth, "important");
  }
  if (structure.preview.padding) container.style.setProperty("padding", structure.preview.padding, "important");

  const children = snapshot.layoutChildren.filter((child) => child.element.isConnected).map((child) => child.element);
  for (const child of children) {
    child.style.setProperty("min-width", "0", "important");
    child.style.setProperty("max-width", "100%", "important");
    child.style.setProperty("box-sizing", "border-box", "important");
  }
  if (isMobile || children.length < 2) return;

  const selectedChild = children.find((child) => child === snapshot.element || child.contains(snapshot.element)) ?? children[0];
  const remainingChildren = children.filter((child) => child !== selectedChild);
  switch (structure.preview.childPattern) {
    case "feature_selected":
      selectedChild.style.setProperty("grid-column", "1 / -1", "important");
      break;
    case "rail_selected_left":
    case "rail_selected_right": {
      const selectedColumn = structure.preview.childPattern === "rail_selected_left" ? "1" : "2";
      const supportingColumn = selectedColumn === "1" ? "2" : "1";
      selectedChild.style.setProperty("grid-column", selectedColumn, "important");
      selectedChild.style.setProperty("grid-row", `1 / span ${Math.max(1, remainingChildren.length)}`, "important");
      for (const child of remainingChildren) child.style.setProperty("grid-column", supportingColumn, "important");
      break;
    }
    case "alternating":
      for (const [index, child] of children.entries()) child.style.setProperty("grid-column", index % 2 === 0 ? "1" : "2", "important");
      break;
    case "bento":
      selectedChild.style.setProperty("grid-column", "1 / -1", "important");
      if (remainingChildren.length > 2) remainingChildren.at(-1)?.style.setProperty("grid-column", "1 / -1", "important");
      break;
    default:
      break;
  }
}

function restoreAttribute(element: Element, name: string, value: string | null) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function clampNumberInput(value: string, minimum: number, maximum: number) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function optionalNumberInput(value: string, minimum: number, maximum: number) {
  if (!value.trim()) return undefined;
  return clampNumberInput(value, minimum, maximum);
}

function formatHeadlineStyleSummary(style: NonNullable<ReggieLensVisualChange["headlineStyle"]>) {
  return [
    style.largeText ? `large "${truncateText(style.largeText, 48)}"` : "",
    style.smallText ? `small "${truncateText(style.smallText, 48)}"` : "",
    style.largeSize ? `large ${style.largeSize}px` : "",
    style.smallSize ? `small ${style.smallSize}px` : "",
    style.largeWeight ? `large weight ${style.largeWeight}` : "",
    style.smallWeight ? `small weight ${style.smallWeight}` : "",
    style.smallPosition ? `small ${style.smallPosition}` : "",
  ].filter(Boolean).join("; ");
}

function normalizeTextAlign(value?: string): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function normalizeColorForInput(value?: string) {
  if (value && /^#[0-9a-f]{6}$/i.test(value)) return value;
  const match = value?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "#191919";
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

function installLayoutOverlay(params: {
  doc: Document;
  win: Window;
  target: HTMLElement;
  captured: CandidateTarget;
  overlayRef: MutableRefObject<HTMLDivElement | null>;
  aspectLocked: boolean;
  onChange: (change?: ReggieLensLayoutChange) => void;
  onHistoryChange: (state: LayoutHistoryState) => void;
}): LayoutPreviewController {
  const { doc, win, target, captured, overlayRef, onChange, onHistoryChange } = params;
  overlayRef.current?.remove();

  const original = { ...captured.target.boundingBox };
  const originalGuide = doc.createElement("div");
  originalGuide.dataset.reggieLensLayoutOriginal = "1";
  originalGuide.setAttribute("aria-hidden", "true");

  const ghost = createLayoutGhost(doc, target);
  const overlay = doc.createElement("div");
  overlay.dataset.reggieLensLayoutOverlay = "1";
  overlay.setAttribute("role", "group");
  overlay.setAttribute("tabindex", "0");

  const label = doc.createElement("div");
  label.dataset.reggieLensLayoutLabel = "1";
  label.setAttribute("aria-live", "polite");
  overlay.appendChild(label);

  const handleLabels: Record<string, string> = {
    n: "Resize from top",
    ne: "Resize from top right",
    e: "Resize from right",
    se: "Resize from bottom right",
    s: "Resize from bottom",
    sw: "Resize from bottom left",
    w: "Resize from left",
    nw: "Resize from top left",
  };
  for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
    const handle = doc.createElement("button");
    handle.type = "button";
    handle.dataset.reggieLensResizeHandle = direction;
    handle.setAttribute("aria-label", handleLabels[direction]);
    handle.setAttribute("title", handleLabels[direction]);
    overlay.appendChild(handle);
  }

  let current = { ...original };
  let history = [{ ...original }];
  let historyIndex = 0;
  let aspectLocked = params.aspectLocked;
  let destroyed = false;
  let viewportAnimationFrame = 0;
  const originalOpacity = target.style.getPropertyValue("opacity");
  const originalOpacityPriority = target.style.getPropertyPriority("opacity");

  const restoreTargetOpacity = () => {
    if (!target.isConnected) return;
    if (originalOpacity) target.style.setProperty("opacity", originalOpacity, originalOpacityPriority);
    else target.style.removeProperty("opacity");
  };

  const getViewportOffset = () => {
    if (!target.isConnected) return { x: 0, y: 0 };
    const rect = target.getBoundingClientRect();
    return { x: rect.x - original.x, y: rect.y - original.y };
  };

  const getVisualBox = (box: ReggieLensBoundingBox) => {
    const offset = getViewportOffset();
    return { ...box, x: box.x + offset.x, y: box.y + offset.y };
  };

  const getLogicalBox = (box: ReggieLensBoundingBox) => {
    const offset = getViewportOffset();
    return { ...box, x: box.x - offset.x, y: box.y - offset.y };
  };

  const render = () => {
    if (destroyed) return;
    const box = getVisualBox(current);
    Object.assign(overlay.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });
    Object.assign(ghost.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    });

    if (target.isConnected) {
      const targetRect = target.getBoundingClientRect();
      Object.assign(originalGuide.style, {
        left: `${targetRect.x}px`,
        top: `${targetRect.y}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
      });
    }

    const deltaX = Math.round(current.x - original.x);
    const deltaY = Math.round(current.y - original.y);
    const size = `${Math.round(current.width)} x ${Math.round(current.height)} px`;
    const movement = [
      formatDirectionalPixels(deltaX, "right", "left"),
      formatDirectionalPixels(deltaY, "down", "up"),
    ].filter(Boolean).join(" and ");
    label.textContent = movement ? `${size} | ${movement}` : size;
    overlay.setAttribute("aria-label", `Selected layout preview. ${size}. ${movement ? `Moved ${movement}.` : "Original position."} Use arrow keys to move it.`);
  };

  const setPreviewVisible = (visible: boolean) => {
    const visibility = visible ? "visible" : "hidden";
    overlay.style.visibility = visibility;
    ghost.style.visibility = visibility;
    originalGuide.style.visibility = visibility;
    if (visible && target.isConnected) target.style.setProperty("opacity", "0.18", "important");
    else restoreTargetOpacity();
  };

  const emitChange = () => onChange(buildLayoutChange(original, current));
  const emitHistoryState = () => onHistoryChange({ canUndo: historyIndex > 0, canRedo: historyIndex < history.length - 1 });
  const boxesMatch = (left: ReggieLensBoundingBox, right: ReggieLensBoundingBox) => (
    left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
  );
  const commitHistory = () => {
    if (boxesMatch(history[historyIndex], current)) return;
    history = [...history.slice(0, historyIndex + 1), { ...current }].slice(-50);
    historyIndex = history.length - 1;
    emitHistoryState();
  };

  let removeActiveListeners = () => undefined;
  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    overlay.focus({ preventScroll: true });

    const eventElement = isElementNode(event.target) ? event.target : null;
    const resizeHandle = eventElement?.closest("[data-reggie-lens-resize-handle]") as HTMLElement | null;
    const direction = resizeHandle?.dataset.reggieLensResizeHandle ?? "move";
    const start = { ...current };
    const startVisual = getVisualBox(start);
    const startX = event.clientX;
    const startY = event.clientY;
    let pendingAnimationFrame = 0;
    let pendingBox: ReggieLensBoundingBox | null = null;

    try {
      overlay.setPointerCapture(event.pointerId);
    } catch {
      // Document listeners still keep the drag active in browsers without pointer capture.
    }

    const flushPointerMove = () => {
      pendingAnimationFrame = 0;
      if (!pendingBox) return;
      current = pendingBox;
      pendingBox = null;
      render();
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const snapSize = moveEvent.altKey ? 1 : 4;
      const nextVisual = resizeLayoutBox({
        start: startVisual,
        direction,
        deltaX: snapPointerDelta(moveEvent.clientX - startX, snapSize),
        deltaY: snapPointerDelta(moveEvent.clientY - startY, snapSize),
        viewportWidth: win.innerWidth,
        viewportHeight: win.innerHeight,
        preserveAspectRatio: direction !== "move" && (aspectLocked || moveEvent.shiftKey),
      });
      pendingBox = roundLayoutBox(getLogicalBox(nextVisual));
      if (!pendingAnimationFrame) pendingAnimationFrame = win.requestAnimationFrame(flushPointerMove);
    };

    const handlePointerEnd = (endEvent: PointerEvent) => {
      endEvent.preventDefault();
      if (pendingAnimationFrame) {
        win.cancelAnimationFrame(pendingAnimationFrame);
        flushPointerMove();
      }
      removeActiveListeners();
      commitHistory();
      emitChange();
    };

    removeActiveListeners();
    doc.addEventListener("pointermove", handlePointerMove, true);
    doc.addEventListener("pointerup", handlePointerEnd, true);
    doc.addEventListener("pointercancel", handlePointerEnd, true);
    removeActiveListeners = () => {
      if (pendingAnimationFrame) win.cancelAnimationFrame(pendingAnimationFrame);
      pendingAnimationFrame = 0;
      doc.removeEventListener("pointermove", handlePointerMove, true);
      doc.removeEventListener("pointerup", handlePointerEnd, true);
      doc.removeEventListener("pointercancel", handlePointerEnd, true);
      try {
        if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have ended.
      }
    };
  };

  const stopOverlayClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const applyHistoryBox = () => {
    current = { ...history[historyIndex] };
    render();
    emitChange();
    emitHistoryState();
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    applyHistoryBox();
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    applyHistoryBox();
  };

  const reset = () => {
    current = { ...original };
    render();
    commitHistory();
    emitChange();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (!event.key.startsWith("Arrow")) return;

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const deltaX = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const deltaY = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const eventElement = isElementNode(event.target) ? event.target : null;
    const resizeHandle = eventElement?.closest("[data-reggie-lens-resize-handle]") as HTMLElement | null;
    const direction = resizeHandle?.dataset.reggieLensResizeHandle ?? "move";
    const nextVisual = resizeLayoutBox({
      start: getVisualBox(current),
      direction,
      deltaX,
      deltaY,
      viewportWidth: win.innerWidth,
      viewportHeight: win.innerHeight,
      preserveAspectRatio: direction !== "move" && aspectLocked,
    });
    current = roundLayoutBox(getLogicalBox(nextVisual));
    render();
    commitHistory();
    emitChange();
  };

  const handleViewportChange = () => {
    if (viewportAnimationFrame) return;
    viewportAnimationFrame = win.requestAnimationFrame(() => {
      viewportAnimationFrame = 0;
      render();
    });
  };

  overlay.addEventListener("pointerdown", handlePointerDown);
  overlay.addEventListener("click", stopOverlayClick);
  overlay.addEventListener("keydown", handleKeyDown);
  win.addEventListener("scroll", handleViewportChange, true);
  win.addEventListener("resize", handleViewportChange);
  doc.body.appendChild(originalGuide);
  doc.body.appendChild(ghost);
  doc.body.appendChild(overlay);
  overlayRef.current = overlay;
  render();
  setPreviewVisible(true);
  emitHistoryState();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    removeActiveListeners();
    if (viewportAnimationFrame) win.cancelAnimationFrame(viewportAnimationFrame);
    overlay.removeEventListener("pointerdown", handlePointerDown);
    overlay.removeEventListener("click", stopOverlayClick);
    overlay.removeEventListener("keydown", handleKeyDown);
    win.removeEventListener("scroll", handleViewportChange, true);
    win.removeEventListener("resize", handleViewportChange);
    restoreTargetOpacity();
    originalGuide.remove();
    ghost.remove();
    overlay.remove();
    if (overlayRef.current === overlay) overlayRef.current = null;
  };

  return {
    destroy,
    focus: () => overlay.focus({ preventScroll: true }),
    redo,
    reset,
    setAspectLocked: (locked) => { aspectLocked = locked; },
    setPreviewVisible,
    undo,
  };
}

function createLayoutGhost(doc: Document, target: HTMLElement) {
  const ghost = doc.createElement("div");
  ghost.dataset.reggieLensLayoutGhost = "1";
  ghost.setAttribute("aria-hidden", "true");

  const descendantCount = target.querySelectorAll("*").length;
  const clone = target.cloneNode(descendantCount <= 400) as HTMLElement;
  clone.dataset.reggieLensLayoutGhostClone = "1";
  sanitizeLayoutGhost(clone);
  if (descendantCount > 400) {
    const computed = doc.defaultView?.getComputedStyle(target);
    if (computed) {
      clone.style.setProperty("background", computed.background, "important");
      clone.style.setProperty("border", computed.border, "important");
      clone.style.setProperty("border-radius", computed.borderRadius, "important");
      clone.style.setProperty("box-shadow", computed.boxShadow, "important");
    }
  }
  ghost.appendChild(clone);
  return ghost;
}

function sanitizeLayoutGhost(root: HTMLElement) {
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const node of nodes) {
    node.removeAttribute("id");
    node.removeAttribute("name");
    node.removeAttribute("for");
    node.removeAttribute("autofocus");
    node.removeAttribute("contenteditable");
    node.removeAttribute("aria-controls");
    node.removeAttribute("aria-describedby");
    node.removeAttribute("aria-labelledby");
    node.setAttribute("tabindex", "-1");
    if (node.tagName === "IMG") (node as HTMLImageElement).draggable = false;
  }
}

function snapPointerDelta(value: number, increment: number) {
  return Math.round(value / increment) * increment;
}

function roundLayoutBox(box: ReggieLensBoundingBox): ReggieLensBoundingBox {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

function resizeLayoutBox(params: {
  start: ReggieLensBoundingBox;
  direction: string;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
  preserveAspectRatio?: boolean;
}): ReggieLensBoundingBox {
  const { start, direction, deltaX, deltaY, viewportWidth, viewportHeight, preserveAspectRatio = false } = params;
  const minimumSize = 24;
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (direction === "move") {
    const normalMaxX = Math.max(0, viewportWidth - width);
    const normalMaxY = Math.max(0, viewportHeight - height);
    x = clamp(Math.round(start.x + deltaX), Math.min(0, start.x), Math.max(normalMaxX, start.x));
    y = clamp(Math.round(start.y + deltaY), Math.min(0, start.y), Math.max(normalMaxY, start.y));
  } else if (preserveAspectRatio && start.width > 0 && start.height > 0) {
    return resizeLayoutBoxWithAspectRatio({ start, direction, deltaX, deltaY, viewportWidth, viewportHeight, minimumSize });
  } else {
    if (direction.includes("e")) {
      width = clamp(Math.round(start.width + deltaX), minimumSize, Math.max(minimumSize, viewportWidth - start.x));
    }
    if (direction.includes("s")) {
      height = clamp(Math.round(start.height + deltaY), minimumSize, Math.max(minimumSize, viewportHeight - start.y));
    }
    if (direction.includes("w")) {
      x = clamp(Math.round(start.x + deltaX), 0, start.x + start.width - minimumSize);
      width = start.x + start.width - x;
    }
    if (direction.includes("n")) {
      y = clamp(Math.round(start.y + deltaY), 0, start.y + start.height - minimumSize);
      height = start.y + start.height - y;
    }
  }

  return { x, y, width, height };
}

function resizeLayoutBoxWithAspectRatio(params: {
  start: ReggieLensBoundingBox;
  direction: string;
  deltaX: number;
  deltaY: number;
  viewportWidth: number;
  viewportHeight: number;
  minimumSize: number;
}): ReggieLensBoundingBox {
  const { start, direction, deltaX, deltaY, viewportWidth, viewportHeight, minimumSize } = params;
  const usesHorizontalEdge = direction.includes("e") || direction.includes("w");
  const usesVerticalEdge = direction.includes("n") || direction.includes("s");
  const desiredWidth = start.width + (direction.includes("e") ? deltaX : direction.includes("w") ? -deltaX : 0);
  const desiredHeight = start.height + (direction.includes("s") ? deltaY : direction.includes("n") ? -deltaY : 0);
  const widthScale = desiredWidth / start.width;
  const heightScale = desiredHeight / start.height;

  let scale = usesHorizontalEdge && usesVerticalEdge
    ? Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale
    : usesHorizontalEdge ? widthScale : heightScale;

  const centerX = start.x + (start.width / 2);
  const centerY = start.y + (start.height / 2);
  const maxWidth = direction.includes("w")
    ? start.x + start.width
    : direction.includes("e")
      ? viewportWidth - start.x
      : 2 * Math.min(centerX, viewportWidth - centerX);
  const maxHeight = direction.includes("n")
    ? start.y + start.height
    : direction.includes("s")
      ? viewportHeight - start.y
      : 2 * Math.min(centerY, viewportHeight - centerY);
  const minimumScale = Math.max(minimumSize / start.width, minimumSize / start.height);
  const maximumScale = Math.max(minimumScale, Math.min(maxWidth / start.width, maxHeight / start.height));
  scale = clamp(scale, minimumScale, maximumScale);

  const width = Math.round(start.width * scale);
  const height = Math.round(start.height * scale);
  const x = Math.round(direction.includes("w") ? start.x + start.width - width : direction.includes("e") ? start.x : centerX - (width / 2));
  const y = Math.round(direction.includes("n") ? start.y + start.height - height : direction.includes("s") ? start.y : centerY - (height / 2));
  return { x, y, width, height };
}

function buildLayoutChange(original: ReggieLensBoundingBox, proposed: ReggieLensBoundingBox): ReggieLensLayoutChange | undefined {
  const delta = {
    x: proposed.x - original.x,
    y: proposed.y - original.y,
    width: proposed.width - original.width,
    height: proposed.height - original.height,
  };
  const moved = delta.x !== 0 || delta.y !== 0;
  const resized = delta.width !== 0 || delta.height !== 0;
  if (!moved && !resized) return undefined;

  return {
    kind: moved && resized ? "move_and_resize" : moved ? "move" : "resize",
    coordinateSpace: "viewport",
    original: { ...original },
    proposed: { ...proposed },
    delta,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function deviceBorderSize(preset: LensViewportPreset) {
  if (preset === "mobile") return 12;
  if (preset === "tablet") return 10;
  return 1;
}

function normalizeFramePath(value: string) {
  const path = value.trim() || "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalized, getBrowserOrigin());
  url.searchParams.set("reggieLens", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

function getBrowserHost() {
  return typeof window === "undefined" ? "site" : window.location.host;
}

function getBrowserOrigin() {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

function deriveFontFamily(fileName: string) {
  return fileName.replace(/\.(woff2?|ttf|otf)$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
}

function quoteCssFontFamily(value: string) {
  return `"${value.replace(/["\\]/g, "").trim()}"`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

function humanizeLabel(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function splitEditorLines(value: string) {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, 20);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "previously" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function readLensConversationContext() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    conversationId: params.get("conversationId")?.trim().slice(0, 100) || undefined,
    conversationMessageId: params.get("messageId")?.trim().slice(0, 100) || undefined,
  };
}

function isStoredLensSession(value: unknown): value is ReggieLensSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ReggieLensSession>;
  return typeof session.sessionId === "string"
    && typeof session.createdAt === "string"
    && typeof session.updatedAt === "string"
    && Array.isArray(session.annotations)
    && session.annotations.every((annotation) => Boolean(
      annotation
      && typeof annotation.id === "string"
      && typeof annotation.pathname === "string"
      && typeof annotation.note === "string"
      && typeof annotation.target?.tagName === "string"
      && annotation.target.boundingBox
      && Number.isFinite(annotation.target.boundingBox.x)
      && Number.isFinite(annotation.target.boundingBox.y)
      && Number.isFinite(annotation.target.boundingBox.width)
      && Number.isFinite(annotation.target.boundingBox.height),
    ));
}

function isLensOverlayTarget(target: EventTarget | null) {
  return isElementNode(target) && Boolean(target.closest("[data-reggie-lens-layout-overlay='1']"));
}

function findMeaningfulElement(target: EventTarget | null): HTMLElement | null {
  if (!isElementNode(target)) return null;
  const ignored = new Set(["HTML", "BODY", "SCRIPT", "STYLE", "META", "LINK"]);
  let current: HTMLElement | null = target;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (ignored.has(current.tagName)) {
      current = current.parentElement;
      continue;
    }
    if (isMeaningfulElement(current)) return current;
    current = current.parentElement;
  }
  return target.closest("section,article,header,footer,nav,main,aside,div") as HTMLElement | null;
}

function findLensTarget(event: MouseEvent, doc: Document): HTMLElement | null {
  const direct = findMeaningfulElement(event.target);
  if (!direct) return null;
  if (/^(H1|H2|H3|H4|H5|H6|P|A|BUTTON|IMG|FORM|INPUT|TEXTAREA|LABEL)$/.test(direct.tagName) || direct.getAttribute("role")) {
    return direct;
  }

  const underlyingImage = doc.elementsFromPoint(event.clientX, event.clientY)
    .find((element): element is HTMLImageElement => element instanceof doc.defaultView!.HTMLImageElement);
  return underlyingImage ?? direct;
}

function isMeaningfulElement(element: HTMLElement) {
  if (element.dataset.reggieId || element.dataset.testid || element.id || element.getAttribute("role")) return true;
  if (/^(SECTION|HEADER|FOOTER|NAV|MAIN|ARTICLE|ASIDE|H1|H2|H3|H4|H5|H6|P|A|BUTTON|IMG|FORM|INPUT|TEXTAREA|LABEL)$/.test(element.tagName)) return true;
  const className = String(element.className || "");
  return /\b(card|hero|section|cta|button|feature|service|review|testimonial)\b/i.test(className);
}

function findLayoutContainer(element: HTMLElement, win: Window) {
  const candidates: Array<{ element: HTMLElement; score: number }> = [];
  let current: HTMLElement | null = /^(SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|DIV)$/.test(element.tagName) ? element : element.parentElement;
  for (let depth = 0; current && current.tagName !== "BODY" && depth < 8; depth += 1) {
    const allChildren = Array.from(current.children).filter(isHTMLElement);
    const children = getLayoutFlowChildren(current, win).filter((child) => {
      const rect = child.getBoundingClientRect();
      const style = win.getComputedStyle(child);
      return rect.width > 8 && rect.height > 8 && style.display !== "none" && style.visibility !== "hidden";
    });
    const hasFloatingChildren = allChildren.some((child) => {
      const position = win.getComputedStyle(child).position;
      return position === "absolute" || position === "fixed";
    });
    if (!hasFloatingChildren && children.length >= 2 && children.length <= 12 && !/^(FORM|NAV|UL|OL|TABLE|TBODY|TR)$/.test(current.tagName)) {
      const className = String(current.className || "");
      const semantic = /^(SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE)$/.test(current.tagName) ? 5 : 0;
      const named = /(section|hero|grid|cards?|features?|services?|reviews?|testimonials?|content|container)/i.test(className) ? 3 : 0;
      candidates.push({ element: current, score: semantic + named - depth * 0.25 });
    }
    current = current.parentElement;
  }
  return candidates.sort((left, right) => right.score - left.score)[0]?.element ?? null;
}

function getLayoutFlowChildren(container: HTMLElement, win: Window | null) {
  return Array.from(container.children).filter(isHTMLElement).filter((child) => {
    const position = win?.getComputedStyle(child).position ?? "static";
    return position !== "absolute" && position !== "fixed";
  });
}

function classifyLayoutContainer(children: HTMLElement[]): ReggieLensLayoutContextKind {
  if (children.length === 2) return "split";
  const cardLike = children.filter((child) => {
    const className = String(child.className || "");
    return /^(ARTICLE|LI)$/.test(child.tagName) || /(card|item|feature|service|review|testimonial|step|tile)/i.test(className);
  }).length;
  return cardLike >= Math.max(2, Math.ceil(children.length * 0.6)) ? "collection" : "stack";
}

function captureTarget(element: HTMLElement, win: Window, layoutContainer: HTMLElement | null, sourceMapEntries: LensSourceMapEntry[]): CandidateTarget {
  const rect = element.getBoundingClientRect();
  const url = new URL(win.location.href);
  const text = readVisibleText(element, win);
  const image = element.tagName === "IMG" ? element : element.querySelector("img");
  const link = element.tagName === "A" ? element : element.closest("a");
  const nearestSection = element.closest("section,article,header,footer,nav,main,aside") as HTMLElement | null;
  const nearestHeadingElement = element.matches("h1,h2,h3,h4,h5,h6")
    ? element
    : nearestSection?.querySelector("h1,h2,h3,h4,h5,h6")
      ?? element.closest("section,article,main")?.querySelector("h1,h2,h3,h4,h5,h6");
  const nearestHeading = nearestHeadingElement ? readVisibleText(nearestHeadingElement as HTMLElement, win) : "";
  const layoutRect = layoutContainer?.getBoundingClientRect();
  const layoutHeadingElement = layoutContainer?.querySelector("h1,h2,h3,h4,h5,h6");
  const layoutHeading = nearestHeading || (layoutHeadingElement ? readVisibleText(layoutHeadingElement as HTMLElement, win) : "");
  const layoutChildren = layoutContainer ? getLayoutFlowChildren(layoutContainer, win) : [];
  const reactHint = getReactComponentHint(element);
  const componentHint = element.dataset.component || element.dataset.section || reactHint.symbol || undefined;
  const source = resolveSourceCandidates(element, text, componentHint, reactHint.source, sourceMapEntries);

  return {
    pageUrl: win.location.href,
    pathname: url.pathname,
    viewport: {
      width: win.innerWidth,
      height: win.innerHeight,
    },
    scroll: {
      x: win.scrollX,
      y: win.scrollY,
    },
    target: {
      tagName: element.tagName,
      label: buildTargetLabel(element, nearestHeading),
      selector: buildStableSelector(element),
      domPath: buildDomPath(element),
      text: truncateText(text, 900),
      href: link?.getAttribute("href") ? new URL(link.getAttribute("href") ?? "", win.location.href).href : null,
      src: image?.getAttribute("src") ? new URL(image.getAttribute("src") ?? "", win.location.href).href : null,
      alt: image?.getAttribute("alt") ?? null,
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      parentSummary: {
        nearestHeading: truncateText(nearestHeading, 160),
        sectionText: truncateText(nearestSection?.innerText || element.parentElement?.innerText || "", 700),
      },
      layoutContext: layoutContainer && layoutRect ? {
        tagName: layoutContainer.tagName,
        label: truncateText(layoutHeading || `${layoutContainer.tagName.toLowerCase()} container`, 120),
        selector: buildStableSelector(layoutContainer),
        domPath: buildDomPath(layoutContainer),
        directChildCount: layoutChildren.length,
        kind: classifyLayoutContainer(layoutChildren),
        boundingBox: {
          x: Math.round(layoutRect.x),
          y: Math.round(layoutRect.y),
          width: Math.round(layoutRect.width),
          height: Math.round(layoutRect.height),
        },
      } : undefined,
      componentHint,
      source,
      ...computeConfidence(element, text, source?.best),
    },
  };
}

function buildTargetLabel(element: HTMLElement, nearestHeading: string) {
  if (/^H[1-6]$/.test(element.tagName)) return `${headingName(element.tagName)} headline`;
  if (element.tagName === "IMG") return element.getAttribute("alt") ? `Image: ${element.getAttribute("alt")}` : "Image";
  if (element.tagName === "A" || element.tagName === "BUTTON") return "CTA or link";
  if (element.tagName === "FORM") return "Form";
  if (nearestHeading) return nearestHeading;
  return element.tagName.toLowerCase();
}

function headingName(tagName: string) {
  return tagName === "H1" ? "Primary" : "Section";
}

function buildStableSelector(element: HTMLElement): string {
  const dataAttribute = ["reggieId", "testid", "component", "section"].find((key) => element.dataset[key]);
  if (dataAttribute) {
    const attr = dataAttribute === "reggieId" ? "data-reggie-id" : dataAttribute === "testid" ? "data-testid" : `data-${dataAttribute}`;
    return `[${attr}="${element.dataset[dataAttribute]}"]`;
  }
  if (element.id) return `#${escapeCssIdentifier(element.id)}`;

  const textSelector = element.tagName.match(/^H[1-6]$/) ? element.tagName.toLowerCase() : "";
  const parent = element.parentElement;
  if (!parent) return element.tagName.toLowerCase();
  const sameTag = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  const index = sameTag.indexOf(element) + 1;
  return `${buildStableSelector(parent)} > ${textSelector || element.tagName.toLowerCase()}${sameTag.length > 1 ? `:nth-of-type(${index})` : ""}`;
}

function buildDomPath(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current.tagName !== "HTML") {
    const parent: HTMLElement | null = current.parentElement;
    const currentTagName = current.tagName;
    const siblings: Element[] = parent ? Array.from(parent.children).filter((child) => child.tagName === currentTagName) : [];
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}${current.id ? `#${current.id}` : ""}${siblings.length > 1 ? `:nth-of-type(${index})` : ""}`);
    current = parent;
  }
  return `html > ${parts.join(" > ")}`;
}

function computeConfidence(element: HTMLElement, text: string, source?: ReggieLensSourceCandidate): { confidence: "low" | "medium" | "high"; confidenceReason: string } {
  if (source?.confidence === "high") {
    return { confidence: "high", confidenceReason: `Matched source ${source.filePath}:${source.line} through ${source.strategy}.` };
  }
  if (element.dataset.reggieId || element.dataset.testid || element.dataset.component || element.dataset.section || element.id) {
    return { confidence: "high", confidenceReason: "Stable data attribute or id is available." };
  }
  if (text.trim().length > 8 || /^(H1|H2|H3|P|BUTTON|A)$/.test(element.tagName)) {
    return { confidence: "medium", confidenceReason: "Semantic element and visible text were captured." };
  }
  return { confidence: "low", confidenceReason: "Element may be dynamic, image-only, or selected through a brittle path." };
}

function resolveSourceCandidates(
  element: HTMLElement,
  text: string,
  componentHint: string | undefined,
  fiberSource: ReggieLensSourceCandidate | undefined,
  entries: LensSourceMapEntry[],
) {
  const ranked: Array<{ score: number; candidate: ReggieLensSourceCandidate }> = [];
  const attributedSourcePath = normalizeSourcePath(element.dataset.reggieSource || "");
  if (attributedSourcePath) {
    ranked.push({
      score: 140,
      candidate: {
        filePath: attributedSourcePath,
        line: Math.max(1, Number(element.dataset.reggieLine) || 1),
        column: Math.max(1, Number(element.dataset.reggieColumn) || 1),
        symbol: componentHint || "",
        strategy: "dom-attribute",
        confidence: "high",
      },
    });
  }
  const attributes: Array<[LensSourceMapEntry["type"], string | undefined]> = [
    ["reggieId", element.dataset.reggieId],
    ["testid", element.dataset.testid],
    ["component", element.dataset.component],
    ["section", element.dataset.section],
  ];
  for (const [type, value] of attributes) {
    if (!value) continue;
    for (const entry of entries) {
      if (entry.type !== type || entry.value !== value) continue;
      ranked.push({ score: 120, candidate: sourceCandidate(entry, "source-map", "high", value) });
    }
  }

  const normalizedText = normalizeSourceText(text);
  if (normalizedText.length >= 8) {
    for (const entry of entries) {
      if (entry.type !== "text") continue;
      const candidateText = normalizeSourceText(entry.value);
      const exact = candidateText === normalizedText;
      const partial = !exact && candidateText.length >= 8 && (normalizedText.includes(candidateText) || candidateText.includes(normalizedText));
      if (exact || partial) ranked.push({ score: exact ? 100 : 70, candidate: sourceCandidate(entry, "source-map", exact ? "high" : "medium", entry.value) });
    }
  }

  if (componentHint) {
    for (const entry of entries) {
      if (entry.symbol !== componentHint) continue;
      ranked.push({ score: 55, candidate: sourceCandidate(entry, "source-map", "medium", componentHint) });
    }
  }
  if (fiberSource) ranked.push({ score: fiberSource.filePath ? 110 : 45, candidate: fiberSource });

  const candidates = ranked
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.candidate)
    .filter((candidate, index, all) => all.findIndex((entry) => entry.filePath === candidate.filePath && entry.line === candidate.line && entry.symbol === candidate.symbol) === index)
    .slice(0, 4);
  return candidates.length ? { best: candidates[0], candidates } : undefined;
}

function sourceCandidate(entry: LensSourceMapEntry, strategy: ReggieLensSourceCandidate["strategy"], confidence: ReggieElementConfidence, matchedValue: string): ReggieLensSourceCandidate {
  return { filePath: entry.filePath, line: entry.line, column: entry.column, symbol: entry.symbol, strategy, confidence, matchedValue };
}

function getReactComponentHint(element: HTMLElement): { symbol?: string; source?: ReggieLensSourceCandidate } {
  const record = element as unknown as Record<string, unknown>;
  const key = Object.keys(record).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
  let fiber = key && record[key] && typeof record[key] === "object" ? record[key] as Record<string, unknown> : null;
  for (let depth = 0; fiber && depth < 24; depth += 1) {
    const debugSource = fiber._debugSource && typeof fiber._debugSource === "object" ? fiber._debugSource as Record<string, unknown> : null;
    const type = fiber.elementType ?? fiber.type;
    const typeRecord = type && (typeof type === "function" || typeof type === "object") ? type as unknown as Record<string, unknown> : null;
    const symbol = typeof type === "function" && type.name
      ? type.name
      : typeof typeRecord?.displayName === "string"
        ? typeRecord.displayName
        : typeof typeRecord?.name === "string" ? typeRecord.name : "";
    if (debugSource && typeof debugSource.fileName === "string") {
      const filePath = normalizeSourcePath(debugSource.fileName);
      if (!filePath) {
        fiber = fiber.return && typeof fiber.return === "object" ? fiber.return as Record<string, unknown> : null;
        continue;
      }
      return {
        symbol: symbol || undefined,
        source: {
          filePath,
          line: Number(debugSource.lineNumber) || 1,
          column: Number(debugSource.columnNumber) || 1,
          symbol,
          strategy: "react-fiber",
          confidence: "high",
        },
      };
    }
    if (symbol && /^[A-Z]/.test(symbol)) return { symbol };
    fiber = fiber.return && typeof fiber.return === "object" ? fiber.return as Record<string, unknown> : null;
  }
  return {};
}

function normalizeSourceText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240).toLowerCase();
}

function normalizeSourcePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const filePath = normalized.match(/(?:^|\/)((?:src|app|pages|components)\/.+)$/)?.[1] || "";
  return filePath && !filePath.split("/").includes("..") ? filePath.slice(0, 300) : "";
}

function escapeCssIdentifier(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function isElementNode(value: unknown): value is HTMLElement {
  return Boolean(
    value &&
      typeof value === "object" &&
      "nodeType" in value &&
      (value as Node).nodeType === 1 &&
      "tagName" in value &&
      typeof (value as HTMLElement).tagName === "string" &&
      "style" in value,
  );
}

function readVisibleText(element: HTMLElement, win: Window) {
  const pieces = Array.from(element.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const child = node as HTMLElement;
    if (child.matches("script,style,noscript,svg")) return "";
    const value = child.innerText || child.textContent || "";
    const display = win.getComputedStyle(child).display;
    return display === "inline" || display === "contents" ? value : ` ${value} `;
  });
  return (pieces.join("") || element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function isHTMLElement(value: Element): value is HTMLElement {
  return value.nodeType === 1 && "style" in value;
}

function getFocusableElements(container: HTMLElement) {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  });
}

function riskClassName(level: string, css: typeof styles) {
  if (level === "high") return css.riskHigh;
  if (level === "medium") return css.riskMedium;
  return css.riskLow;
}
