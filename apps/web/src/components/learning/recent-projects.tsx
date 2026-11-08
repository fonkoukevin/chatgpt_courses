"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectPage } from "@/lib/api/generated/types.gen";
import { listProjects } from "@/lib/api/projects-client";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { getRecentProjectsDictionary } from "@/lib/i18n/recent-projects";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { projectsPath } from "@/lib/projects/routes";
import { projectDate, projectStateLabel } from "@/components/projects/parts";

export function RecentProjects({ locale, account, boundary }: { locale: Locale; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getRecentProjectsDictionary(locale), projects = getProjectsDictionary(locale), sequence = useRef(0);
  const [attempt, setAttempt] = useState(0), [response, setResponse] = useState<{ attempt: number; value: AuthResult<ProjectPage> } | null>(null);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const request = ++sequence.current, scope = boundary.capture();
    void listProjects({ page: 0, pageSize: 3 }).then((value) => {
      if (!active || request !== sequence.current || !boundary.isCurrent(scope)) return;
      setResponse({ attempt, value }); if (!value.ok) boundary.fail(value.error);
    });
    return () => { active = false; };
  }, [account.status, attempt, boundary]);
  const result = response?.attempt === attempt ? response.value : null;
  if (account.status !== "active") return null;
  return <section className="space-y-5" data-learning-recent-projects><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">{t.title}</h2><Link href={projectsPath(locale)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm">{t.library}</Link></div><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.description}</p>
    {!result ? <p role="status">{t.loading}</p> : !result.ok ? <div className="space-y-3"><StatusMessage tone="danger">{result.error.kind === "unavailable" ? t.unavailable : result.error.kind === "invalid-response" ? t.invalid : t.error}</StatusMessage><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>{t.retry}</Button></div> : result.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{result.data.items.map((project) => <Card key={`recent-project:${project.id}`}><CardHeader><div className="flex flex-wrap gap-2"><Badge>{project.locale.toUpperCase()}</Badge><Badge tone={project.state === "NEEDS_REVISION" ? "warning" : "neutral"}>{projectStateLabel(locale, project.state)}</Badge></div><h3 className="break-words text-lg font-semibold" lang={project.locale}><Link href={projectsPath(locale, project.id)} prefetch={false}>{project.title}</Link></h3><p className="break-words text-sm leading-relaxed text-muted-foreground">{project.activityTitle}</p>{project.courseTitle && <p className="break-words text-sm text-muted-foreground">{project.courseTitle}</p>}<p className="text-sm text-muted-foreground">{projects.sourceVersion} {project.activityVersionNumber}</p></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t.updated} {projectDate(project.updatedAt, locale)}</p></CardContent></Card>)}</div>}
  </section>;
}
