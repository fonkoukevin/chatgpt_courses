"use client";

import { useRef, useState } from "react";
import { Button, ConfirmationDialog, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { ProjectContext, ProjectView, SelfAssessmentView, SolutionRevealView } from "@/lib/api/generated/types.gen";
import { revealSolution } from "@/lib/api/projects-client";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { ProjectError, projectDate } from "./parts";

export function ProjectSolution({ locale, project, account, boundary, context, latestAssessment, clean }: {
  locale: Locale; project: ProjectView; account: LearningAccountState; boundary: LearningAccountBoundary;
  context: AuthResult<ProjectContext> | null; latestAssessment?: SelfAssessmentView | null; clean: boolean;
}) {
  const t = getProjectsDictionary(locale), [open, setOpen] = useState(false), [pending, setPending] = useState(false), [result, setResult] = useState<SolutionRevealView | null>(null), [error, setError] = useState<ApiError | null>(null), [unconfirmed, setUnconfirmed] = useState(false);
  const lock = useRef(false);
  const sourceAvailable = Boolean(context?.ok && context.data.accessStatus === "ACTIVE" && context.data.availability === "PUBLISHED");
  const assessmentRequired = project.rubric.revealPolicy === "AFTER_SUBMISSION" && latestAssessment?.projectRevisionId !== project.currentRevisionId;
  const blocked = account.status !== "active" || !sourceAvailable || assessmentRequired || !clean;
  async function reveal() {
    if (blocked || lock.current || !account.accountId) return;
    lock.current = true; setPending(true); setError(null); setUnconfirmed(false); const scope = boundary.capture();
    try {
      const response = await revealSolution(project.origin.activityId, { projectId: project.id, projectRevisionId: project.currentRevisionId, activityVersionId: project.origin.activityVersionId, revisionId: project.origin.revisionId, locale: project.origin.locale }, account.accountId);
      if (!boundary.isCurrent(scope)) { setUnconfirmed(true); return; }
      if (response.ok) { setResult(response.data); setOpen(false); }
      else { setError(response.error); boundary.fail(response.error); }
    } finally { lock.current = false; setPending(false); }
  }
  return <section className="space-y-5"><h2 className="text-2xl font-semibold">{t.solution}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.solutionNotice}</p>{!clean && <StatusMessage>{t.readyHelp}</StatusMessage>}{!sourceAvailable && <StatusMessage tone="warning">{t.revealUnavailable}</StatusMessage>}{assessmentRequired && <StatusMessage>{t.revealAfterAssessment}</StatusMessage>}
    <ConfirmationDialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }} title={t.revealTitle} description={t.revealDescription} confirmLabel={t.reveal} cancelLabel={t.cancel} destructive={false} busy={pending} trigger={<Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked}>{t.reveal}</Button>} onConfirm={(event) => { event.preventDefault(); void reveal(); }}>{error && <ProjectError locale={locale} error={error} />}</ConfirmationDialog>
    {unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}{result && sourceAvailable && account.status === "active" && <section className="space-y-4 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6" data-project-solution={result.id}><h3 className="font-semibold">{t.revealed}</h3><p className="text-sm text-muted-foreground">{projectDate(result.revealedAt, locale)} · {result.locale.toUpperCase()}</p>{result.projectRevisionId !== project.currentRevisionId && <StatusMessage>{t.olderSolution}</StatusMessage>}<div className="whitespace-pre-wrap break-words leading-relaxed" lang={result.locale}>{result.correction}</div></section>}
  </section>;
}
