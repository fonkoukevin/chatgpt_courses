import { clearCsrfToken, getCsrfToken, type AuthResult } from "./auth-client";
import { isUuid } from "./cms-validation";
import type { CreateProject, RevealSolution, SaveProject, SubmitSelfAssessment } from "./generated/types.gen";
import type { Locale } from "../i18n/locales";
import { decodeProjectsResponse } from "./projects-response";
import { matchingProjectResponse as matching } from "./projects-validation";
import { isMemberProjectTemplate } from "./projects-validation";
import { isProjectContext, isProjectPage, isProjectPreset, isProjectRevisionPage, isProjectRevisionView, isProjectStatus, isProjectTemplate, isProjectView, isSelfAssessmentPage, isSelfAssessmentView, isSolutionRevealView } from "./projects-validation";

export type ProjectQuery = { q?: string; state?: "DRAFT" | "READY_FOR_SELF_ASSESSMENT" | "SELF_ASSESSED" | "NEEDS_REVISION"; activityId?: string; activityVersionId?: string; page?: number; pageSize?: number };
const id = (value: string) => { if (!isUuid(value)) throw new Error("Invalid project identifier."); return value; };
const language = (value: Locale) => { if (value !== "fr" && value !== "en") throw new Error("Invalid project locale."); return value; };
export function projectPath(projectId: string, suffix: "" | "/context" | "/status" | "/revisions" | "/self-assessments" = "") { return `/me/projects/${id(projectId)}${suffix}`; }
export function projectQueryString(query: ProjectQuery = {}) {
  const params = new URLSearchParams();
  for (const key of ["q", "state", "activityId", "activityVersionId", "page", "pageSize"] as const) if (query[key] !== undefined && query[key] !== "") params.set(key, String(query[key]));
  return params.toString();
}
export function projectTemplatePath(activityId: string, activityVersionId: string, locale: Locale) { return `/project-templates/${id(activityId)}/versions/${id(activityVersionId)}?locale=${language(locale)}`; }
function pagination(page: number, pageSize: number) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 1_000_000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Invalid project pagination.");
  return `page=${page}&pageSize=${pageSize}`;
}
async function request<T>(path: string, decode: (value: unknown) => value is T, init: RequestInit = {}, statuses = [200], personal = true): Promise<AuthResult<T>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try {
    return await decodeProjectsResponse(await fetch(`/api/v1${path}`, { ...init, credentials: personal ? "same-origin" : "omit", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { Accept: "application/json, application/problem+json", ...init.headers } }), decode, statuses);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
  finally { clearTimeout(timer); }
}
async function mutate<T>(path: string, method: "POST" | "PATCH", body: unknown, accountContext: string, decode: (value: unknown) => value is T, etag?: string, statuses = [200]): Promise<AuthResult<T>> {
  if (!isUuid(accountContext)) throw new Error("An expected account is required for a project mutation.");
  const token = await getCsrfToken(); if (!token.ok) return token;
  const result = await request(path, decode, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json", [token.data.headerName]: token.data.token,
    "X-Account-Context": accountContext, ...(etag ? { "If-Match": etag } : {}) } }, statuses);
  if (!result.ok && [401, 403].includes(result.error.status ?? 0)) { clearCsrfToken(); await getCsrfToken(); }
  return result;
}
export const listProjects = (query: ProjectQuery = {}) => request(`/me/projects?${projectQueryString(query)}`, isProjectPage);
export const getProject = (projectId: string) => request(projectPath(projectId), matching(isProjectView, (value) => value.id === projectId));
export const createProject = (body: CreateProject, accountContext: string) => mutate("/me/projects", "POST", body, accountContext, isProjectView, undefined, [200, 201]);
export const updateProject = (projectId: string, etag: string, body: SaveProject, accountContext: string) => mutate(projectPath(projectId), "PATCH", body, accountContext, matching(isProjectView, (value) => value.id === projectId), etag);
export const getProjectContext = (projectId: string, locale: Locale) => request(`${projectPath(projectId, "/context")}?locale=${language(locale)}`, matching(isProjectContext, (value) => value.projectId === projectId && (!value.resource || value.resource.locale === locale)));
export const getProjectStatus = (projectId: string) => request(projectPath(projectId, "/status"), matching(isProjectStatus, (value) => value.projectId === projectId));
export const listProjectRevisions = (projectId: string, page = 0, pageSize = 10) => request(`${projectPath(projectId, "/revisions")}?${pagination(page, pageSize)}`, matching(isProjectRevisionPage, (value) => value.page === page && value.pageSize === pageSize && value.items.every((item) => item.projectId === projectId)));
export const getProjectRevision = (projectId: string, revisionId: string) => request(`${projectPath(projectId, "/revisions")}/${id(revisionId)}`, matching(isProjectRevisionView, (value) => value.projectId === projectId && value.id === revisionId));
export const submitSelfAssessment = (projectId: string, etag: string, body: SubmitSelfAssessment, accountContext: string) => mutate(projectPath(projectId, "/self-assessments"), "POST", body, accountContext, matching(isSelfAssessmentView, (value) => value.projectId === projectId && value.projectRevisionId === body.projectRevisionId && value.rubricVersionId === body.rubricVersionId && value.submissionId === body.submissionId), etag, [201]);
export const listSelfAssessments = (projectId: string, page = 0, pageSize = 10) => request(`${projectPath(projectId, "/self-assessments")}?${pagination(page, pageSize)}`, matching(isSelfAssessmentPage, (value) => value.page === page && value.pageSize === pageSize && value.items.every((item) => item.projectId === projectId)));
export const getSelfAssessment = (projectId: string, assessmentId: string) => request(`${projectPath(projectId, "/self-assessments")}/${id(assessmentId)}`, matching(isSelfAssessmentView, (value) => value.projectId === projectId && value.id === assessmentId));
export const revealSolution = (activityId: string, body: RevealSolution, accountContext: string) => mutate(`/activities/${id(activityId)}/solution-reveals`, "POST", body, accountContext, matching(isSolutionRevealView, (value) => value.activityId === activityId && value.projectId === body.projectId && value.projectRevisionId === body.projectRevisionId && value.activityVersionId === body.activityVersionId && value.revisionId === body.revisionId && value.locale === body.locale));
export const getProjectTemplate = (activityId: string, activityVersionId: string, locale: Locale) => request(projectTemplatePath(activityId, activityVersionId, locale), matching(isProjectTemplate, (value) => value.activityId === activityId && value.activityVersionId === activityVersionId && value.locale === locale), {}, [200], false);
export const getMemberProjectTemplate = (activityId: string, activityVersionId: string, locale: Locale) => request(`/me${projectTemplatePath(activityId, activityVersionId, locale)}`, matching(isMemberProjectTemplate, (value) => value.activityId === activityId && value.activityVersionId === activityVersionId && value.locale === locale));
export const getProjectPreset = (caseCode: "BR01" | "BR02", locale: Locale) => {
  if (caseCode !== "BR01" && caseCode !== "BR02") throw new Error("Invalid project reference.");
  return request(`/admin/project-presets/${caseCode}?locale=${language(locale)}`, isProjectPreset);
};
