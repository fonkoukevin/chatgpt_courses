import type { PublicActivityContext, PublicPublicationPage } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { isLocale } from "../i18n/locales";

const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
const slug = (v: unknown): v is string => typeof v === "string" && v.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const state = (v: unknown) => typeof v === "string" && ["PUBLISHED", "MISSING_TRANSLATION", "STALE", "WITHDRAWN"].includes(v);
const natural = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function isPublicPublicationPage(v: unknown): v is PublicPublicationPage {
  return record(v) && keys(v, ["items", "page", "pageSize", "total"]) && natural(v.page) && v.page <= 1_000_000 && natural(v.pageSize) && v.pageSize >= 1 && v.pageSize <= 100 && natural(v.total)
    && Array.isArray(v.items) && v.items.length <= v.pageSize && v.items.every(item => record(item) && keys(item, ["resourceId", "kind", "versionId", "versionNumber", "revisionId", "locale", "slug", "title", "summary", "publishedAt", "languages"])
      && isUuid(item.resourceId) && ["COURSE", "GUIDE", "METHOD_TEMPLATE"].includes(String(item.kind)) && isUuid(item.versionId) && natural(item.versionNumber) && item.versionNumber >= 1 && isUuid(item.revisionId) && isLocale(item.locale) && slug(item.slug)
      && typeof item.title === "string" && item.title.length > 0 && typeof item.summary === "string"
      && (item.publishedAt === null || typeof item.publishedAt === "string" && item.publishedAt.endsWith("Z") && Number.isFinite(Date.parse(item.publishedAt)))
      && Array.isArray(item.languages) && item.languages.length >= 1 && item.languages.length <= 2 && new Set(item.languages.map(l => record(l) ? l.locale : null)).size === item.languages.length
      && item.languages.every(l => record(l) && keys(l, ["locale", "slug"]) && isLocale(l.locale) && slug(l.slug))
      && item.languages.some(l => record(l) && l.locale === item.locale && l.slug === item.slug));
}
export function isPublicActivityContext(v: unknown): v is PublicActivityContext {
  return record(v) && keys(v, ["courseResourceId", "courseVersionId", "activityResourceId", "activityVersionId", "locale", "availability", "courseSlug", "activitySlug", "languages"])
    && [v.courseResourceId, v.courseVersionId, v.activityResourceId, v.activityVersionId].every(isUuid) && isLocale(v.locale) && state(v.availability)
    && (v.courseSlug === null || slug(v.courseSlug)) && (v.activitySlug === null || slug(v.activitySlug))
    && (v.availability !== "PUBLISHED" || slug(v.courseSlug) && slug(v.activitySlug))
    && Array.isArray(v.languages) && v.languages.length === 2 && new Set(v.languages.map(l => record(l) ? l.locale : null)).size === 2
    && v.languages.every(l => record(l) && keys(l, ["locale", "availability", "courseSlug", "activitySlug"]) && isLocale(l.locale) && state(l.availability) && (l.courseSlug === null || slug(l.courseSlug)) && (l.activitySlug === null || slug(l.activitySlug)) && (l.availability !== "PUBLISHED" || slug(l.courseSlug) && slug(l.activitySlug)))
    && v.languages.some(l => record(l) && l.locale === v.locale && l.availability === v.availability && l.courseSlug === v.courseSlug && l.activitySlug === v.activitySlug);
}
