import type { SearchCatalogueData } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";

export type PublicParameters = Record<string, string | string[] | undefined>;
const filterKeys = ["q", "type", "goal", "level", "locale", "access", "page", "pageSize", "sort"] as const;
const hasControl = (value: string) => Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export function singleParameter(value: string | string[] | undefined): string | undefined | null { return Array.isArray(value) ? null : value; }
export function parseCatalogueQuery(locale: Locale, input: PublicParameters): SearchCatalogueData["query"] | null {
  const values: Record<string, string | undefined> = {};
  for (const key of filterKeys) {
    const value = singleParameter(input[key]);
    if (value === null || (value && hasControl(value))) return null;
    values[key] = value || undefined;
  }
  if ((values.q?.length ?? 0) > 240) return null;
  if (values.type && !["COURSE", "ACTIVITY", "GUIDE", "METHOD_TEMPLATE"].includes(values.type)) return null;
  if (values.goal && !["understand-brief", "define-scope", "prepare-prompt", "build-proposal", "check-output", "reuse-method"].includes(values.goal)) return null;
  if (values.level && !["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(values.level)) return null;
  if (values.locale && !["fr", "en"].includes(values.locale)) return null;
  if (values.access && !["FREE", "PROTECTED"].includes(values.access)) return null;
  if (values.sort && !["TITLE", "RECENT"].includes(values.sort)) return null;
  const page = values.page ?? "0", size = values.pageSize ?? "20";
  if (!/^\d+$/.test(page) || Number(page) > 1_000_000 || !/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 100) return null;
  return { locale: (values.locale ?? locale) as Locale, q: values.q?.trim() || undefined,
    type: values.type as SearchCatalogueData["query"]["type"], goal: values.goal as SearchCatalogueData["query"]["goal"],
    level: values.level as SearchCatalogueData["query"]["level"], access: values.access as SearchCatalogueData["query"]["access"],
    page: Number(page), pageSize: Number(size), sort: (values.sort ?? "TITLE") as "TITLE" | "RECENT" };
}

export function safeCatalogueReturnTo(value: unknown, fallbackLocale: Locale): string {
  const fallback = fallbackLocale === "fr" ? "/fr/catalogue" : "/en/catalog";
  if (typeof value !== "string" || value.length > 2000 || !/^\/(fr\/catalogue|en\/catalog)(?:\?|$)/.test(value) || /[\\#]/.test(value) || hasControl(value)) return fallback;
  try {
    const url = new URL(value, "https://courses.invalid");
    if (!["/fr/catalogue", "/en/catalog"].includes(url.pathname)) return fallback;
    const params: PublicParameters = {};
    for (const [key, entry] of url.searchParams) {
      if (!filterKeys.includes(key as typeof filterKeys[number]) || Object.hasOwn(params, key)) return fallback;
      params[key] = entry;
    }
    if (!parseCatalogueQuery(url.pathname.startsWith("/fr/") ? "fr" : "en", params)) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}
