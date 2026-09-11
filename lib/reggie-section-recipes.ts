export const reggieSectionRecipes = [
  {
    id: "local-service-lead-gen",
    name: "Local service lead generation",
    description: "Best for a service, city, or paid-search page with local proof and a direct quote path.",
    sections: ["Hero", "Local proof", "Service benefits", "How it works", "Reviews", "Service area", "Quote CTA", "FAQ"],
  },
  {
    id: "seasonal-offer",
    name: "Seasonal offer",
    description: "Best for a time-sensitive promotion with explicit offer details and trust proof.",
    sections: ["Offer hero", "Offer details", "Service benefits", "Trust proof", "Quote CTA", "FAQ"],
  },
  {
    id: "commercial-service",
    name: "Commercial service",
    description: "Best for property managers and commercial buyers evaluating reliability and coverage.",
    sections: ["Commercial hero", "Property types", "Service plan", "Operational proof", "Case study", "Consultation CTA", "FAQ"],
  },
] as const;

export type ReggieSectionRecipeId = (typeof reggieSectionRecipes)[number]["id"];

export function getReggieSectionRecipe(value: string) {
  return reggieSectionRecipes.find((recipe) => recipe.id === value) ?? reggieSectionRecipes[0];
}
