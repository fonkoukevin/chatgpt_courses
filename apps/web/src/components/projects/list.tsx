"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, FormField, Input, Link, Pagination, Select } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectPage } from "@/lib/api/generated/types.gen";
import type { ProjectQuery } from "@/lib/api/projects-client";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { useLearningAccount } from "@/lib/learning/account";
import { projectsHref, projectsPath } from "@/lib/projects/routes";
import { publicCatalogueHref } from "@/lib/public/routes";
import { ProjectAccountNotice, ProjectError, projectDate, projectStateLabel } from "./parts";
import { ProjectShell } from "./shell";

export function ProjectList({ locale, initial, expectedAccountId, query }: { locale: Locale; initial: AuthResult<ProjectPage>; expectedAccountId: string; query: ProjectQuery }) {
  const t = getProjectsDictionary(locale), id = useId(), router = useRouter(), [pending, startTransition] = useTransition();
  const { state, boundary } = useLearningAccount(projectsHref(locale, query), expectedAccountId);
  if (state.status !== "active") return <ProjectShell locale={locale}><ProjectAccountNotice locale={locale} state={state} boundary={boundary} returnTo={projectsHref(locale, query)} /></ProjectShell>;
  return <ProjectShell locale={locale} languageLinks={{ fr: projectsHref("fr", query), en: projectsHref("en", query) }}><div className="space-y-6"><form action={projectsPath(locale)} method="get" className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto]" key={JSON.stringify(query)}><FormField id={`${id}-search`} label={t.search}><Input type="search" name="q" maxLength={240} defaultValue={query.q ?? ""} placeholder={t.searchHint} /></FormField><FormField id={`${id}-state`} label={t.filterState}><Select name="state" defaultValue={query.state ?? ""} options={[{ value: "", label: t.allStates }, ...(["DRAFT", "READY_FOR_SELF_ASSESSMENT", "SELF_ASSESSED", "NEEDS_REVISION"] as const).map((value) => ({ value, label: projectStateLabel(locale, value) }))]} /></FormField>{query.activityId && <input type="hidden" name="activityId" value={query.activityId} />}{query.activityVersionId && <input type="hidden" name="activityVersionId" value={query.activityVersionId} />}<Button type="submit">{t.searchAction}</Button></form>
    {(query.q || query.state || query.activityId || query.activityVersionId) && <Link href={projectsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.clearFilters}</Link>}
    {!initial.ok ? <ProjectError locale={locale} error={initial.error} retry={() => startTransition(() => router.refresh())} /> : <><p role="status" className="text-sm text-muted-foreground">{initial.data.total} {initial.data.total === 1 ? t.oneProject : t.manyProjects}</p>{initial.data.items.length === 0 ? <EmptyState title={query.q || query.state || query.activityId ? t.noMatch : t.emptyTitle} description={t.emptyDescription}><Link href={publicCatalogueHref(locale)}>{t.discover}</Link></EmptyState> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{initial.data.items.map((project) => <Card key={`project-card:${project.id}`}><CardHeader><div className="flex flex-wrap gap-2"><Badge>{project.locale.toUpperCase()}</Badge><Badge tone={project.state === "NEEDS_REVISION" ? "warning" : "neutral"}>{projectStateLabel(locale, project.state)}</Badge></div><h2 className="break-words text-xl font-semibold" lang={project.locale}><Link href={projectsPath(locale, project.id)} prefetch={false}>{project.title}</Link></h2><p className="break-words text-sm leading-relaxed text-muted-foreground">{project.activityTitle}</p><p className="text-sm text-muted-foreground">{t.sourceVersion} {project.activityVersionNumber}</p>{project.courseTitle && <p className="break-words text-sm text-muted-foreground">{project.courseTitle}</p>}</CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t.updated} {projectDate(project.updatedAt, locale)}</p><Link href={projectsPath(locale, project.id)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.open}</Link></CardContent></Card>)}</div>}
      {initial.data.total > 0 && initial.data.page < Math.ceil(initial.data.total / initial.data.pageSize) && <Pagination page={initial.data.page + 1} totalPages={Math.ceil(initial.data.total / initial.data.pageSize)} label={t.pagination} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.page} hrefForPage={(page) => projectsHref(locale, { ...query, page: page - 1 })} />}</>}{pending && <p role="status">{t.loading}</p>}
  </div></ProjectShell>;
}
