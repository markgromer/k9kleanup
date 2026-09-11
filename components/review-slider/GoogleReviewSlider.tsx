"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { GoogleReview, ReviewSliderSettings, ReviewWidgetType } from "@/lib/google-review-types";
import styles from "./GoogleReviewSlider.module.css";

export type ReviewSliderPayload = { connected?: boolean; settings: ReviewSliderSettings; reviews: GoogleReview[]; averageRating: number; totalReviewCount: number; syncedAt: string };
type WidgetProps = { initialData?: ReviewSliderPayload; type?: ReviewWidgetType; limit?: number; className?: string; showPopup?: boolean };
const demos: GoogleReview[] = [
  { id: "preview-1", reviewer: "Happy Customer", avatarUrl: "", rating: 5, comment: "Reliable, friendly service and a spotless yard. The whole experience was easy from start to finish.", createdAt: "2026-07-18T12:00:00Z", reviewUrl: "" },
  { id: "preview-2", reviewer: "Local Customer", avatarUrl: "", rating: 5, comment: "Quick communication, dependable visits, and excellent attention to detail. I would absolutely recommend them.", createdAt: "2026-06-08T12:00:00Z", reviewUrl: "" },
  { id: "preview-3", reviewer: "Verified Reviewer", avatarUrl: "", rating: 5, comment: "Signing up was simple and the team has been consistently professional. One less thing for us to worry about.", createdAt: "2026-05-21T12:00:00Z", reviewUrl: "" },
];

export function GoogleReviewWidget({ initialData, type, limit, className = "", showPopup = true }: WidgetProps) {
  const [remote, setRemote] = useState<ReviewSliderPayload | null>(initialData ?? null);
  useEffect(() => { if (!initialData) void fetch("/api/reviews").then((response) => response.json() as Promise<ReviewSliderPayload>).then(setRemote).catch(() => null); }, [initialData]);
  const data = remote; const settings = data?.settings; const source = data?.reviews?.length ? data.reviews : initialData ? demos : []; const reviews = source.slice(0, limit || settings?.maximumReviews || 12);
  if (!settings || (!initialData && (!settings.enabled || !reviews.length))) return null;
  const widgetType = type || settings.widgetType;
  const customProperties = { "--review-accent": settings.accentColor, "--review-card": settings.cardColor, "--review-text": settings.textColor, "--review-radius": `${settings.cardRadius}px`, "--review-gap": `${settings.cardGap}px`, "--review-columns": String(settings.columns) } as CSSProperties;
  return <div className={`${styles.root} ${styles[settings.theme]} ${className}`} style={customProperties} data-review-widget={widgetType}>
    <WidgetHeader settings={settings} data={data} compact={widgetType === "badge"} /><WidgetBody type={widgetType} settings={settings} reviews={reviews} />
    {settings.showReviewButton && settings.reviewButtonUrl ? <a className={styles.reviewButton} href={settings.reviewButtonUrl} target="_blank" rel="noreferrer">{settings.reviewButtonLabel}</a> : null}
    {showPopup && settings.popupEnabled ? <ReviewPopup settings={settings} reviews={reviews} /> : null}
  </div>;
}

export function GoogleReviewSlider(props: Omit<WidgetProps, "type">) { return <GoogleReviewWidget {...props} type="carousel" />; }
export function GoogleReviewCards(props: Omit<WidgetProps, "type">) { return <GoogleReviewWidget {...props} type="cards" />; }
export function GoogleReviewTable(props: Omit<WidgetProps, "type">) { return <GoogleReviewWidget {...props} type="table" />; }
export function GoogleReviewBadge(props: Omit<WidgetProps, "type">) { return <GoogleReviewWidget {...props} type="badge" />; }
export function GoogleReviewPopup(props: Omit<WidgetProps, "type" | "showPopup">) { return <GoogleReviewWidget {...props} type="badge" showPopup />; }

function WidgetHeader({ settings, data, compact }: { settings: ReviewSliderSettings; data: ReviewSliderPayload; compact: boolean }) {
  if (compact) return <div className={styles.badge}><GoogleMark enabled={settings.showGoogleMark} /><span><b>{data.averageRating ? data.averageRating.toFixed(1) : "5.0"}</b><Stars rating={Math.round(data.averageRating || 5)} /><small>{data.totalReviewCount || data.reviews.length} Google reviews</small></span></div>;
  return <header className={styles.header}><div><h2>{settings.heading}</h2><p>{settings.subheading}</p></div>{settings.showRatingSummary && data.averageRating ? <strong>{data.averageRating.toFixed(1)} <span aria-hidden="true">★</span><small>{data.totalReviewCount} Google reviews</small></strong> : null}</header>;
}

function WidgetBody({ type, settings, reviews }: { type: ReviewWidgetType; settings: ReviewSliderSettings; reviews: GoogleReview[] }) {
  if (type === "badge") return null; if (type === "carousel") return <Carousel reviews={reviews} settings={settings} />; if (type === "single") return <ReviewCard review={reviews[0]} settings={settings} className={styles.single} />;
  if (type === "spotlight") return <div className={styles.spotlight}><ReviewCard review={reviews[0]} settings={settings} /><div className={styles.spotlightSide}>{reviews.slice(1, 4).map((review) => <ReviewCard key={review.id} review={review} settings={settings} compact />)}</div></div>;
  if (type === "table") return <div className={styles.tableWrap}><table><thead><tr><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th></tr></thead><tbody>{reviews.map((review) => <tr key={review.id}><td><Reviewer review={review} settings={settings} /></td><td><Stars rating={review.rating} /></td><td>{excerpt(review.comment, settings.excerptLength)}</td><td>{reviewDate(review.createdAt)}</td></tr>)}</tbody></table></div>;
  return <div className={`${styles.collection} ${type === "masonry" ? styles.masonry : type === "list" ? styles.list : ""}`}>{reviews.map((review) => <ReviewCard key={review.id} review={review} settings={settings} compact={type === "list"} />)}</div>;
}

function Carousel({ reviews, settings }: { reviews: GoogleReview[]; settings: ReviewSliderSettings }) {
  const [index, setIndex] = useState(0); useEffect(() => { if (!settings.autoplay || reviews.length < 2) return; const timer = window.setInterval(() => setIndex((value) => (value + 1) % reviews.length), settings.autoplaySeconds * 1000); return () => window.clearInterval(timer); }, [reviews.length, settings.autoplay, settings.autoplaySeconds]);
  if (!reviews.length) return null; const current = index % reviews.length;
  return <div className={styles.carousel} aria-roledescription="carousel" aria-label="Google customer reviews" aria-live="polite"><ReviewCard review={reviews[current]} settings={settings} /><nav aria-label="Review controls"><button onClick={() => setIndex((current - 1 + reviews.length) % reviews.length)} aria-label="Previous review">←</button><span>{reviews.map((review, itemIndex) => <button key={review.id} className={itemIndex === current ? styles.active : ""} onClick={() => setIndex(itemIndex)} aria-label={`Show review ${itemIndex + 1}`} />)}</span><button onClick={() => setIndex((current + 1) % reviews.length)} aria-label="Next review">→</button></nav></div>;
}

function ReviewCard({ review, settings, compact = false, className = "" }: { review?: GoogleReview; settings: ReviewSliderSettings; compact?: boolean; className?: string }) { if (!review) return null; return <article className={`${styles.card} ${compact ? styles.compact : ""} ${className}`}><Reviewer review={review} settings={settings} /><Stars rating={review.rating} /><blockquote>“{excerpt(review.comment, settings.excerptLength)}”</blockquote>{review.reviewUrl ? <a href={review.reviewUrl} target="_blank" rel="noreferrer" aria-label={`Read ${review.reviewer}'s review on Google`}>Read on Google</a> : null}</article>; }
function Reviewer({ review, settings }: { review: GoogleReview; settings: ReviewSliderSettings }) { return <div className={styles.author}>{settings.showAvatar ? review.avatarUrl ? <img src={review.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <i>{review.reviewer.slice(0, 1)}</i> : null}<div><b>{review.reviewer}</b>{settings.showDate && review.createdAt ? <time dateTime={review.createdAt}>{reviewDate(review.createdAt)}</time> : null}</div><GoogleMark enabled={settings.showGoogleMark} /></div>; }
function GoogleMark({ enabled }: { enabled: boolean }) { return enabled ? <em className={styles.google} aria-label="Google review">G</em> : null; }
function Stars({ rating }: { rating: number }) { const safe = Math.max(0, Math.min(5, Math.round(rating))); return <span className={styles.stars} aria-label={`${safe} out of 5 stars`}>{"★".repeat(safe)}{"☆".repeat(5 - safe)}</span>; }

function ReviewPopup({ settings, reviews }: { settings: ReviewSliderSettings; reviews: GoogleReview[] }) {
  const [visible, setVisible] = useState(false); const [index, setIndex] = useState(0); const storageKey = "reggie:google-review-popup:v1"; const eligible = useMemo(() => reviews.filter((review) => review.comment), [reviews]);
  useEffect(() => { if (!eligible.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches || (settings.popupOncePerSession && sessionStorage.getItem(storageKey))) return; let hideTimer = 0; const show = () => { setVisible(true); if (settings.popupOncePerSession) sessionStorage.setItem(storageKey, "shown"); hideTimer = window.setTimeout(() => { setVisible(false); setIndex((value) => (value + 1) % eligible.length); }, settings.popupDurationSeconds * 1000); }; const firstTimer = window.setTimeout(show, settings.popupDelaySeconds * 1000); const interval = settings.popupOncePerSession ? 0 : window.setInterval(show, settings.popupIntervalSeconds * 1000); return () => { window.clearTimeout(firstTimer); window.clearTimeout(hideTimer); if (interval) window.clearInterval(interval); }; }, [eligible, settings.popupDelaySeconds, settings.popupDurationSeconds, settings.popupIntervalSeconds, settings.popupOncePerSession]);
  const review = eligible[index % Math.max(eligible.length, 1)]; if (!review) return null; return <aside className={`${styles.popup} ${styles[settings.popupPosition]} ${visible ? styles.popupVisible : ""}`} aria-live="polite" aria-hidden={!visible}><button className={styles.popupClose} onClick={() => setVisible(false)} aria-label="Dismiss review">×</button><small>Google review</small><Reviewer review={review} settings={settings} /><Stars rating={review.rating} /><p>“{excerpt(review.comment, 150)}”</p></aside>;
}
function excerpt(value: string, length: number) { return value.length > length ? `${value.slice(0, Math.max(1, length - 1)).trim()}…` : value; }
function reviewDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
