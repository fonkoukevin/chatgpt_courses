export const projectCategories = ["fidelity", "scope", "budget", "schedule", "presentation"] as const;
export const projectCriterionKeys = projectCategories.flatMap((category) => [1, 2, 3, 4].map((n) => `${category}-${n}`));
export const projectBlockingKeys = ["invented-claims", "definitive-wrong-total", "unpriced-inclusion", "unsupported-date"] as const;
export const projectSections = ["objective", "scope", "method", "timeline", "budget", "clarifications", "nextStep"] as const;
