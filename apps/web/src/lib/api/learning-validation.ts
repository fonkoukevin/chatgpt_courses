import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { isMethodSummary } from "./methods-validation";
import { isCurriculumNode } from "./public-validation";
import { isMemberResourceDetail } from "./member-content-validation";
import { isQuizPolicy } from "./quiz-policy-validation";
import { validMethodText } from "../methods/validation";
import type { ActivityNoteLookup, ActivityNoteView, ActivityProgressView, EnrollmentView, LearningActivity, LearningDashboard, QuizAttemptPage, QuizAttemptView, QuizCheckResult, QuizQuestionResult, VisitView } from "./generated/types.gen";

const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
const num = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const locale = (value: unknown) => value === "fr" || value === "en";
const instant = (value: unknown): value is string => text(value) && value.endsWith("Z") && Number.isFinite(Date.parse(value));
const nullableInstant = (value: unknown) => value === null || instant(value);
const oneOf = (value: unknown, allowed: string[]) => text(value) && allowed.includes(value);
const available = (value: unknown) => oneOf(value, ["PUBLISHED", "MISSING_TRANSLATION", "STALE", "WITHDRAWN"]);
const access = (value: unknown) => oneOf(value, ["ACTIVE", "PROTECTED", "UNAVAILABLE"]);

export function isActivityProgressView(value: unknown): value is ActivityProgressView {
  return record(value) && keys(value, ["id", "enrollmentId", "activityId", "activityVersionId", "revision", "readAt", "completedAt"])
    && [value.id, value.enrollmentId, value.activityId, value.activityVersionId].every(isUuid) && num(value.revision) && nullableInstant(value.readAt) && nullableInstant(value.completedAt);
}
export const activityProgressEtag = (value: Pick<ActivityProgressView, "id" | "revision">) => `"activity-progress-${value.id}-r${value.revision}"`;
export function isActivityNoteView(value: unknown): value is ActivityNoteView {
  return record(value) && keys(value, ["id", "activityId", "activityVersionId", "locale", "text", "revision", "createdAt", "updatedAt"])
    && [value.id, value.activityId, value.activityVersionId].every(isUuid) && locale(value.locale) && validMethodText(value.text, 16000)
    && num(value.revision) && instant(value.createdAt) && instant(value.updatedAt) && Date.parse(value.updatedAt) >= Date.parse(value.createdAt);
}
export const activityNoteEtag = (value: Pick<ActivityNoteView, "id" | "revision">) => `"activity-note-${value.id}-r${value.revision}"`;
export function isActivityNoteLookup(value: unknown): value is ActivityNoteLookup {
  return record(value) && keys(value, ["note"]) && (value.note === null || isActivityNoteView(value.note));
}
function totals(value: unknown): boolean {
  return record(value) && keys(value, ["totalActivities", "readActivities", "completedActivities", "quizPassedActivities", "projectAvailability"])
    && num(value.totalActivities) && [value.readActivities, value.completedActivities, value.quizPassedActivities].every((count) => num(count) && count <= (value.totalActivities as number))
    && value.projectAvailability === "NOT_AVAILABLE";
}
function summary(value: unknown): boolean {
  return record(value) && keys(value, ["id", "courseResourceId", "courseVersionId", "courseVersionNumber", "title", "enrolledLocale", "courseSlug", "accessStatus", "availability", "progress", "createdAt", "lastVisitedAt"])
    && [value.id, value.courseResourceId, value.courseVersionId].every(isUuid) && num(value.courseVersionNumber) && value.courseVersionNumber >= 1
    && text(value.title) && locale(value.enrolledLocale) && nullableText(value.courseSlug) && access(value.accessStatus) && available(value.availability)
    && totals(value.progress) && instant(value.createdAt) && nullableInstant(value.lastVisitedAt);
}
function resume(value: unknown): boolean {
  return record(value) && keys(value, ["enrollmentId", "courseResourceId", "courseVersionId", "courseSlug", "activityId", "activityVersionId", "activitySlug", "locale", "title"])
    && [value.enrollmentId, value.courseResourceId, value.courseVersionId, value.activityId, value.activityVersionId].every(isUuid)
    && text(value.courseSlug) && text(value.activitySlug) && text(value.title) && locale(value.locale);
}
export function isLearningDashboard(value: unknown): value is LearningDashboard {
  return record(value) && keys(value, ["resume", "enrollments", "recentMethods", "recentMethodsAvailability"])
    && (value.resume === null || resume(value.resume)) && Array.isArray(value.enrollments) && value.enrollments.length <= 100 && value.enrollments.every(summary)
    && Array.isArray(value.recentMethods) && value.recentMethods.length <= 5 && value.recentMethods.every(isMethodSummary)
    && oneOf(value.recentMethodsAvailability, ["AVAILABLE", "FORBIDDEN"]);
}
function enrolled(value: unknown): boolean {
  return record(value) && keys(value, ["activityId", "activityVersionId", "moduleId", "moduleVersionId", "position", "title", "accessStatus", "availability", "progress"])
    && [value.activityId, value.activityVersionId, value.moduleId, value.moduleVersionId].every(isUuid) && num(value.position) && text(value.title)
    && access(value.accessStatus) && available(value.availability) && isActivityProgressView(value.progress)
    && value.progress.activityId === value.activityId && value.progress.activityVersionId === value.activityVersionId;
}
export function isEnrollmentView(value: unknown): value is EnrollmentView {
  if (!(record(value) && keys(value, ["summary", "curriculum", "activities"]) && summary(value.summary)
    && Array.isArray(value.curriculum) && value.curriculum.length <= 100 && value.curriculum.every((node) => isCurriculumNode(node))
    && Array.isArray(value.activities) && value.activities.every(enrolled))) return false;
  const enrollment = value as EnrollmentView;
  return enrollment.activities.length === enrollment.summary.progress.totalActivities
    && new Set(enrollment.activities.map((activity) => activity.activityVersionId)).size === enrollment.activities.length
    && enrollment.activities.every((activity, index) => activity.position === index + 1 && activity.progress.enrollmentId === enrollment.summary.id);
}
function activityLink(value: unknown): boolean {
  return record(value) && keys(value, ["activityId", "activityVersionId", "slug", "title", "availability", "accessStatus"])
    && isUuid(value.activityId) && isUuid(value.activityVersionId) && nullableText(value.slug) && nullableText(value.title) && available(value.availability) && access(value.accessStatus);
}
function overview(value: unknown): boolean {
  return record(value) && keys(value, ["policy", "attemptsUsed", "attemptsRemaining", "latestAttemptId", "passed"])
    && isQuizPolicy(value.policy) && num(value.attemptsUsed) && (value.attemptsRemaining === null || num(value.attemptsRemaining))
    && (value.latestAttemptId === null || isUuid(value.latestAttemptId)) && typeof value.passed === "boolean";
}
export function isLearningActivity(value: unknown): value is LearningActivity {
  return record(value) && keys(value, ["enrollmentId", "activityId", "activityVersionId", "moduleId", "moduleVersionId", "position", "totalActivities", "resource", "progress", "previous", "next", "quiz", "accessStatus", "availability"])
    && [value.enrollmentId, value.activityId, value.activityVersionId, value.moduleId, value.moduleVersionId].every(isUuid) && num(value.position) && num(value.totalActivities)
    && isMemberResourceDetail(value.resource) && isActivityProgressView(value.progress) && (value.previous === null || activityLink(value.previous))
    && (value.next === null || activityLink(value.next)) && (value.quiz === null || overview(value.quiz)) && access(value.accessStatus) && available(value.availability)
    && value.progress.enrollmentId === value.enrollmentId && value.progress.activityId === value.activityId && value.progress.activityVersionId === value.activityVersionId
    && value.resource.resourceId === value.activityId && value.resource.versionId === value.activityVersionId && value.resource.kind === "ACTIVITY"
    && value.resource.availability === value.availability
    && (value.accessStatus === "ACTIVE" && value.availability === "PUBLISHED" || value.resource.document === null);
}
export function isVisitView(value: unknown): value is VisitView {
  return record(value) && keys(value, ["enrollmentId", "activityId", "activityVersionId", "visitedAt"])
    && [value.enrollmentId, value.activityId, value.activityVersionId].every(isUuid) && instant(value.visitedAt);
}
function questionResult(value: unknown): value is QuizQuestionResult {
  return record(value) && keys(value, ["key", "prompt", "options", "selectedOption", "correctOption", "correct", "explanation", "points", "awardedPoints"])
    && text(value.key) && text(value.prompt) && Array.isArray(value.options) && value.options.length >= 2 && value.options.length <= 8 && value.options.every(text)
    && num(value.selectedOption) && value.selectedOption < value.options.length && num(value.correctOption) && value.correctOption < value.options.length
    && typeof value.correct === "boolean" && text(value.explanation) && num(value.points) && value.points >= 1 && value.points <= 1000
    && num(value.awardedPoints) && value.correct === (value.selectedOption === value.correctOption) && value.awardedPoints === (value.correct ? value.points : 0);
}
function quizResult(value: Record<string, unknown>): boolean {
  if (!([value.activityId, value.activityVersionId, value.revisionId].every(isUuid) && locale(value.locale)
    && num(value.scorePoints) && num(value.maxPoints) && value.maxPoints > 0 && value.scorePoints <= value.maxPoints
    && typeof value.passed === "boolean" && isQuizPolicy(value.policy) && Array.isArray(value.results) && value.results.length >= 1 && value.results.length <= 20 && value.results.every(questionResult))) return false;
  const results = value.results as QuizQuestionResult[], policy = value.policy as { passPercent: number };
  return new Set(results.map((result) => result.key)).size === results.length
    && value.scorePoints === results.reduce((sum, result) => sum + result.awardedPoints, 0)
    && value.maxPoints === results.reduce((sum, result) => sum + result.points, 0)
    && value.passed === ((value.scorePoints as number) * 100 >= (value.maxPoints as number) * policy.passPercent);
}
export function isQuizCheckResult(value: unknown): value is QuizCheckResult {
  return record(value) && keys(value, ["activityId", "activityVersionId", "revisionId", "locale", "scorePoints", "maxPoints", "passed", "policy", "results"]) && quizResult(value);
}
export function isQuizAttemptView(value: unknown): value is QuizAttemptView {
  return record(value) && keys(value, ["id", "submissionId", "enrollmentId", "activityId", "activityVersionId", "revisionId", "locale", "attemptNumber", "scorePoints", "maxPoints", "passed", "policy", "submittedAt", "results"])
    && quizResult(value) && [value.id, value.submissionId, value.enrollmentId].every(isUuid) && num(value.attemptNumber) && value.attemptNumber >= 1 && instant(value.submittedAt);
}
export function isQuizAttemptPage(value: unknown): value is QuizAttemptPage {
  return record(value) && keys(value, ["items", "page", "pageSize", "total"]) && Array.isArray(value.items) && value.items.length <= 100 && value.items.every(isQuizAttemptView)
    && num(value.page) && value.page <= 1_000_000 && num(value.pageSize) && value.pageSize >= 1 && value.pageSize <= 100 && num(value.total);
}
