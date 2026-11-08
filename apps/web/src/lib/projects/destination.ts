import type { Locale } from "../i18n/locales";
import { isUuid } from "../api/cms-validation";
import { projectsPath, projectsNewHref } from "./routes";

export function safeProjectsDestination(value: unknown, locale: Locale): string | null {
  if (typeof value !== "string" || value.length > 3000 || !value.startsWith("/") || value.startsWith("//") || /[\\\s#]/.test(value)) return null;
  const url = new URL(value, "https://courses.invalid"), base = projectsPath(locale);
  if (url.origin !== "https://courses.invalid" || url.pathname !== value.split("?", 1)[0] || /%/.test(url.pathname)) return null;
  const tail = url.pathname.slice(base.length);
  if (!url.pathname.startsWith(base) || tail !== "" && tail !== `/${locale === "fr" ? "nouveau" : "new"}` && !(tail.startsWith("/") && isUuid(tail.slice(1)))) return null;
  const isNew = url.pathname === projectsNewHref(locale), isList = url.pathname === base;
  const allowed = isNew ? ["draft"] : isList ? ["q", "state", "activityId", "activityVersionId", "page", "pageSize"] : [];
  for (const [key, field] of url.searchParams) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) return null;
    if (["draft", "activityId", "activityVersionId"].includes(key) && !isUuid(field)) return null;
    if (key === "q" && field.length > 240 || key === "state" && !["", "DRAFT", "READY_FOR_SELF_ASSESSMENT", "SELF_ASSESSED", "NEEDS_REVISION"].includes(field)) return null;
    if (key === "page" && (!/^\d+$/.test(field) || Number(field) > 1_000_000)) return null;
    if (key === "pageSize" && (!/^\d+$/.test(field) || Number(field) < 1 || Number(field) > 100)) return null;
  }
  return url.pathname + url.search;
}
export function translateProjectsDestination(value: unknown, locale: Locale): string | null {
  for (const source of ["fr", "en"] as const) {
    const valid = safeProjectsDestination(value, source); if (!valid) continue;
    const url = new URL(valid, "https://courses.invalid"), base = projectsPath(source);
    const path = url.pathname === projectsNewHref(source) ? projectsNewHref(locale) : projectsPath(locale) + url.pathname.slice(base.length);
    return path + url.search;
  }
  return null;
}
