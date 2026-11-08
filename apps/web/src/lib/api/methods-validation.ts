import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { isCompleteMethodDefinition, isMethodParameters, validMethodText } from "../methods/validation";
import type { MethodFields, MethodOrigin, MethodPage, MethodSourceUpdate, MethodSummary, MethodTemplate, MethodView } from "./generated/types.gen";

const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const locale = (value: unknown) => value === "fr" || value === "en";
const instant = (value: unknown): value is string => typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
const category = (value: unknown) => value === null || validMethodText(value, 80, 1);
export function isMethodFields(value: unknown): value is MethodFields {
  return record(value) && keys(value, ["title", "locale", "text", "parameters", "generatedFrom", "notes", "category"])
    && validMethodText(value.title, 240, 1) && locale(value.locale) && validMethodText(value.text, 32000, 1)
    && isMethodParameters(value.parameters) && (value.generatedFrom === null || isMethodParameters(value.generatedFrom))
    && validMethodText(value.notes, 8000) && category(value.category) && new TextEncoder().encode(JSON.stringify(value)).length <= 48 * 1024;
}
export function isMethodOrigin(value: unknown): value is MethodOrigin {
  return record(value) && keys(value, ["resourceId", "versionId", "translationId", "revisionId", "locale", "title", "slug"])
    && [value.resourceId, value.versionId, value.translationId, value.revisionId].every(isUuid) && locale(value.locale)
    && validMethodText(value.title, 240, 1) && typeof value.slug === "string" && value.slug.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug);
}
export function isMethodView(value: unknown): value is MethodView {
  if (!record(value) || !keys(value, ["id", "revision", "title", "locale", "text", "parameters", "generatedFrom", "notes", "category", "origin", "createdAt", "updatedAt"])) return false;
  const { title, text, parameters, generatedFrom, notes, category: group, locale: language } = value;
  return isUuid(value.id) && integer(value.revision) && isMethodFields({ title, text, parameters, generatedFrom, notes, category: group, locale: language })
    && (value.origin === null || isMethodOrigin(value.origin)) && instant(value.createdAt) && instant(value.updatedAt) && Date.parse(value.updatedAt) >= Date.parse(value.createdAt);
}
export function methodEtagMatches(value: MethodView, etag: string | null | undefined): boolean { return etag === `"personal-method-${value.id}-r${value.revision}"`; }
function isMethodSummary(value: unknown): value is MethodSummary {
  return record(value) && keys(value, ["id", "revision", "title", "locale", "category", "updatedAt", "hasSource"])
    && isUuid(value.id) && integer(value.revision) && validMethodText(value.title, 240, 1) && locale(value.locale) && category(value.category)
    && instant(value.updatedAt) && typeof value.hasSource === "boolean";
}
export function isMethodPage(value: unknown): value is MethodPage {
  return record(value) && keys(value, ["items", "page", "pageSize", "total"]) && Array.isArray(value.items) && value.items.length <= 100 && value.items.every(isMethodSummary)
    && integer(value.page) && value.page <= 1_000_000 && integer(value.pageSize) && value.pageSize >= 1 && value.pageSize <= 100 && integer(value.total);
}
export function isMethodSourceUpdate(value: unknown): value is MethodSourceUpdate {
  if (!record(value) || !keys(value, ["status", "source", "candidate"]) || !["NONE", "CURRENT", "UPDATE_AVAILABLE", "UNAVAILABLE"].includes(String(value.status))) return false;
  if (value.status === "NONE") return value.source === null && value.candidate === null;
  if (!isMethodOrigin(value.source)) return false;
  if (value.status === "UNAVAILABLE") return value.candidate === null;
  if (!isMethodOrigin(value.candidate) || value.candidate.resourceId !== value.source.resourceId || value.candidate.locale !== value.source.locale) return false;
  return value.status === "CURRENT" ? value.candidate.versionId === value.source.versionId && value.candidate.translationId === value.source.translationId && value.candidate.revisionId === value.source.revisionId
    : value.candidate.revisionId !== value.source.revisionId;
}
export function isMethodTemplate(value: unknown): value is MethodTemplate {
  return record(value) && keys(value, ["resourceId", "versionId", "revisionId", "locale", "title", "slug", "availability", "definition"])
    && isUuid(value.resourceId) && isUuid(value.versionId) && (value.revisionId === null || isUuid(value.revisionId)) && locale(value.locale)
    && (value.title === null || validMethodText(value.title, 240, 1)) && (value.slug === null || (typeof value.slug === "string" && value.slug.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)))
    && ["PUBLISHED", "MISSING_DEFINITION", "PROTECTED", "STALE", "WITHDRAWN", "MISSING_TRANSLATION"].includes(String(value.availability))
    && (value.availability === "PUBLISHED" ? isCompleteMethodDefinition(value.definition) && isUuid(value.revisionId) && typeof value.title === "string" && typeof value.slug === "string" : value.definition === null);
}
