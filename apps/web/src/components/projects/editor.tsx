"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Link, StatusMessage, Tabs } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ProjectContext, ProjectFields, ProjectStatus, ProjectTemplate, ProjectView, SelfAssessmentView } from "@/lib/api/generated/types.gen";
import { getProjectContext, getProjectStatus } from "@/lib/api/projects-client";
import type { ProjectCreationSource } from "@/lib/auth/project-draft";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { useLearningAccount } from "@/lib/learning/account";
import { projectLanguages, projectsNewHref, projectsPath } from "@/lib/projects/routes";
import { useProjectEditing } from "@/lib/projects/use-project-editing";
import { useUnsavedLearningInput } from "@/components/learning/unsaved";
import { ProjectAssessment } from "./assessment";
import { ProjectBriefPanel } from "./brief";
import { ProjectHistory } from "./history";
import { ProjectAccountNotice, ProjectError, projectStateLabel } from "./parts";
import { ProjectSaveForm } from "./save-form";
import { ProjectShell } from "./shell";
import { ProjectSolution } from "./solution";

export function ProjectEditor({ locale, initial, expectedAccountId, context: initialContext, initialFields, source, template, creationId, onCreated }: {
  locale: Locale; initial: AuthResult<ProjectView> | null; expectedAccountId: string; context?: AuthResult<ProjectContext>;
  initialFields?: ProjectFields; source?: ProjectCreationSource; template?: AuthResult<ProjectTemplate>; creationId?: string; onCreated?: (value: ProjectView) => void;
}) {
  const t = getProjectsDictionary(locale), router = useRouter();
  const initialRecord = initial?.ok ? initial.data : null;
  const returnTo = initialRecord ? projectsPath(locale, initialRecord.id) : projectsNewHref(locale, creationId);
  const { state: account, boundary } = useLearningAccount(returnTo, expectedAccountId);
  const [refresh, setRefresh] = useState(0), [context, setContext] = useState<AuthResult<ProjectContext> | null>(initialContext ?? null);
  const [status, setStatus] = useState<AuthResult<ProjectStatus> | null>(null), [recorded, setRecorded] = useState<SelfAssessmentView | null>(null);
  const generation = useRef(0);
  const editing = useProjectEditing({ locale, initial: initialRecord, initialFields, source, creationId, account, boundary, onCreated: (value) => {
    onCreated?.(value); window.history.replaceState(null, "", projectsPath(locale, value.id));
  } });
  const { record } = editing;
  useUnsavedLearningInput(editing.dirty && (editing.session.change > 0 || Boolean(initialFields)), boundary, t.unsavedLeave);
  useEffect(() => {
    if (!record || account.status !== "active") return;
    let active = true;
    const sequence = ++generation.current, scope = boundary.capture();
    void Promise.all([getProjectContext(record.id, locale), getProjectStatus(record.id)]).then(([nextContext, nextStatus]) => {
      if (!active || sequence !== generation.current || !boundary.isCurrent(scope)) return;
      setContext(nextContext);
      if (nextStatus.ok && nextStatus.data.currentRevisionId !== record.currentRevisionId) setStatus({ ok: false, error: { kind: "invalid-response", status: nextStatus.status } }); else setStatus(nextStatus);
      if (!nextContext.ok) boundary.fail(nextContext.error); if (!nextStatus.ok) boundary.fail(nextStatus.error);
    });
    return () => { active = false; };
  }, [account.status, boundary, locale, record, refresh]);
  const latest = recorded ?? (status?.ok ? status.data.latestAssessment : null);
  const clean = editing.session.phase === "saved";
  const shell = { locale, title: t.editorTitle, description: t.editorDescription, languageLinks: record ? projectLanguages(record.id) : projectLanguages() };
  if (initial && !initial.ok) return <ProjectShell {...shell}><ProjectError locale={locale} error={initial.error} retry={() => router.refresh()} /></ProjectShell>;
  const briefProps = { locale, result: account.status === "active" ? context : null, resource: !record ? editing.sourceTemplate?.resource ?? (template?.ok ? template.data.resource : undefined) : undefined, retry: () => setRefresh((value) => value + 1) };
  return <ProjectShell {...shell}><div className="space-y-6"><Link href={projectsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">{t.back}</Link><ProjectAccountNotice locale={locale} state={account} boundary={boundary} returnTo={record ? projectsPath(locale, record.id) : returnTo} />
    {record && <header className="space-y-3 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6"><h2 className="break-words text-xl font-semibold" lang={record.origin.locale}>{record.origin.title}</h2><div className="flex flex-wrap gap-2"><Badge>{t.sourceVersion} {record.origin.activityVersionNumber}</Badge><Badge>{t.projectRevision} {record.revisionNumber}</Badge><Badge>{record.fields.locale.toUpperCase()}</Badge></div><p className="text-sm"><span className="font-medium">{t.status} : </span>{projectStateLabel(locale, status?.ok && status.data.currentRevisionId === record.currentRevisionId ? status.data.state : record.stage)}</p><p className="text-sm leading-relaxed text-muted-foreground">{t.stateHelp}</p>{status && !status.ok && <ProjectError locale={locale} error={status.error} retry={() => setRefresh((value) => value + 1)} />}</header>}
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,350px)]"><div className="min-w-0 space-y-6"><div className="xl:hidden"><ProjectBriefPanel {...briefProps} /></div>
      <Tabs label={t.workspaceTabs} keepMounted defaultValue="write" items={[{ value: "write", label: t.write, content: <ProjectSaveForm locale={locale} editing={editing} onSaved={() => setRefresh((value) => value + 1)} /> }, { value: "check", label: t.check, content: record ? <ProjectAssessment key={`assessment:${record.id}`} locale={locale} project={record} account={account} boundary={boundary} clean={clean} latestAssessment={latest} onRecorded={(value) => { setRecorded(value); setRefresh((current) => current + 1); }} /> : <StatusMessage>{t.readyHelp}</StatusMessage> }, { value: "solution", label: t.solution, content: record ? <ProjectSolution key={`solution:${record.id}`} locale={locale} project={record} account={account} boundary={boundary} context={context} latestAssessment={latest} clean={clean} /> : <StatusMessage>{t.readyHelp}</StatusMessage> }, { value: "history", label: t.history, content: record ? <ProjectHistory key={`history:${record.id}`} locale={locale} projectId={record.id} currentRevisionId={record.currentRevisionId} rubric={record.rubric} account={account} boundary={boundary} refresh={refresh} /> : <StatusMessage>{t.localOnly}</StatusMessage> }]} />
      <p className="text-sm text-muted-foreground">{t.filesDeferred} {t.humanDeferred}</p></div><div className="hidden xl:block"><ProjectBriefPanel {...briefProps} /></div></div>
  </div></ProjectShell>;
}
