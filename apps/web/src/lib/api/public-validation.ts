import { record } from "./auth-validation";
import { isMethodDefinition } from "../methods/validation";
import { isQuizPolicy } from "./quiz-policy-validation";
import { isProjectPolicy } from "./project-policy-validation";
import type { CatalogueFacets, CataloguePage, PublicDocument, PublicMetadata, ResourceDetail } from "./generated/types.gen";

const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every((key) => allowed.includes(key));
const str = (v: unknown): v is string => typeof v === "string";
const nullableString = (v: unknown) => v === null || str(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const uuid = (v: unknown) => str(v) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const locale = (v: unknown) => v === "fr" || v === "en";
const oneOf = (v: unknown, options: readonly string[]) => str(v) && options.includes(v);
const instant = (v: unknown) => v === null || (str(v) && v.endsWith("Z") && Number.isFinite(Date.parse(v)));
const duration = (v: unknown) => v === null || (integer(v) && v >= 1 && v <= 1440);
const access = (v: unknown) => v === "FREE" || v === "PROTECTED";
const kinds = ["COURSE", "MODULE", "ACTIVITY", "GUIDE", "METHOD_TEMPLATE"];
const availability = (v: unknown) => oneOf(v, ["PUBLISHED", "MISSING_TRANSLATION", "STALE", "WITHDRAWN"]);
export const publicGoals = ["understand-brief", "define-scope", "prepare-prompt", "build-proposal", "check-output", "reuse-method"] as const;
const level = (v: unknown) => v === null || oneOf(v, ["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
export function safePublicLink(v: unknown): string | null {
  if (!str(v) || /[\s\\]/.test(v)) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try { const url = new URL(v); return url.protocol === "https:" && !url.username && !url.password ? v : null; } catch { return null; }
}
export function isPublicMetadata(v: unknown): v is PublicMetadata {
  return record(v) && keys(v, ["goalCodes", "level", "audience", "tools", "sources", "faq", "evaluationDescription"])
    && strings(v.goalCodes) && v.goalCodes.length <= 6 && new Set(v.goalCodes).size === v.goalCodes.length && v.goalCodes.every((x) => oneOf(x, publicGoals))
    && level(v.level) && strings(v.audience) && v.audience.length <= 10
    && Array.isArray(v.tools) && v.tools.length <= 10 && v.tools.every((x) => record(x) && keys(x, ["name", "url"]) && str(x.name) && (x.url === null || safePublicLink(x.url) !== null))
    && Array.isArray(v.sources) && v.sources.length <= 20 && v.sources.every((x) => record(x) && keys(x, ["label", "url"]) && str(x.label) && safePublicLink(x.url) !== null)
    && Array.isArray(v.faq) && v.faq.length <= 12 && v.faq.every((x) => record(x) && keys(x, ["question", "answer"]) && str(x.question) && str(x.answer))
    && nullableString(v.evaluationDescription);
}
export function isPublicDocument(v: unknown): v is PublicDocument {
  if (!record(v) || !keys(v, ["objective", "expectedResult", "prerequisites", "blocks", "estimatedMinutes", "quiz", "rubric", "access", "media", "relatedResourceIds", "exerciseInstructions", "methodDefinition", "quizPolicy", "projectPolicy"])) return false;
  return str(v.objective) && str(v.expectedResult) && strings(v.prerequisites) && duration(v.estimatedMinutes) && access(v.access) && nullableString(v.exerciseInstructions)
    && Array.isArray(v.relatedResourceIds) && v.relatedResourceIds.every(uuid)
    && (v.methodDefinition === undefined || v.methodDefinition === null || isMethodDefinition(v.methodDefinition))
    && (v.quizPolicy === undefined || v.quizPolicy === null || isQuizPolicy(v.quizPolicy))
    && (v.projectPolicy === undefined || v.projectPolicy === null || isProjectPolicy(v.projectPolicy))
    && Array.isArray(v.blocks) && v.blocks.length <= 60 && v.blocks.every((x) => record(x) && keys(x, ["type", "text", "url"])
      && oneOf(x.type, ["HEADING", "PARAGRAPH", "LIST", "CALLOUT", "CODE", "LINK"]) && str(x.text) && (x.url === null || safePublicLink(x.url) !== null))
    && Array.isArray(v.quiz) && v.quiz.length <= 20 && v.quiz.every((x) => record(x) && keys(x, ["key", "prompt", "options", "points"])
      && str(x.key) && str(x.prompt) && strings(x.options) && x.options.length >= 2 && x.options.length <= 8 && integer(x.points))
    && Array.isArray(v.rubric) && v.rubric.length <= 30 && v.rubric.every((x) => record(x) && keys(x, ["key", "label", "points", "blocking"]) && str(x.key) && str(x.label) && integer(x.points) && typeof x.blocking === "boolean")
    && Array.isArray(v.media) && v.media.length <= 20 && v.media.every((x) => record(x) && keys(x, ["assetId", "kind", "required", "label"]) && uuid(x.assetId) && oneOf(x.kind, ["IMAGE", "VIDEO", "FILE"]) && typeof x.required === "boolean" && str(x.label));
}
function card(v: unknown): boolean {
  return record(v) && keys(v, ["resourceId", "kind", "versionId", "versionNumber", "revisionId", "locale", "slug", "title", "summary", "objective", "expectedResult", "estimatedMinutes", "access", "goalCodes", "level", "reviewedAt"])
    && uuid(v.resourceId) && oneOf(v.kind, kinds.filter((x) => x !== "MODULE")) && uuid(v.versionId) && integer(v.versionNumber) && v.versionNumber >= 1 && uuid(v.revisionId)
    && locale(v.locale) && str(v.slug) && str(v.title) && str(v.summary) && str(v.objective) && str(v.expectedResult) && duration(v.estimatedMinutes) && access(v.access)
    && strings(v.goalCodes) && v.goalCodes.every((x) => oneOf(x, publicGoals)) && level(v.level) && instant(v.reviewedAt);
}
export function isCataloguePage(v: unknown): v is CataloguePage {
  return record(v) && keys(v, ["items", "page", "pageSize", "total"]) && Array.isArray(v.items) && v.items.length <= 100 && v.items.every(card)
    && integer(v.page) && integer(v.pageSize) && v.pageSize >= 1 && v.pageSize <= 100 && integer(v.total);
}
export function isCatalogueFacets(v: unknown): v is CatalogueFacets {
  if (!record(v) || !keys(v, ["types", "goals", "levels", "accesses", "locales"])) return false;
  return ["types", "goals", "levels", "accesses", "locales"].every((key) => Array.isArray(v[key]) && v[key].every((x: unknown) => record(x) && keys(x, ["code", "label", "count"]) && str(x.code) && str(x.label) && integer(x.count)));
}
export function isCurriculumNode(v: unknown, depth = 0): boolean {
  return depth <= 4 && record(v) && keys(v, ["resourceId", "kind", "versionId", "versionNumber", "locale", "slug", "availability", "revisionId", "title", "summary", "access", "estimatedMinutes", "children"])
    && uuid(v.resourceId) && oneOf(v.kind, kinds) && uuid(v.versionId) && integer(v.versionNumber) && locale(v.locale) && nullableString(v.slug) && availability(v.availability)
    && (v.revisionId === null || uuid(v.revisionId)) && nullableString(v.title) && nullableString(v.summary) && (v.access === null || access(v.access)) && duration(v.estimatedMinutes)
    && Array.isArray(v.children) && v.children.length <= 100 && v.children.every((x) => isCurriculumNode(x, depth + 1));
}
export function isResourceDetail(v: unknown): v is ResourceDetail {
  return record(v) && keys(v, ["resourceId", "kind", "versionId", "versionNumber", "locale", "slug", "availability", "revisionId", "title", "summary", "access", "document", "metadata", "reviewedAt", "languages", "curriculum", "related", "objective", "expectedResult", "prerequisites", "estimatedMinutes"])
    && uuid(v.resourceId) && oneOf(v.kind, kinds) && uuid(v.versionId) && integer(v.versionNumber) && locale(v.locale) && nullableString(v.slug) && availability(v.availability)
    && (v.revisionId === null || uuid(v.revisionId)) && nullableString(v.title) && nullableString(v.summary) && (v.access === null || access(v.access))
    && (v.document === null || (v.availability === "PUBLISHED" && v.access === "FREE" && isPublicDocument(v.document))) && isPublicMetadata(v.metadata) && instant(v.reviewedAt)
    && Array.isArray(v.languages) && v.languages.length <= 2 && v.languages.every((x) => record(x) && keys(x, ["locale", "status", "slug"]) && locale(x.locale) && availability(x.status) && nullableString(x.slug))
    && Array.isArray(v.curriculum) && v.curriculum.length <= 100 && v.curriculum.every((x) => isCurriculumNode(x)) && Array.isArray(v.related) && v.related.length <= 100 && v.related.every(card)
    && nullableString(v.objective) && nullableString(v.expectedResult) && strings(v.prerequisites) && duration(v.estimatedMinutes);
}
