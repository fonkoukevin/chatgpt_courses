import { isUuid } from "../api/cms-validation";
import type { Locale } from "../i18n/locales";
import { refundOperationStates, refundRequestStates } from "../api/refunds-validation";

const id = (value: string) => { if (!isUuid(value)) throw new Error("Invalid refund route identifier."); return value; };
export const orderRefundsPath = (locale: Locale, orderId: string) => `/${locale}/${locale === "fr" ? "commandes" : "orders"}/${id(orderId)}/${locale === "fr" ? "remboursements" : "refunds"}`;
export const adminRefundsPath = (locale: Locale, requestId?: string) => `/${locale}/admin/operations/refunds${requestId ? `/${id(requestId)}` : ""}`;
export const adminRefundOperationPath = (locale: Locale, operationId: string) => `${adminRefundsPath(locale)}/operations/${id(operationId)}`;
export const entitlementsPath = (locale: Locale) => locale === "fr" ? "/fr/compte/acces" : "/en/account/access";
export type RefundPageQuery = { page?: number; pageSize?: number };
export type RefundAdminQuery = RefundPageQuery & { view?: "requests" | "operations"; state?: string; orderId?: string };
export function refundPageQuery(query: RefundPageQuery = {}): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) { if (!Number.isSafeInteger(query.page) || query.page < 0 || query.page > 1_000_000) throw new Error("Invalid refund page."); params.set("page", String(query.page)); }
  if (query.pageSize !== undefined) { if (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) throw new Error("Invalid refund page size."); params.set("pageSize", String(query.pageSize)); }
  return params.size ? `?${params}` : "";
}
export function adminRefundsHref(locale: Locale, query: RefundAdminQuery = {}) {
  const params = new URLSearchParams(refundPageQuery(query));
  if (query.view !== undefined) { if (!["requests", "operations"].includes(query.view)) throw new Error("Invalid refund list view."); params.set("view", query.view); }
  if (query.state) { if (!(query.view === "operations" ? refundOperationStates : refundRequestStates).some(state => state === query.state)) throw new Error("Invalid refund list state."); params.set("state", query.state); }
  if (query.orderId) params.set("orderId", id(query.orderId));
  return adminRefundsPath(locale) + (params.size ? `?${params}` : "");
}
export function safeRefundsDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string" || value.length > 1000 || /[%\\#\s]/.test(value)) return null;
  const [path, raw, extra] = value.split("?"); if (extra !== undefined) return null;
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const orderList = new RegExp(`^/${locale}/${locale === "fr" ? "commandes" : "orders"}/${uuid}/${locale === "fr" ? "remboursements" : "refunds"}$`).test(path);
  if (path === adminRefundsPath(locale) || path === entitlementsPath(locale) || orderList) {
    if (raw === undefined) return path;
    const query = new URLSearchParams(raw), allowed = path === adminRefundsPath(locale) ? ["page", "pageSize", "view", "state", "orderId"] : ["page", "pageSize"];
    if (!query.size || Array.from(query.keys()).some((key) => !allowed.includes(key) || query.getAll(key).length !== 1)) return null;
    const page = query.get("page"), pageSize = query.get("pageSize");
    if (page !== null && !/^(?:0|[1-9][0-9]{0,6})$/.test(page) || pageSize !== null && !/^[1-9][0-9]{0,2}$/.test(pageSize)) return null;
    const paging = { ...(page === null ? {} : { page: Number(page) }), ...(pageSize === null ? {} : { pageSize: Number(pageSize) }) };
    try { return path === adminRefundsPath(locale) ? adminRefundsHref(locale, { ...paging, ...(query.has("view") ? { view: query.get("view") as RefundAdminQuery["view"] } : {}), ...(query.has("state") ? { state: query.get("state")! } : {}), ...(query.has("orderId") ? { orderId: query.get("orderId")! } : {}) }) : path + refundPageQuery(paging); } catch { return null; }
  }
  if (raw !== undefined) return null;
  return new RegExp(`^${adminRefundsPath(locale)}/(?:operations/)?${uuid}$`).test(path) ? path : null;
}
export function translateRefundsDestination(value: unknown, locale: Locale): string | null {
  for (const source of ["fr", "en"] as const) {
    const valid = safeRefundsDestination(value, source); if (!valid) continue;
    if (valid.startsWith(adminRefundsPath(source))) return safeRefundsDestination(valid.replace(adminRefundsPath(source), adminRefundsPath(locale)), locale);
    if (valid.startsWith(entitlementsPath(source))) return safeRefundsDestination(valid.replace(entitlementsPath(source), entitlementsPath(locale)), locale);
    const orderId = valid.split("/")[3]; return orderRefundsPath(locale, orderId) + (valid.includes("?") ? `?${valid.split("?")[1]}` : "");
  }
  return null;
}
