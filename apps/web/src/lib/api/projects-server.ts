import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { Locale } from "../i18n/locales";
import type { AuthResult } from "./auth-client";
import { projectPath, projectQueryString, projectTemplatePath, type ProjectQuery } from "./projects-client";
import { decodeProjectsResponse } from "./projects-response";
import { matchingProjectResponse as matching } from "./projects-validation";
import { isProjectContext, isProjectPage, isProjectStatus, isProjectTemplate, isProjectView } from "./projects-validation";

async function read<T>(path: string, decode: (value: unknown) => value is T, personal = true): Promise<AuthResult<T>> {
  const session = personal ? (await cookies()).get("SESSION")?.value : undefined;
  if (personal && (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session))) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), { method: "GET", headers: {
      Accept: "application/json, application/problem+json", ...(session ? { Cookie: `SESSION=${session}` } : {}),
    }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs) });
    return await decodeProjectsResponse(response, decode);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export const readProjects = (query: ProjectQuery) => read(`/me/projects?${projectQueryString(query)}`, isProjectPage);
export const readProject = (projectId: string) => read(projectPath(projectId), matching(isProjectView, (value) => value.id === projectId));
export const readProjectContext = (projectId: string, locale: Locale) => read(`${projectPath(projectId, "/context")}?locale=${locale}`, matching(isProjectContext, (value) => value.projectId === projectId && (!value.resource || value.resource.locale === locale)));
export const readProjectStatus = (projectId: string) => read(projectPath(projectId, "/status"), matching(isProjectStatus, (value) => value.projectId === projectId));
export const readProjectTemplate = (activityId: string, activityVersionId: string, locale: Locale) => read(projectTemplatePath(activityId, activityVersionId, locale), matching(isProjectTemplate, (value) => value.activityId === activityId && value.activityVersionId === activityVersionId && value.locale === locale), false);
