import { clearCsrfToken, getCsrfToken, type AuthResult } from "./auth-client";
import { isUuid } from "./cms-validation";
import type { CreateActivityNote, EnrollCourse, QuizCheck, SetActivityProgress, SubmitQuiz, UpdateActivityNote, VisitActivity } from "./generated/types.gen";
import type { Locale } from "../i18n/locales";
import { decodeLearningResponse } from "./learning-response";
import { isActivityNoteLookup, isActivityNoteView, isActivityProgressView, isEnrollmentView, isLearningActivity, isLearningDashboard, isQuizAttemptPage, isQuizAttemptView, isQuizCheckResult, isVisitView } from "./learning-validation";

const id = (value: string) => { if (!isUuid(value)) throw new Error("Invalid learning identifier."); return value; };
const language = (locale: Locale) => { if (locale !== "fr" && locale !== "en") throw new Error("Invalid learning locale."); return locale; };
export const learningDashboardPath = (locale: Locale) => `/me/learning?locale=${language(locale)}`;
async function request<T>(path: string, decode: (value: unknown) => value is T, init: RequestInit = {}, statuses = [200]): Promise<AuthResult<T>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try {
    return await decodeLearningResponse(await fetch(`/api/v1${path}`, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Accept: "application/json, application/problem+json", ...init.headers } }), decode, statuses);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timer); }
}
async function mutate<T>(path: string, method: "POST" | "PUT" | "PATCH", body: unknown, decode: (value: unknown) => value is T,
  accountContext?: string, etag?: string, statuses = [200]): Promise<AuthResult<T>> {
  if (accountContext !== undefined && !isUuid(accountContext)) throw new Error("An expected account is required for a learning mutation.");
  const csrf = await getCsrfToken(); if (!csrf.ok) return csrf;
  const result = await request(path, decode, { method, body: JSON.stringify(body), headers: {
    "Content-Type": "application/json", [csrf.data.headerName]: csrf.data.token,
    ...(accountContext ? { "X-Account-Context": accountContext } : {}), ...(etag ? { "If-Match": etag } : {}),
  } }, statuses);
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) { clearCsrfToken(); await getCsrfToken(); }
  return result;
}

export const getLearningDashboard = (locale: Locale) => request(learningDashboardPath(locale), isLearningDashboard);
export const enrollCourse = (body: EnrollCourse, accountContext: string) => mutate("/me/enrollments", "POST", body, isEnrollmentView, accountContext, undefined, [200, 201]);
export const getEnrollment = (enrollmentId: string, locale: Locale) => request(`/me/enrollments/${id(enrollmentId)}?locale=${language(locale)}`, isEnrollmentView);
export const getLearningActivity = (enrollmentId: string, activityId: string, activityVersionId: string, locale: Locale) => request(`/me/enrollments/${id(enrollmentId)}/activities/${id(activityId)}?activityVersionId=${id(activityVersionId)}&locale=${language(locale)}`, isLearningActivity);
export const visitActivity = (enrollmentId: string, body: VisitActivity, accountContext: string) => mutate(`/me/enrollments/${id(enrollmentId)}/visits`, "POST", body, isVisitView, accountContext);
export const getActivityProgress = (activityId: string, enrollmentId: string, activityVersionId: string) => request(`/me/activity-progress/${id(activityId)}?enrollmentId=${id(enrollmentId)}&activityVersionId=${id(activityVersionId)}`, isActivityProgressView);
export const setActivityProgress = (activityId: string, etag: string, body: SetActivityProgress, accountContext: string) => mutate(`/me/activity-progress/${id(activityId)}`, "PUT", body, isActivityProgressView, accountContext, etag);
export const getActivityNoteForActivity = (activityId: string, activityVersionId: string) => request(`/me/activity-notes/by-activity/${id(activityId)}?activityVersionId=${id(activityVersionId)}`, isActivityNoteLookup);
export const createActivityNote = (body: CreateActivityNote, accountContext: string) => mutate("/me/activity-notes", "POST", body, isActivityNoteView, accountContext, undefined, [201]);
export const getActivityNote = (noteId: string) => request(`/me/activity-notes/${id(noteId)}`, isActivityNoteView);
export const updateActivityNote = (noteId: string, etag: string, body: UpdateActivityNote, accountContext: string) => mutate(`/me/activity-notes/${id(noteId)}`, "PATCH", body, isActivityNoteView, accountContext, etag);
export const submitQuiz = (activityId: string, body: SubmitQuiz, accountContext: string) => mutate(`/activities/${id(activityId)}/quiz-attempts`, "POST", body, isQuizAttemptView, accountContext, undefined, [201]);
export function listQuizAttempts(activityVersionId: string, page = 0, pageSize = 20) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 1_000_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid quiz pagination.");
  return request(`/me/quiz-attempts?activityVersionId=${id(activityVersionId)}&page=${page}&pageSize=${pageSize}`, isQuizAttemptPage);
}
export const getQuizAttempt = (attemptId: string) => request(`/me/quiz-attempts/${id(attemptId)}`, isQuizAttemptView);
export const checkQuiz = (activityId: string, activityVersionId: string, body: QuizCheck) => mutate(`/learning/activities/${id(activityId)}/versions/${id(activityVersionId)}/quiz-checks`, "POST", body, isQuizCheckResult);
