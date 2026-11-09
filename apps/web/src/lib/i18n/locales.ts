export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];

export const localeName = (locale: Locale) => locale === "fr" ? "Français" : "English";
export const unsavedChangesMessage = (locale: Locale) => locale === "fr"
  ? "Des modifications ne sont pas enregistrées. Quitter cette page et les abandonner ?"
  : "Some changes have not been saved. Leave this page and discard them?";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}
