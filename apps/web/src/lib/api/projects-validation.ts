import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { isResourceDetail } from "./public-validation";
import { isMemberResourceDetail } from "./member-content-validation";
import { isCompleteProjectPolicy } from "./project-policy-validation";
import { validMethodText } from "../methods/validation";
import { projectBlockingKeys, projectCategories, projectCriterionKeys, projectSections } from "../projects/schema";
import type { ProjectContext, ProjectFields, ProjectPage, ProjectPreset, ProjectRevisionPage, ProjectRevisionView, ProjectRubricDefinition, ProjectRubricSnapshot, ProjectStatus, ProjectTemplate, ProjectView, SelfAssessmentPage, SelfAssessmentView, SolutionRevealView } from "./generated/types.gen";

const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
const num = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const str = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || str(value);
const language = (value: unknown) => value === "fr" || value === "en";
const instant = (value: unknown): value is string => str(value) && value.endsWith("Z") && Number.isFinite(Date.parse(value));
const oneOf = (value: unknown, values: readonly string[]) => str(value) && values.includes(value);
const stage = (value: unknown) => oneOf(value, ["DRAFT", "READY_FOR_SELF_ASSESSMENT"]);
const state = (value: unknown) => oneOf(value, ["DRAFT", "READY_FOR_SELF_ASSESSMENT", "SELF_ASSESSED", "NEEDS_REVISION"]);
const availability = (value: unknown) => oneOf(value, ["PUBLISHED", "MISSING_TRANSLATION", "STALE", "WITHDRAWN"]);
const access = (value: unknown) => oneOf(value, ["ACTIVE", "PROTECTED", "UNAVAILABLE"]);
const nullableId = (value: unknown) => value === null || isUuid(value);
export function matchingProjectResponse<T>(guard: (value: unknown) => value is T, matches: (value: T) => boolean): (value: unknown) => value is T {
  return (value: unknown): value is T => guard(value) && matches(value);
}

export function isProjectFields(value: unknown): value is ProjectFields {
  return record(value) && keys(value, ["title", "locale", ...projectSections, "externalText"])
    && validMethodText(value.title, 240, 1) && language(value.locale) && projectSections.every((key) => validMethodText(value[key], 8000))
    && validMethodText(value.externalText, 32000) && new TextEncoder().encode(JSON.stringify(value)).length <= 48 * 1024;
}
function origin(value: unknown): boolean {
  if (!record(value) || !keys(value, ["activityId", "activityVersionId", "activityVersionNumber", "translationId", "revisionId", "locale", "title", "slug", "enrollmentId", "courseResourceId", "courseVersionId", "courseTitle"])) return false;
  return [value.activityId, value.activityVersionId, value.translationId, value.revisionId].every(isUuid) && language(value.locale)
    && num(value.activityVersionNumber) && value.activityVersionNumber >= 1 && validMethodText(value.title, 240, 1) && str(value.slug) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)
    && [value.enrollmentId, value.courseResourceId, value.courseVersionId].every(nullableId) && nullableText(value.courseTitle)
    && (value.enrollmentId === null ? value.courseResourceId === null && value.courseVersionId === null && value.courseTitle === null
      : isUuid(value.courseResourceId) && isUuid(value.courseVersionId) && str(value.courseTitle));
}
function rubric(value: Record<string, unknown>): boolean {
  const policy = { caseCode: value.caseCode, passPoints: value.passPoints, revealPolicy: value.revealPolicy, blockingIssues: value.blockingIssues };
  return isUuid(value.sourceRevisionId) && language(value.locale) && value.maxPoints === 20 && isCompleteProjectPolicy(policy)
    && Array.isArray(value.criteria) && value.criteria.length === 20 && value.criteria.every((criterion) => record(criterion)
      && keys(criterion, ["key", "category", "label", "points", "blocking"]) && str(criterion.key) && projectCriterionKeys.includes(criterion.key)
      && oneOf(criterion.category, projectCategories) && criterion.category === criterion.key.split("-", 1)[0]
      && validMethodText(criterion.label, 2000, 1) && criterion.points === 1 && typeof criterion.blocking === "boolean")
    && new Set(value.criteria.map((criterion: { key: string }) => criterion.key)).size === 20;
}
export function isProjectRubricDefinition(value: unknown): value is ProjectRubricDefinition {
  return record(value) && keys(value, ["sourceRevisionId", "locale", "caseCode", "passPoints", "maxPoints", "revealPolicy", "criteria", "blockingIssues"]) && rubric(value);
}
export function isProjectRubricSnapshot(value: unknown): value is ProjectRubricSnapshot {
  return record(value) && keys(value, ["id", "sourceRevisionId", "locale", "caseCode", "passPoints", "maxPoints", "revealPolicy", "criteria", "blockingIssues"]) && isUuid(value.id) && rubric(value);
}
export function isProjectView(value: unknown): value is ProjectView {
  return record(value) && keys(value, ["id", "revision", "currentRevisionId", "revisionNumber", "fields", "stage", "origin", "rubric", "createdAt", "updatedAt", "savedAt"])
    && isUuid(value.id) && num(value.revision) && isUuid(value.currentRevisionId) && num(value.revisionNumber) && value.revisionNumber >= 1
    && isProjectFields(value.fields) && stage(value.stage) && origin(value.origin) && isProjectRubricSnapshot(value.rubric)
    && record(value.origin) && value.rubric.sourceRevisionId === value.origin.revisionId && value.rubric.locale === value.origin.locale
    && instant(value.createdAt) && instant(value.updatedAt) && instant(value.savedAt) && Date.parse(value.updatedAt) >= Date.parse(value.createdAt) && Date.parse(value.savedAt) >= Date.parse(value.createdAt);
}
export const projectEtag = (value: Pick<ProjectView, "id" | "revision">) => `"project-${value.id}-r${value.revision}"`;
function summary(value: unknown): boolean {
  return record(value) && keys(value, ["id", "revision", "title", "locale", "state", "currentRevisionId", "activityId", "activityVersionId", "activityVersionNumber", "activityTitle", "courseTitle", "updatedAt", "savedAt"])
    && [value.id, value.currentRevisionId, value.activityId, value.activityVersionId].every(isUuid) && num(value.revision) && validMethodText(value.title, 240, 1)
    && language(value.locale) && state(value.state) && num(value.activityVersionNumber) && value.activityVersionNumber >= 1 && str(value.activityTitle) && nullableText(value.courseTitle) && instant(value.updatedAt) && instant(value.savedAt);
}
function page(value: unknown, item: (value: unknown) => boolean): boolean {
  return record(value) && keys(value, ["items", "page", "pageSize", "total"]) && Array.isArray(value.items) && value.items.length <= 100 && value.items.every(item)
    && num(value.page) && value.page <= 1_000_000 && num(value.pageSize) && value.pageSize >= 1 && value.pageSize <= 100 && num(value.total);
}
export function isProjectPage(value: unknown): value is ProjectPage { return page(value, summary); }
export function isProjectRevisionView(value: unknown): value is ProjectRevisionView {
  return record(value) && keys(value, ["id", "projectId", "revisionNumber", "fields", "stage", "createdAt", "authorId"])
    && [value.id, value.projectId, value.authorId].every(isUuid) && num(value.revisionNumber) && value.revisionNumber >= 1 && isProjectFields(value.fields) && stage(value.stage) && instant(value.createdAt);
}
function revisionSummary(value: unknown): boolean {
  return record(value) && keys(value, ["id", "projectId", "revisionNumber", "title", "locale", "stage", "createdAt", "authorId"])
    && [value.id, value.projectId, value.authorId].every(isUuid) && num(value.revisionNumber) && value.revisionNumber >= 1 && validMethodText(value.title, 240, 1) && language(value.locale) && stage(value.stage) && instant(value.createdAt);
}
export function isProjectRevisionPage(value: unknown): value is ProjectRevisionPage { return page(value, revisionSummary); }
export function isProjectContext(value: unknown): value is ProjectContext {
  return record(value) && keys(value, ["projectId", "activityId", "activityVersionId", "availability", "accessStatus", "sourceRevisionId", "currentPublishedRevisionId", "sourceChanged", "resource"])
    && [value.projectId, value.activityId, value.activityVersionId, value.sourceRevisionId].every(isUuid) && availability(value.availability) && access(value.accessStatus) && nullableId(value.currentPublishedRevisionId) && typeof value.sourceChanged === "boolean"
    && (value.resource === null || value.accessStatus === "ACTIVE" && value.availability === "PUBLISHED" && isMemberResourceDetail(value.resource) && value.resource.kind === "ACTIVITY" && value.resource.document !== null
      && value.resource.document.access === value.resource.access && value.resource.resourceId === value.activityId && value.resource.versionId === value.activityVersionId);
}
export function isProjectTemplate(value: unknown): value is ProjectTemplate {
  return projectTemplate(value, false);
}
export function isMemberProjectTemplate(value: unknown): value is ProjectTemplate {
  return projectTemplate(value, true);
}
function projectTemplate(value: unknown, member: boolean): value is ProjectTemplate {
  if (!record(value) || !keys(value, ["activityId", "activityVersionId", "revisionId", "locale", "title", "availability", "resource", "rubric"])) return false;
  const resource = member ? isMemberResourceDetail : isResourceDetail;
  return isUuid(value.activityId) && isUuid(value.activityVersionId) && nullableId(value.revisionId) && language(value.locale) && nullableText(value.title)
    && oneOf(value.availability, ["PUBLISHED", "NOT_CONFIGURED", "PROTECTED", "MISSING_TRANSLATION", "STALE", "WITHDRAWN"])
    && (value.availability === "PUBLISHED" ? isUuid(value.revisionId) && str(value.title) && resource(value.resource)
      && value.resource.kind === "ACTIVITY" && value.resource.document !== null && (member || value.resource.access === "FREE" && value.resource.document.access === "FREE") && value.resource.locale === value.locale && value.resource.resourceId === value.activityId && value.resource.versionId === value.activityVersionId && value.resource.revisionId === value.revisionId
      && isProjectRubricDefinition(value.rubric) && value.rubric.sourceRevisionId === value.revisionId && value.rubric.locale === value.locale : value.resource === null && value.rubric === null);
}
export function isProjectPreset(value: unknown): value is ProjectPreset {
  return record(value) && keys(value, ["caseCode", "locale", "policy", "rubric"]) && language(value.locale) && isCompleteProjectPolicy(value.policy)
    && value.caseCode === value.policy.caseCode && Array.isArray(value.rubric) && value.rubric.length === 20
    && value.rubric.every((criterion) => record(criterion) && keys(criterion, ["key", "label", "points", "blocking"])
      && str(criterion.key) && projectCriterionKeys.includes(criterion.key) && validMethodText(criterion.label, 2000, 1) && criterion.points === 1 && typeof criterion.blocking === "boolean")
    && new Set(value.rubric.map((criterion: { key: string }) => criterion.key)).size === 20;
}
function assessmentBase(value: Record<string, unknown>): boolean {
  return [value.id, value.projectId, value.projectRevisionId, value.rubricVersionId, value.authorId].every(isUuid) && value.method === "SELF_ASSESSMENT"
    && num(value.scorePoints) && value.scorePoints <= 20 && value.maxPoints === 20 && num(value.passPoints) && value.passPoints >= 1 && value.passPoints <= 20
    && typeof value.thresholdMet === "boolean" && value.thresholdMet === (value.scorePoints >= value.passPoints) && typeof value.needsRevision === "boolean" && instant(value.evaluatedAt);
}
export function isSelfAssessmentView(value: unknown): value is SelfAssessmentView {
  if (!(record(value) && keys(value, ["id", "submissionId", "projectId", "projectRevisionId", "rubricVersionId", "method", "scorePoints", "maxPoints", "passPoints", "thresholdMet", "needsRevision", "answers", "blockingDeclarations", "blockingIssues", "comment", "evaluatedAt", "authorId", "evaluatorId", "declaredByUser"])
    && assessmentBase(value) && isUuid(value.submissionId) && value.evaluatorId === null && value.declaredByUser === true && validMethodText(value.comment, 4000)
    && Array.isArray(value.answers) && value.answers.length === 20 && value.answers.every((answer) => record(answer) && keys(answer, ["key", "satisfied", "comment"])
      && str(answer.key) && projectCriterionKeys.includes(answer.key) && typeof answer.satisfied === "boolean" && validMethodText(answer.comment, 1000))
    && Array.isArray(value.blockingDeclarations) && value.blockingDeclarations.length === 4 && value.blockingDeclarations.every((declaration) => record(declaration)
      && keys(declaration, ["key", "present", "comment"]) && oneOf(declaration.key, projectBlockingKeys) && typeof declaration.present === "boolean" && validMethodText(declaration.comment, 1000))
    && Array.isArray(value.blockingIssues) && value.blockingIssues.length <= 24 && value.blockingIssues.every((issue) => record(issue) && keys(issue, ["key", "label", "comment"])
      && str(issue.key) && [...projectCriterionKeys, ...projectBlockingKeys].includes(issue.key) && validMethodText(issue.label, 2000, 1) && validMethodText(issue.comment, 1000)))) return false;
  const assessment = value as SelfAssessmentView;
  return new Set(assessment.answers.map((answer) => answer.key)).size === 20 && new Set(assessment.blockingDeclarations.map((issue) => issue.key)).size === 4
    && new Set(assessment.blockingIssues.map((issue) => issue.key)).size === assessment.blockingIssues.length
    && assessment.scorePoints === assessment.answers.filter((answer) => answer.satisfied).length
    && assessment.needsRevision === (!assessment.thresholdMet || assessment.blockingIssues.length > 0)
    && assessment.blockingDeclarations.every((declaration) => declaration.present === assessment.blockingIssues.some((issue) => issue.key === declaration.key));
}
function assessmentSummary(value: unknown): boolean {
  return record(value) && keys(value, ["id", "projectId", "projectRevisionId", "rubricVersionId", "method", "scorePoints", "maxPoints", "passPoints", "thresholdMet", "needsRevision", "blockingIssueCount", "evaluatedAt", "authorId"])
    && assessmentBase(value) && num(value.blockingIssueCount) && value.blockingIssueCount <= 24 && value.needsRevision === (!value.thresholdMet || value.blockingIssueCount > 0);
}
export function isSelfAssessmentPage(value: unknown): value is SelfAssessmentPage { return page(value, assessmentSummary); }
export function isProjectStatus(value: unknown): value is ProjectStatus {
  return record(value) && keys(value, ["projectId", "currentRevisionId", "stage", "state", "latestAssessment"])
    && isUuid(value.projectId) && isUuid(value.currentRevisionId) && stage(value.stage) && state(value.state)
    && (value.latestAssessment === null ? value.state === value.stage : isSelfAssessmentView(value.latestAssessment)
      && value.latestAssessment.projectId === value.projectId && value.latestAssessment.projectRevisionId === value.currentRevisionId
      && value.state === (value.latestAssessment.needsRevision ? "NEEDS_REVISION" : "SELF_ASSESSED"));
}
export function isSolutionRevealView(value: unknown): value is SolutionRevealView {
  return record(value) && keys(value, ["id", "projectId", "projectRevisionId", "activityId", "activityVersionId", "revisionId", "locale", "correction", "revealedAt"])
    && [value.id, value.projectId, value.projectRevisionId, value.activityId, value.activityVersionId, value.revisionId].every(isUuid)
    && language(value.locale) && validMethodText(value.correction, 8000, 1) && instant(value.revealedAt);
}
