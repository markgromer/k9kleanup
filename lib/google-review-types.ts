export type GoogleReview = { id: string; reviewer: string; avatarUrl: string; rating: number; comment: string; createdAt: string; reviewUrl: string };
export type ReviewWidgetType = "carousel" | "cards" | "masonry" | "list" | "table" | "single" | "spotlight" | "badge";
export type ReviewSliderSettings = {
  locationName: string; locationTitle: string; enabled: boolean; minimumRating: number; maximumReviews: number;
  heading: string; subheading: string; theme: "light" | "dark" | "brand"; accentColor: string; cardColor: string; textColor: string;
  cardRadius: number; autoplay: boolean; autoplaySeconds: number; showAvatar: boolean; showDate: boolean; showGoogleMark: boolean;
  widgetType: ReviewWidgetType; columns: number; cardGap: number; excerptLength: number; showRatingSummary: boolean; showReviewButton: boolean; reviewButtonLabel: string; reviewButtonUrl: string;
  popupEnabled: boolean; popupPosition: "bottom-left" | "bottom-right"; popupDelaySeconds: number; popupIntervalSeconds: number; popupDurationSeconds: number; popupOncePerSession: boolean;
};

export const defaultReviewSliderSettings: ReviewSliderSettings = { locationName: "", locationTitle: "", enabled: false, minimumRating: 4, maximumReviews: 12, heading: "What our customers say", subheading: "Real reviews from Google", theme: "light", accentColor: "#f4b400", cardColor: "#ffffff", textColor: "#173c36", cardRadius: 18, autoplay: true, autoplaySeconds: 6, showAvatar: true, showDate: true, showGoogleMark: true, widgetType: "carousel", columns: 3, cardGap: 18, excerptLength: 320, showRatingSummary: true, showReviewButton: false, reviewButtonLabel: "Review us on Google", reviewButtonUrl: "", popupEnabled: false, popupPosition: "bottom-left", popupDelaySeconds: 8, popupIntervalSeconds: 45, popupDurationSeconds: 8, popupOncePerSession: true };
