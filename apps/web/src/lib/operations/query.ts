import type { Locale } from "../i18n/locales";
import { isUuid } from "../api/cms-validation";
import { paymentStatuses, fulfillmentStatuses } from "../api/payments-validation";
import { supportStates } from "../api/support-validation";
import type { OperationsSection } from "./routes";

export type OperationsPeriodQuery = { from: string; to: string };
export type OperationsPagination = { page?: number; pageSize?: number };
export type AdminOrderQuery = OperationsPeriodQuery & OperationsPagination & { paymentStatus?: string; fulfillmentStatus?: string; offerId?: string; currency?: string };
export type IncidentQuery = OperationsPeriodQuery & OperationsPagination & { kind?: string; state?: string };
export type AuditQuery = OperationsPeriodQuery & OperationsPagination & { source?: string; action?: string; actorId?: string; objectId?: string };
export type ContentCaseQuery = OperationsPeriodQuery & OperationsPagination & { state?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED"; resourceId?: string };
export type MetricsQuery = OperationsPeriodQuery & { currency?: string };
export type AdminOfferQuery = OperationsPagination & { locale: Locale; q?: string; state?: "DRAFT" | "ACTIVE" | "INACTIVE"; kind?: "COURSE" | "PACK" };
export type OperationsQuery = Partial<OperationsPeriodQuery> & OperationsPagination & { [key: string]: string | number | undefined };
export type OperationsQuerySection = OperationsSection | "offers";
export const incidentKinds = ["NOTIFICATION", "PAYMENT_EVENT", "PAYMENT_RECONCILIATION", "CHECKOUT_OPERATION", "REFUND_OPERATION", "REFUND_RECONCILIATION"] as const;
const keys: Record<OperationsQuerySection, readonly string[]> = { dashboard: ["from", "to"], orders: ["from", "to", "paymentStatus", "fulfillmentStatus", "offerId", "currency", "page", "pageSize"], support: ["state", "page", "pageSize"], "content-cases": ["from", "to", "state", "resourceId", "page", "pageSize"], metrics: ["from", "to", "currency"], audit: ["from", "to", "source", "action", "actorId", "objectId", "page", "pageSize"], incidents: ["from", "to", "kind", "state", "page", "pageSize"], offers: ["locale", "q", "state", "kind", "page", "pageSize"] };
export function operationsPeriod(from: string, to: string): OperationsPeriodQuery {
  const instant = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19) === value.slice(0,19);
  if (!instant(from) || !instant(to) || Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new Error("An explicit UTC period up to 366 days is required.");
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
export function operationsQueryString(section: OperationsQuerySection, query: OperationsQuery): string {
  if (Object.keys(query).some(key => !keys[section].includes(key))) throw new Error("Unsupported operations filter.");
  const params = new URLSearchParams();
  if (section !== "offers" && section !== "support") { const period = operationsPeriod(String(query.from ?? ""), String(query.to ?? "")); params.set("from", period.from); params.set("to", period.to); }
  for (const key of keys[section]) {
    if (key === "from" || key === "to") continue;
    const value = query[key]; if (value === undefined || value === "") continue;
    if (key === "page" || key === "pageSize") { if (!Number.isSafeInteger(value) || Number(value) < (key === "page" ? 0 : 1) || Number(value) > (key === "page" ? 1000000 : 100)) throw new Error("Invalid operations pagination."); }
    else if (["offerId", "actorId", "objectId", "resourceId"].includes(key)) { if (!isUuid(value)) throw new Error("Invalid operations reference."); }
    else if (key === "locale") { if (value !== "fr" && value !== "en") throw new Error("Invalid offer locale."); }
    else if (key === "currency") { if (!["EUR", "USD", "GBP"].includes(String(value))) throw new Error("Unsupported currency filter."); }
    else if (key === "q") { if (typeof value !== "string" || [...value].length > 240 || Array.from(value).some(char => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127)) throw new Error("Invalid offer search."); }
    else if (key === "kind" && section === "incidents") { if (!incidentKinds.some(kind => kind === value)) throw new Error("Invalid incident kind."); }
    else if (key === "kind" && section === "offers") { if (!['COURSE','PACK'].includes(String(value))) throw new Error("Invalid offer kind."); }
    else if (key === "paymentStatus") { if (!paymentStatuses.includes(String(value))) throw new Error("Invalid payment filter."); }
    else if (key === "fulfillmentStatus") { if (!fulfillmentStatuses.includes(String(value))) throw new Error("Invalid access filter."); }
    else if (key === "state") { const states:readonly string[]=section==='offers'?['DRAFT','ACTIVE','INACTIVE']:section==='support'?supportStates:section==='content-cases'?['OPEN','IN_PROGRESS','RESOLVED','DISMISSED']:['RETRY','DEAD','INDETERMINATE','UNKNOWN','NEEDS_REVIEW','PROCESSING'];if(!states.includes(String(value)))throw new Error("Invalid state filter."); }
    else if (key === "source" && section === "audit") { if (!['EDITORIAL','OFFER','PAYMENT','NOTIFICATION','REFUND','SUPPORT','OPERATIONS'].includes(String(value))) throw new Error("Invalid journal source."); }
    else if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{0,99}$/.test(value)) throw new Error("Invalid operations filter code.");
    params.set(key, String(value));
  }
  if (section === "offers" && !params.has("locale")) throw new Error("An offer content locale is required.");
  return params.toString();
}
export function parseOperationsQuery(section: OperationsQuerySection, values: URLSearchParams): OperationsQuery {
  const query: OperationsQuery = {};
  for (const [key, value] of values) { if (!keys[section].includes(key) || values.getAll(key).length !== 1) throw new Error("Invalid or duplicated operations filter."); if (key === "page" || key === "pageSize") { if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid page."); query[key] = Number(value); } else query[key] = value; }
  return Array.from(new URLSearchParams(operationsQueryString(section, query)).entries()).reduce<OperationsQuery>((result, [key, value]) => ({ ...result, [key]: key === "page" || key === "pageSize" ? Number(value) : value }), {});
}
export function defaultOperationsPeriod(now = new Date()): OperationsPeriodQuery { return operationsPeriod(new Date(now.getTime() - 30 * 86400000).toISOString(), now.toISOString()); }
