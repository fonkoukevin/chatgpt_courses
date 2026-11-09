import type { Locale } from "../i18n/locales";
import { isUuid } from "../api/cms-validation";

export type AccountSection = "home" | "attestations" | "help" | "data";
export type AccountListQuery = { page?: number; pageSize?: number };
export type AccountHelpQuery = AccountListQuery & { state?: string; contextLocale?: Locale; resourceId?: string; versionId?: string; revisionId?: string; orderId?: string; projectId?: string; enrollmentId?: string };
export const accountPath = (locale: Locale) => locale === "fr" ? "/fr/compte" : "/en/account";
const id = (value: string) => { if (!isUuid(value)) throw new Error("Invalid account resource identifier."); return value.toLowerCase(); };
export const attestationsPath = (locale: Locale, attestationId?: string) => `${accountPath(locale)}/attestations${attestationId === undefined ? "" : `/${id(attestationId)}`}`;
export const helpPath = (locale: Locale, ticketId?: string) => `${accountPath(locale)}/${locale === "fr" ? "aide" : "help"}${ticketId === undefined ? "" : `/${id(ticketId)}`}`;
export const dataRequestsPath = (locale: Locale) => `${accountPath(locale)}/${locale === "fr" ? "donnees" : "data"}`;
export function accountSectionPath(locale: Locale, section: AccountSection = "home", resourceId?: string): string {
  if (section === "attestations") return attestationsPath(locale, resourceId);
  if (section === "help") return helpPath(locale, resourceId);
  if (resourceId !== undefined) throw new Error("This account section has no detail route.");
  return section === "data" ? dataRequestsPath(locale) : accountPath(locale);
}
export function accountLanguages(section: AccountSection = "home", resourceId?: string): Record<Locale, string> {
  return { fr: accountSectionPath("fr", section, resourceId), en: accountSectionPath("en", section, resourceId) };
}
export function accountListHref(locale: Locale, section: Exclude<AccountSection, "home">, query: AccountListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) { if (!Number.isSafeInteger(query.page) || query.page < 0 || query.page > 1_000_000) throw new Error("Invalid account list page."); params.set("page", String(query.page)); }
  if (query.pageSize !== undefined) { if (!Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) throw new Error("Invalid account list page size."); params.set("pageSize", String(query.pageSize)); }
  return accountSectionPath(locale, section) + (params.size ? `?${params}` : "");
}
export function attestationsHref(locale: Locale, query: AccountListQuery & { enrollmentId?: string } = {}) { const base = accountListHref(locale, "attestations", query); if (!query.enrollmentId) return base; const [path, raw] = base.split("?"); const params = new URLSearchParams(raw); params.set("enrollmentId", id(query.enrollmentId)); return `${path}?${params}`; }
const supportStates = ["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"];
const supportTargets = ["resourceId", "versionId", "revisionId", "orderId", "projectId", "enrollmentId"] as const;
export function helpHref(locale: Locale, query: AccountHelpQuery = {}) {
  const [path, raw] = accountListHref(locale, "help", query).split("?"), params = new URLSearchParams(raw);
  if (query.state) { if (!supportStates.includes(query.state)) throw new Error("Invalid support list state."); params.set("state", query.state); }
  for (const target of supportTargets) if (query[target]) params.set(target, id(query[target]));
  if (query.contextLocale !== undefined) {
    if (!["fr", "en"].includes(query.contextLocale) || !supportTargets.some(target => params.has(target))) throw new Error("A support context requires its own supported locale and target.");
    params.set("contextLocale", query.contextLocale);
  }
  if (params.has("resourceId") !== params.has("versionId") || params.has("revisionId") && !params.has("resourceId")) throw new Error("A support resource context requires its exact version.");
  return path + (params.size ? `?${params}` : "");
}
export const dataRequestsHref = (locale: Locale, query: AccountListQuery = {}) => accountListHref(locale, "data", query);

/** Only known private account paths are accepted. Free-form messages never enter URLs. */
export function safeAccountDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string" || value.length > 800 || /[%\\#\s]/.test(value)) return null;
  const [path, raw, extra] = value.split("?"); if (extra !== undefined) return null;
  if (path === accountPath(locale)) return raw === undefined ? path : null;
  for (const section of ["attestations", "help", "data"] as const) {
    const base = accountSectionPath(locale, section);
    if (path === base) {
      if (raw === undefined) return path;
      const params = new URLSearchParams(raw);
      const allowed: readonly string[] = section === "help" ? ["page", "pageSize", "state", "contextLocale", ...supportTargets] : section === "attestations" ? ["page", "pageSize", "enrollmentId"] : ["page", "pageSize"];
      if (!params.size || Array.from(params.keys()).some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return null;
      const page = params.get("page"), pageSize = params.get("pageSize");
      if (page !== null && !/^(?:0|[1-9][0-9]{0,6})$/.test(page) || pageSize !== null && !/^[1-9][0-9]{0,2}$/.test(pageSize)) return null;
      const paging = { ...(page === null ? {} : { page: Number(page) }), ...(pageSize === null ? {} : { pageSize: Number(pageSize) }) };
      try {
        if (section === "attestations") { const enrollmentId = params.get("enrollmentId"); if (enrollmentId !== null && !isUuid(enrollmentId)) return null; return attestationsHref(locale, { ...paging, ...(enrollmentId ? { enrollmentId } : {}) }); }
        if (section === "help") { const context: AccountHelpQuery = { ...paging }; for (const target of supportTargets) if (params.has(target)) { const value = params.get(target); if (!isUuid(value)) return null; context[target] = value; } const state = params.get("state"); if (state !== null && state !== "" && !supportStates.includes(state)) return null; if (state) context.state = state; const contextLocale = params.get("contextLocale"); if (contextLocale !== null) { if (contextLocale !== "fr" && contextLocale !== "en") return null; context.contextLocale = contextLocale; } return helpHref(locale, context); }
        return accountListHref(locale, section, paging);
      } catch { return null; }
    }
    if (section !== "data" && raw === undefined && path.startsWith(`${base}/`)) {
      const resourceId = path.slice(base.length + 1);
      if (isUuid(resourceId)) return accountSectionPath(locale, section, resourceId);
    }
  }
  return null;
}
export function translateAccountDestination(value: unknown, locale: Locale): string | null {
  for (const source of ["fr", "en"] as const) {
    const safe = safeAccountDestination(value, source); if (!safe) continue;
    if (safe === accountPath(source)) return accountPath(locale);
    for (const section of ["attestations", "help", "data"] as const) {
      const from = accountSectionPath(source, section);
      if (safe === from || safe.startsWith(`${from}?`) || safe.startsWith(`${from}/`)) return safeAccountDestination(accountSectionPath(locale, section) + safe.slice(from.length), locale);
    }
  }
  return null;
}
