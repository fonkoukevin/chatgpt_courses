export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}
