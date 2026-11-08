import type { Locale } from "../i18n/locales";
import { isUuid } from "../api/cms-validation";
import { safeCatalogueReturnTo } from "../public/query";
import { learningPath } from "./routes";

// Authentication can change its own interface language without inventing a
// translated slug. A pinned public activity returns to its original language.
export function safeLearningDestination(value: unknown, locale: Locale): string | null {
  if (value === learningPath(locale)) return value;
  if (typeof value === "string") {
    const history = new RegExp(`^${learningPath(locale)}/([0-9a-fA-F-]{36})$`).exec(value);
    if (history && isUuid(history[1])) return value;
  }
  if (typeof value !== "string" || value.length > 5000 || !value.startsWith("/") || value.startsWith("//") || /[\s\\#]/.test(value)
    || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  const target = new URL(value, "https://courses.invalid");
  if (target.origin !== "https://courses.invalid" || /%/.test(target.pathname) || target.pathname !== value.split("?", 1)[0]) return null;
  const route = /^\/(fr\/apprendre|en\/learn)\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.pathname);
  const discovery = target.pathname === "/fr/catalogue" || target.pathname === "/en/catalog";
  if (!route && !discovery) return null;
  const allowed = route ? ["resource", "version", "courseVersion", "returnTo"] : ["activity", "version", "locale", "returnTo"];
  for (const key of target.searchParams.keys()) if (!allowed.includes(key) || target.searchParams.getAll(key).length !== 1) return null;
  if (!isUuid(target.searchParams.get(route ? "resource" : "activity")) || !isUuid(target.searchParams.get("version"))) return null;
  if (route && !isUuid(target.searchParams.get("courseVersion"))) return null;
  const contentLocale = target.searchParams.get("locale");
  if (contentLocale !== null && contentLocale !== "fr" && contentLocale !== "en") return null;
  const back = target.searchParams.get("returnTo"), sourceLocale = target.pathname.startsWith("/fr/") ? "fr" : "en";
  if (back !== null && safeCatalogueReturnTo(back, sourceLocale) !== back) return null;
  return target.pathname + target.search;
}
export function translateLearningDestination(value: unknown, locale: Locale): string | null {
  if (value === learningPath("fr") || value === learningPath("en")) return learningPath(locale);
  if (typeof value === "string") {
    for (const source of ["fr", "en"] as const) {
      const history = new RegExp(`^${learningPath(source)}/([0-9a-fA-F-]{36})$`).exec(value);
      if (history && isUuid(history[1])) return `${learningPath(locale)}/${history[1]}`;
    }
  }
  return safeLearningDestination(value, locale);
}
