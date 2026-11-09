import type { AttestationDocument, AttestationEligibility, AttestationEnrollment, AttestationEnrollmentPage, AttestationPage, AttestationSummary, AttestationView, ParticipationActivity, ParticipationAssessment, ParticipationEvidence, ParticipationQuiz } from "./generated/types.gen";
import { accountPage, exact, hash, instant, integer, isUuid, locale, nullableInstant, record } from "./account-validation-common";
import { validMethodText } from "../methods/validation";

export function isAttestationEnrollment(value: unknown): value is AttestationEnrollment {
  return record(value) && exact(value, ["enrollmentId", "courseResourceId", "courseVersionId", "courseVersionNumber", "courseTitle", "enrolledLocale", "createdAt"]) && [value.enrollmentId, value.courseResourceId, value.courseVersionId].every(isUuid) && integer(value.courseVersionNumber, 1) && validMethodText(value.courseTitle, 240, 1) && locale(value.enrolledLocale) && instant(value.createdAt);
}
export const isAttestationEnrollmentPage = (value: unknown): value is AttestationEnrollmentPage => accountPage(value, isAttestationEnrollment, item => item.enrollmentId);
export function isParticipationActivity(value: unknown): value is ParticipationActivity {
  return record(value) && exact(value, ["activityId", "activityVersionId", "position", "title", "readAt", "declaredCompletedAt"]) && isUuid(value.activityId) && isUuid(value.activityVersionId) && integer(value.position, 1) && validMethodText(value.title, 240, 1) && nullableInstant(value.readAt) && nullableInstant(value.declaredCompletedAt);
}
export function isParticipationQuiz(value: unknown): value is ParticipationQuiz {
  return record(value) && exact(value, ["attemptId", "activityId", "activityVersionId", "sourceRevisionId", "locale", "attemptNumber", "scorePoints", "maxPoints", "passed", "passPercent", "submittedAt"]) && [value.attemptId, value.activityId, value.activityVersionId, value.sourceRevisionId].every(isUuid) && locale(value.locale) && integer(value.attemptNumber, 1) && integer(value.maxPoints, 1) && integer(value.scorePoints, 0, value.maxPoints) && integer(value.passPercent, 1, 100) && typeof value.passed === "boolean" && value.passed === (BigInt(value.scorePoints) * 100n >= BigInt(value.maxPoints) * BigInt(value.passPercent)) && instant(value.submittedAt);
}
export function isParticipationAssessment(value: unknown): value is ParticipationAssessment {
  return record(value) && exact(value, ["assessmentId", "projectId", "projectRevisionId", "rubricVersionId", "activityId", "activityVersionId", "locale", "scorePoints", "maxPoints", "passPoints", "thresholdMet", "needsRevision", "evaluatedAt", "declaredByUser"]) && [value.assessmentId, value.projectId, value.projectRevisionId, value.rubricVersionId, value.activityId, value.activityVersionId].every(isUuid) && locale(value.locale) && value.maxPoints === 20 && integer(value.scorePoints, 0, 20) && integer(value.passPoints, 1, 20) && value.thresholdMet === (value.scorePoints >= value.passPoints) && typeof value.needsRevision === "boolean" && (value.thresholdMet || value.needsRevision) && instant(value.evaluatedAt) && value.declaredByUser === true;
}
function list<T>(value: unknown, guard: (item: unknown) => item is T, key: (item: T) => string): value is T[] { return Array.isArray(value) && value.length <= 10000 && value.every(guard) && new Set(value.map(key)).size === value.length; }
export function isParticipationEvidence(value: unknown): value is ParticipationEvidence {
  return record(value) && exact(value, ["enrollmentId", "courseResourceId", "courseVersionId", "courseVersionNumber", "courseTitle", "enrolledLocale", "profileRevision", "participantName", "identityVerified", "humanReview", "activities", "quizzes", "selfAssessments"]) && [value.enrollmentId, value.courseResourceId, value.courseVersionId].every(isUuid) && integer(value.courseVersionNumber, 1) && validMethodText(value.courseTitle, 240, 1) && locale(value.enrolledLocale) && integer(value.profileRevision) && (value.participantName === null || validMethodText(value.participantName, 120, 1)) && value.identityVerified === false && value.humanReview === false
    && list(value.activities, isParticipationActivity, item => item.activityVersionId) && list(value.quizzes, isParticipationQuiz, item => item.attemptId) && list(value.selfAssessments, isParticipationAssessment, item => item.assessmentId)
    && [...value.quizzes, ...value.selfAssessments].every(item => (value.activities as ParticipationActivity[]).some(activity => activity.activityId === item.activityId && activity.activityVersionId === item.activityVersionId));
}
export function isAttestationEligibility(value: unknown): value is AttestationEligibility {
  if (!record(value) || !exact(value, ["enrollmentId", "type", "locale", "eligible", "blockingCodes", "criteria", "evidenceFingerprint", "evidence"]) || !isUuid(value.enrollmentId) || value.type !== "PARTICIPATION" || !locale(value.locale) || typeof value.eligible !== "boolean" || !hash(value.evidenceFingerprint) || !isParticipationEvidence(value.evidence) || value.evidence.enrollmentId !== value.enrollmentId) return false;
  const codes = ["PROFILE_NAME_PRESENT", "PERSISTED_PARTICIPATION_PRESENT"];
  if (!Array.isArray(value.criteria) || value.criteria.length !== 2 || !value.criteria.every(item => record(item) && exact(item, ["code", "met"]) && typeof item.code === "string" && codes.includes(item.code) && typeof item.met === "boolean") || new Set(value.criteria.map(item => item.code)).size !== 2 || !Array.isArray(value.blockingCodes) || !value.blockingCodes.every(item => typeof item === "string" && codes.includes(item)) || new Set(value.blockingCodes).size !== value.blockingCodes.length) return false;
  const blockingCodes = value.blockingCodes;
  return value.eligible === value.criteria.every(item => item.met) && value.criteria.filter(item => !item.met).length === value.blockingCodes.length && value.criteria.filter(item => !item.met).every(item => blockingCodes.includes(item.code));
}
export function isAttestationDocument(value: unknown): value is AttestationDocument {
  return record(value) && exact(value, ["format", "contentType", "filename", "sizeBytes", "sha256"]) && value.format === "HTML" && typeof value.contentType === "string" && value.contentType.toLowerCase() === "text/html; charset=utf-8" && typeof value.filename === "string" && /^attestation-[0-9a-f-]{36}\.html$/i.test(value.filename) && integer(value.sizeBytes, 1, 262144) && hash(value.sha256);
}
export function isAttestationContentType(value: string | null): boolean {
  if (value === null) return false;
  const parts = value.toLowerCase().split(";").map(part => part.trim());
  return parts.length === 2 && parts[0] === "text/html" && /^charset\s*=\s*(?:utf-8|"utf-8")$/.test(parts[1]);
}
export function isAttestationSummary(value: unknown): value is AttestationSummary {
  return record(value) && exact(value, ["id", "enrollmentId", "type", "locale", "courseResourceId", "courseVersionId", "courseVersionNumber", "courseTitle", "participantName", "issuedAt", "document"]) && [value.id, value.enrollmentId, value.courseResourceId, value.courseVersionId].every(isUuid) && value.type === "PARTICIPATION" && locale(value.locale) && integer(value.courseVersionNumber, 1) && validMethodText(value.courseTitle, 240, 1) && validMethodText(value.participantName, 120, 1) && instant(value.issuedAt) && isAttestationDocument(value.document) && value.document.filename === `attestation-${value.id}.html`;
}
export const isAttestationPage = (value: unknown): value is AttestationPage => accountPage(value, isAttestationSummary, item => item.id);
export function isAttestationView(value: unknown): value is AttestationView {
  return record(value) && exact(value, ["summary", "evidenceFingerprint", "evidence"]) && isAttestationSummary(value.summary) && hash(value.evidenceFingerprint) && isParticipationEvidence(value.evidence) && value.evidence.enrollmentId === value.summary.enrollmentId && value.evidence.courseResourceId === value.summary.courseResourceId && value.evidence.courseVersionId === value.summary.courseVersionId && value.evidence.courseVersionNumber === value.summary.courseVersionNumber && value.evidence.courseTitle === value.summary.courseTitle && value.evidence.participantName === value.summary.participantName;
}
