import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser } from "@/lib/api/server-read";
import { readProject, readProjectContext, readProjects } from "@/lib/api/projects-server";
import type { ProjectQuery } from "@/lib/api/projects-client";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref } from "@/lib/auth/routes";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import type { Locale } from "@/lib/i18n/locales";
import { projectsHref, projectsNewHref, projectsPath } from "@/lib/projects/routes";
import { safeProjectsDestination } from "@/lib/projects/destination";
import { ProjectList } from "./list";
import { ProjectEditor } from "./editor";
import { ProjectDraftImport } from "./draft-import";
import { ProjectShell } from "./shell";

type Parameters = Record<string, string | string[] | undefined>;
type Props = { params: Promise<{ locale: string; projectId?: string }>; searchParams: Promise<Parameters> };
const single = (value: string | string[] | undefined) => typeof value === "string" ? value : value === undefined ? undefined : null;
function queryFrom(input: Parameters, locale: Locale): ProjectQuery | null {
  if (Object.values(input).some((value) => Array.isArray(value))) return null;
  const raw = new URLSearchParams(input as Record<string, string>);
  if (!safeProjectsDestination(projectsPath(locale) + (raw.size ? `?${raw}` : ""), locale)) return null;
  return { q: single(input.q)?.trim() || undefined, state: single(input.state) as ProjectQuery["state"] || undefined,
    activityId: single(input.activityId) || undefined, activityVersionId: single(input.activityVersionId) || undefined,
    page: Number(input.page ?? 0), pageSize: Number(input.pageSize ?? 20) };
}
async function account(locale: Locale, destination: string) {
  const value = await readCurrentUser();
  if (!value.ok && value.error.kind === "http" && value.error.status === 401) redirect(authHref(locale, "sign-in", destination, "required"));
  return value;
}
function Unavailable({ locale }: { locale: Locale }) {
  const t = getProjectsDictionary(locale);
  return <ProjectShell locale={locale}><StatusMessage tone="danger">{t.unavailable}</StatusMessage><Link href={projectsPath(locale)} prefetch={false} className="mt-4 inline-flex min-h-11 items-center">{t.retry}</Link></ProjectShell>;
}
export function projectMetadata(locale: Locale): Metadata {
  return { title: `${getProjectsDictionary(locale).projects} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}
export function projectListPage(expected: Locale) {
  return async function Page({ params, searchParams }: Props) {
    if ((await params).locale !== expected) notFound();
    const query = queryFrom(await searchParams, expected); if (!query) notFound();
    const user = await account(expected, projectsHref(expected, query)); if (!user.ok) return <Unavailable locale={expected} />;
    return <ProjectList key={user.data.id} locale={expected} initial={await readProjects(query)} query={query} expectedAccountId={user.data.id} />;
  };
}
export function projectNewPage(expected: Locale) {
  return async function Page({ params, searchParams }: Props) {
    if ((await params).locale !== expected) notFound();
    const input = await searchParams, draft = single(input.draft);
    if (Object.keys(input).some((key) => key !== "draft") || draft === null || draft !== undefined && !isUuid(draft)) notFound();
    const user = await account(expected, projectsNewHref(expected, draft)); if (!user.ok) return <Unavailable locale={expected} />;
    return <ProjectDraftImport key={`${user.data.id}:${draft ?? "new"}`} locale={expected} email={user.data.email} expectedAccountId={user.data.id} draftId={draft} />;
  };
}
export function projectDetailPage(expected: Locale) {
  return async function Page({ params }: Props) {
    const route = await params; if (route.locale !== expected || !isUuid(route.projectId)) notFound();
    const user = await account(expected, projectsPath(expected, route.projectId)); if (!user.ok) return <Unavailable locale={expected} />;
    const [initial, context] = await Promise.all([readProject(route.projectId), readProjectContext(route.projectId, expected)]);
    if (!initial.ok && initial.error.kind === "http" && initial.error.status === 404) notFound();
    return <ProjectEditor key={`${user.data.id}:${route.projectId}`} locale={expected} initial={initial} context={context} expectedAccountId={user.data.id} />;
  };
}
