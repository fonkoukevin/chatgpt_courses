import type { Locale } from "../i18n/locales";
import { isUuid } from "../api/cms-validation";
import { operationsQueryString, parseOperationsQuery, type AdminOfferQuery, type OperationsQuery } from "./query";

export const operationsSections = ["dashboard", "orders", "support", "content-cases", "metrics", "audit", "incidents"] as const;
export type OperationsSection = typeof operationsSections[number];
export type OperationsPageQuery = { page?: number; pageSize?: number };
const detailSections: readonly OperationsSection[] = ["orders", "support", "content-cases"];
const identifier = (value: string) => { if (!isUuid(value)) throw new Error("Invalid operational resource identifier."); return value.toLowerCase(); };

export function operationsPath(locale: Locale, section: OperationsSection = "dashboard", id?: string): string {
  if (!operationsSections.includes(section) || id !== undefined && !detailSections.includes(section)) throw new Error("Unsupported operational route.");
  return `/${locale}/admin/operations${section === "dashboard" ? "" : `/${section}`}${id === undefined ? "" : `/${identifier(id)}`}`;
}
export const adminOffersPath = (locale: Locale, id?: string) => `/${locale}/admin/offers${id === undefined ? "" : `/${identifier(id)}`}`;
export function operationsLanguages(section: OperationsSection = "dashboard", id?: string): Record<Locale, string> {
  return { fr: operationsPath("fr", section, id), en: operationsPath("en", section, id) };
}
export const adminOffersLanguages = (id?: string): Record<Locale, string> => ({ fr: adminOffersPath("fr", id), en: adminOffersPath("en", id) });
export const operationsHref = (locale: Locale, section: OperationsSection, query: OperationsQuery) => `${operationsPath(locale, section)}?${operationsQueryString(section, query)}`;
export const adminOffersHref = (locale: Locale, query: AdminOfferQuery) => `${adminOffersPath(locale)}?${operationsQueryString("offers", query)}`;

export function safeOperationsDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string" || value.length > 2200 || /[\\#\s]/.test(value)) return null;
  const [path, raw, extra] = value.split("?"); if (extra !== undefined || path.includes("%")) return null;
  for (const section of operationsSections) {
    const base = operationsPath(locale, section);
    if (path === base) { if (raw === undefined) return base; try { return operationsHref(locale, section, parseOperationsQuery(section, new URLSearchParams(raw))); } catch { return null; } }
    if (raw === undefined && detailSections.includes(section) && path.startsWith(`${base}/`)) { const id = path.slice(base.length + 1); if (isUuid(id)) return operationsPath(locale, section, id); }
  }
  const offers = adminOffersPath(locale);
  if (path === offers) { if (raw === undefined) return offers; try { return adminOffersPath(locale) + "?" + operationsQueryString("offers", parseOperationsQuery("offers", new URLSearchParams(raw))); } catch { return null; } }
  if (raw === undefined && path.startsWith(`${offers}/`)) { const id = path.slice(offers.length + 1); if (isUuid(id)) return adminOffersPath(locale, id); }
  return null;
}
export function translateOperationsDestination(value: unknown, locale: Locale): string | null {
  for (const source of ["fr", "en"] as const) { const valid = safeOperationsDestination(value, source); if (valid) return safeOperationsDestination(`/${locale}${valid.slice(3)}`, locale); }
  return null;
}
