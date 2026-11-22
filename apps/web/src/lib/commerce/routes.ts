import { isUuid } from "../api/cms-validation";
import type { Locale } from "../i18n/locales";
import type { CourseOfferFilter } from "../api/commerce-client";

export function offersPath(locale: Locale, id?: string): string {
  if (id !== undefined && !isUuid(id)) throw new Error("Invalid offer identifier.");
  return `/${locale}/${locale === "fr" ? "offres" : "offers"}${id ? `/${id}` : ""}`;
}
export function ordersPath(locale: Locale, id?: string): string {
  if (id !== undefined && !isUuid(id)) throw new Error("Invalid order identifier.");
  const base = `/${locale}/${locale === "fr" ? "commandes" : "orders"}`;
  return id ? `${base}/${id}/${locale === "fr" ? "recapitulatif" : "summary"}` : base;
}
export function orderStatusPath(locale: Locale, id: string, checkout?: "success" | "cancel"): string {
  if (!isUuid(id)) throw new Error("Invalid order identifier.");
  return `/${locale}/${locale === "fr" ? "commandes" : "orders"}/${id}/${locale === "fr" ? "statut" : "status"}${checkout ? `?checkout=${checkout}` : ""}`;
}
export type CommercePagination = { page?: number; pageSize?: number };
export function commercePageQuery(query: CommercePagination): string {
  const value = new URLSearchParams();
  if (query.page !== undefined) { if (!Number.isSafeInteger(query.page) || query.page < 0 || query.page > 1_000_000) throw new Error("Invalid commerce page."); value.set("page", String(query.page)); }
  if (query.pageSize !== undefined) { if (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) throw new Error("Invalid commerce page size."); value.set("pageSize", String(query.pageSize)); }
  return value.size ? `?${value}` : "";
}
export function offersHref(locale: Locale, query: CommercePagination = {}, course?: CourseOfferFilter): string {
  const params = new URLSearchParams(commercePageQuery(query));
  if (course) {
    if (!isUuid(course.resourceId) || !isUuid(course.versionId)) throw new Error("Invalid course offer filter.");
    params.set("resourceId", course.resourceId); params.set("versionId", course.versionId);
  }
  return offersPath(locale) + (params.size ? `?${params}` : "");
}
export const ordersHref = (locale: Locale, query: CommercePagination = {}) => ordersPath(locale) + commercePageQuery(query);
export function safeCommerceDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string" || value.length > 1000 || /[%\\#\s]/.test(value)) return null;
  const [path, raw, extra] = value.split("?"); if (extra !== undefined) return null;
  if (path === offersPath(locale) || path === ordersPath(locale)) {
    if (raw === undefined) return path;
    const query = new URLSearchParams(raw), offerList = path === offersPath(locale);
    if (!query.size || Array.from(query.keys()).some((key) => !(offerList ? ["page", "pageSize", "resourceId", "versionId"] : ["page", "pageSize"]).includes(key) || query.getAll(key).length !== 1)) return null;
    const page = query.get("page"), pageSize = query.get("pageSize");
    if (page !== null && !/^(?:0|[1-9][0-9]{0,6})$/.test(page) || pageSize !== null && !/^[1-9][0-9]{0,2}$/.test(pageSize)) return null;
    const resourceId = query.get("resourceId"), versionId = query.get("versionId");
    if ((resourceId === null) !== (versionId === null) || resourceId !== null && (!isUuid(resourceId) || !isUuid(versionId))) return null;
    const pagination = { ...(page === null ? {} : { page: Number(page) }), ...(pageSize === null ? {} : { pageSize: Number(pageSize) }) };
    try { return offerList ? offersHref(locale, pagination, resourceId && versionId ? { resourceId, versionId } : undefined) : ordersHref(locale, pagination); } catch { return null; }
  }
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  if (new RegExp(`^${ordersPath(locale)}/${uuid}/${locale === "fr" ? "statut" : "status"}$`).test(path)) {
    if (raw === undefined) return path;
    const query = new URLSearchParams(raw); return query.size === 1 && query.getAll("checkout").length === 1 && ["success", "cancel"].includes(query.get("checkout") ?? "") ? `${path}?checkout=${query.get("checkout")}` : null;
  }
  if (raw !== undefined) return null;
  return new RegExp(`^${offersPath(locale)}/${uuid}$`).test(path) || new RegExp(`^${ordersPath(locale)}/${uuid}/${locale === "fr" ? "recapitulatif" : "summary"}$`).test(path) ? path : null;
}
export function translateCommerceDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string") return null;
  const source: Locale = value.startsWith("/fr/") ? "fr" : "en", valid = safeCommerceDestination(value, source);
  if (!valid) return null;
  return safeCommerceDestination(valid.replace(offersPath(source), offersPath(locale)).replace(ordersPath(source), ordersPath(locale)).replace(/\/(?:recapitulatif|summary)(?=\?|$)/, `/${locale === "fr" ? "recapitulatif" : "summary"}`).replace(/\/(?:statut|status)(?=\?|$)/, `/${locale === "fr" ? "statut" : "status"}`), locale);
}
