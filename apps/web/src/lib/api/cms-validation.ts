import { record } from "./auth-validation";
import { isPublicMetadata } from "./public-validation";
import { isMethodDefinition } from "../methods/validation";
import { isQuizPolicy } from "./quiz-policy-validation";
import { isProjectPolicy } from "./project-policy-validation";
import type { ContentDocument, ContentPage, ContentSummary, ContentView, Dependencies, Readiness, RevisionPage, RevisionView } from "./generated/types.gen";

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nullableUuid = (value: unknown) => value === null || isUuid(value);
const string = (value: unknown): value is string => typeof value === "string";
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(string);
const uuids = (value: unknown) => Array.isArray(value) && value.every(isUuid);
const instant = (value: unknown) => string(value) && value.endsWith("Z") && Number.isFinite(Date.parse(value));
const nullableInstant = (value: unknown) => value === null || instant(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
const oneOf = (value: unknown, allowed: string[]) => string(value) && allowed.includes(value);
const kind = (value: unknown) => oneOf(value, ["COURSE", "MODULE", "ACTIVITY", "GUIDE", "METHOD_TEMPLATE"]);
const state = (value: unknown) => oneOf(value, ["DRAFT", "TO_REVIEW", "READY", "PUBLISHED", "STALE", "ARCHIVED"]);
const locale = (value: unknown) => value === "fr" || value === "en";

export function safeContentLink(value: unknown): string | null {
  if (!string(value) || /[\s\\]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? value : null; } catch { return null; }
}

export function isContentDocument(value: unknown): value is ContentDocument {
  if (!record(value) || !keys(value, ["objective", "expectedResult", "prerequisites", "blocks", "estimatedMinutes", "exercise", "quiz", "rubric", "access", "media", "relatedResourceIds", "methodDefinition", "quizPolicy", "projectPolicy"])) return false;
  return string(value.objective) && string(value.expectedResult) && strings(value.prerequisites) && value.prerequisites.length <= 20
    && (value.estimatedMinutes === null || (integer(value.estimatedMinutes) && value.estimatedMinutes >= 1 && value.estimatedMinutes <= 1440))
    && oneOf(value.access, ["FREE", "PROTECTED"]) && uuids(value.relatedResourceIds)
    && (value.methodDefinition === undefined || value.methodDefinition === null || isMethodDefinition(value.methodDefinition))
    && (value.quizPolicy === undefined || value.quizPolicy === null || isQuizPolicy(value.quizPolicy))
    && (value.projectPolicy === undefined || value.projectPolicy === null || isProjectPolicy(value.projectPolicy))
    && Array.isArray(value.blocks) && value.blocks.length <= 60 && value.blocks.every((block) => record(block) && keys(block, ["type", "text", "url"])
      && oneOf(block.type, ["HEADING", "PARAGRAPH", "LIST", "CALLOUT", "CODE", "LINK"]) && string(block.text)
      && (block.url === null || safeContentLink(block.url) !== null))
    && (value.exercise === null || (record(value.exercise) && keys(value.exercise, ["instructions", "correction", "solutionAssetIds"]) && string(value.exercise.instructions) && string(value.exercise.correction)
      && (value.exercise.solutionAssetIds === undefined || uuids(value.exercise.solutionAssetIds) && value.exercise.solutionAssetIds.length <= 10 && new Set(value.exercise.solutionAssetIds).size === value.exercise.solutionAssetIds.length)))
    && Array.isArray(value.quiz) && value.quiz.length <= 20 && value.quiz.every((question) => record(question) && keys(question, ["key", "prompt", "options", "correctOption", "explanation", "points"])
      && string(question.key) && string(question.prompt) && strings(question.options) && question.options.length >= 2 && question.options.length <= 8
      && integer(question.correctOption) && question.correctOption < question.options.length && string(question.explanation) && integer(question.points))
    && Array.isArray(value.rubric) && value.rubric.length <= 30 && value.rubric.every((criterion) => record(criterion) && keys(criterion, ["key", "label", "points", "blocking"])
      && string(criterion.key) && string(criterion.label) && integer(criterion.points) && typeof criterion.blocking === "boolean")
    && Array.isArray(value.media) && value.media.length <= 20 && value.media.every((media) => record(media) && keys(media, ["assetId", "kind", "required", "label"])
      && isUuid(media.assetId) && oneOf(media.kind, ["IMAGE", "VIDEO", "FILE"]) && typeof media.required === "boolean" && string(media.label));
}

function commonContent(value: Record<string, unknown>): boolean {
  return isUuid(value.id) && isUuid(value.resourceId) && kind(value.kind) && isUuid(value.versionId) && integer(value.versionNumber)
    && locale(value.locale) && string(value.slug) && state(value.state) && integer(value.revision) && string(value.title) && string(value.summary)
    && nullableInstant(value.verifiedAt) && instant(value.updatedAt);
}
export function isContentSummary(value: unknown): value is ContentSummary {
  return record(value) && keys(value, ["id", "resourceId", "kind", "versionId", "versionNumber", "locale", "slug", "state", "revision", "title", "summary", "verifiedAt", "updatedAt", "needsUpdate"])
    && commonContent(value) && typeof value.needsUpdate === "boolean";
}
export function isContentView(value: unknown): value is ContentView {
  return record(value) && keys(value, ["id", "resourceId", "kind", "versionId", "versionNumber", "locale", "slug", "state", "revision", "currentRevisionId", "publishedRevisionId", "title", "summary", "objectives", "evaluationDefinition", "document", "childVersionIds", "sourceTranslationId", "sourceRevisionId", "reviewedSourceRevisionId", "verifiedAt", "updatedAt", "frozenAt", "translations", "legacyBody", "metadata"])
    && commonContent(value) && isUuid(value.currentRevisionId) && nullableUuid(value.publishedRevisionId)
    && string(value.objectives) && string(value.evaluationDefinition) && (value.document === null || isContentDocument(value.document))
    && uuids(value.childVersionIds) && nullableUuid(value.sourceTranslationId) && nullableUuid(value.sourceRevisionId) && nullableUuid(value.reviewedSourceRevisionId)
    && isPublicMetadata(value.metadata) && (value.legacyBody === null || string(value.legacyBody)) && nullableInstant(value.frozenAt) && Array.isArray(value.translations) && value.translations.every((translation) => record(translation)
      && keys(translation, ["id", "locale", "state", "sourceRevisionId", "reviewedSourceRevisionId"]) && isUuid(translation.id) && locale(translation.locale) && state(translation.state)
      && nullableUuid(translation.sourceRevisionId) && nullableUuid(translation.reviewedSourceRevisionId));
}
function isRevision(value: unknown): value is RevisionView {
  return record(value) && keys(value, ["id", "revisionNumber", "title", "summary", "document", "authorId", "createdAt", "reason", "replacesRevisionId", "legacyBody", "metadata"])
    && isUuid(value.id) && integer(value.revisionNumber) && string(value.title) && string(value.summary) && (value.document === null || isContentDocument(value.document))
    && isPublicMetadata(value.metadata) && nullableUuid(value.authorId) && instant(value.createdAt) && string(value.reason) && nullableUuid(value.replacesRevisionId) && (value.legacyBody === null || string(value.legacyBody));
}
function page(value: unknown, item: (value: unknown) => boolean): boolean {
  return record(value) && keys(value, ["items", "page", "size", "total"]) && Array.isArray(value.items) && value.items.length <= 100 && value.items.every(item)
    && integer(value.page) && integer(value.size) && value.size >= 1 && value.size <= 100 && integer(value.total);
}
export function isContentPage(value: unknown): value is ContentPage { return page(value, isContentSummary); }
export function isRevisionPage(value: unknown): value is RevisionPage { return page(value, isRevision); }
export function isReadiness(value: unknown): value is Readiness {
  const issues = (items: unknown) => Array.isArray(items) && items.every((item) => record(item) && keys(item, ["code", "field", "resourceId", "action"])
    && string(item.code) && string(item.field) && nullableUuid(item.resourceId) && string(item.action));
  return record(value) && keys(value, ["ready", "blockingIssues", "warnings", "checkedRevision"]) && typeof value.ready === "boolean" && isUuid(value.checkedRevision)
    && issues(value.blockingIssues) && issues(value.warnings);
}
export function isDependencies(value: unknown): value is Dependencies {
  return record(value) && keys(value, ["items", "canArchive", "consequences"]) && typeof value.canArchive === "boolean" && strings(value.consequences)
    && Array.isArray(value.items) && value.items.every((item) => record(item) && keys(item, ["resourceId", "versionId", "kind", "title", "relation"])
      && isUuid(item.resourceId) && isUuid(item.versionId) && kind(item.kind) && string(item.title) && oneOf(item.relation, ["COMPOSITION", "REFERENCE", "TRANSLATION"]));
}
