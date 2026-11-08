import type { NotificationSummary } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";

export type NotificationListQuery = { status?: NotificationSummary["status"]; page?: number; pageSize?: number };
export const notificationStatuses = ["PENDING", "PROCESSING", "RETRY", "SENT", "DEAD", "INDETERMINATE"] as const;
export const notificationsPath = (locale: Locale) => `/${locale}/admin/notifications`;
export function notificationsHref(locale: Locale, query: NotificationListQuery = {}): string {
  const params = new URLSearchParams();
  for (const key of ["status", "page", "pageSize"] as const) if (query[key] !== undefined) params.set(key, String(query[key]));
  return notificationsPath(locale) + (params.size ? `?${params}` : "");
}
export function safeNotificationsDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string" || value.length > 800 || /[\\\s#]/.test(value)) return null;
  if (value !== notificationsPath(locale) && !value.startsWith(notificationsPath(locale) + "?")) return null;
  const url = new URL(value, "https://courses.invalid");
  if (url.origin !== "https://courses.invalid" || url.pathname !== notificationsPath(locale) || value.split("?", 1)[0] !== url.pathname) return null;
  for (const [key, item] of url.searchParams) {
    if (!["status", "page", "pageSize"].includes(key) || url.searchParams.getAll(key).length !== 1) return null;
    if (key === "status" && item !== "" && !notificationStatuses.some((status) => status === item)) return null;
    if (key === "page" && (!/^\d+$/.test(item) || Number(item) > 1_000_000)) return null;
    if (key === "pageSize" && (!/^\d+$/.test(item) || Number(item) < 1 || Number(item) > 100)) return null;
  }
  return url.pathname + url.search;
}
export function translateNotificationsDestination(value: unknown, locale: Locale): string | null {
  for (const source of ["fr", "en"] as const) { const valid = safeNotificationsDestination(value, source); if (valid) return notificationsPath(locale) + new URL(valid, "https://courses.invalid").search; }
  return null;
}
