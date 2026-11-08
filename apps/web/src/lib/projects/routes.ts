import type { Locale } from "../i18n/locales";
import type { ProjectQuery } from "../api/projects-client";

export function projectsPath(locale: Locale, projectId?: string): string {
  const path = locale === "fr" ? "/fr/espace/projets" : "/en/my/projects";
  if (projectId === undefined) return path;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new Error("Invalid project identifier.");
  return `${path}/${projectId}`;
}

export function projectLanguages(projectId?: string): Record<Locale, string> {
  return { fr: projectsPath("fr", projectId), en: projectsPath("en", projectId) };
}

export function projectsNewHref(locale: Locale, draftId?: string): string {
  const path = `${projectsPath(locale)}/${locale === "fr" ? "nouveau" : "new"}`;
  if (draftId === undefined) return path;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftId)) throw new Error("Invalid project draft identifier.");
  return `${path}?${new URLSearchParams({ draft: draftId })}`;
}

export type ProjectListQuery = ProjectQuery;
export function projectsHref(locale: Locale, query: ProjectListQuery): string {
  const parameters = new URLSearchParams();
  for (const key of ["q", "state", "activityId", "activityVersionId", "page", "pageSize"] as const) if (query[key] !== undefined && query[key] !== "") parameters.set(key, String(query[key]));
  return `${projectsPath(locale)}${parameters.size ? `?${parameters}` : ""}`;
}
