"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Checkbox, ConfirmationDialog, FormField, StatusMessage, TextArea } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { BlockingDeclaration, CriterionDeclaration, ProjectView, SelfAssessmentView, SubmitSelfAssessment } from "@/lib/api/generated/types.gen";
import { submitSelfAssessment } from "@/lib/api/projects-client";
import { projectEtag } from "@/lib/api/projects-validation";
import { beginSave, changeEditSession, confirmSave, createEditSession, rejectSave, type EditSession } from "@/lib/cms/edit-session";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { ambiguousLearningError } from "@/lib/learning/state";
import { validMethodText } from "@/lib/methods/validation";
import { useUnsavedLearningInput } from "@/components/learning/unsaved";
import { ProjectError, projectDate } from "./parts";

type Declarations = { answers: CriterionDeclaration[]; blockingDeclarations: BlockingDeclaration[]; comment: string };
function emptyDeclarations(project: ProjectView): Declarations {
  return { answers: project.rubric.criteria.map(({ key }) => ({ key, satisfied: false, comment: "" })), blockingDeclarations: project.rubric.blockingIssues.map(({ key }) => ({ key, present: false, comment: "" })), comment: "" };
}
function validDeclarations(value: Declarations): boolean {
  return value.answers.length === 20 && value.blockingDeclarations.length === 4 && value.answers.every(({ comment }) => validMethodText(comment, 1000)) && value.blockingDeclarations.every(({ comment }) => validMethodText(comment, 1000)) && validMethodText(value.comment, 4000)
    && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 48 * 1024;
}

export function EvaluationSummary({ locale, value, currentRevisionId }: { locale: Locale; value: SelfAssessmentView; currentRevisionId: string }) {
  const t = getProjectsDictionary(locale);
  return <section className="space-y-4 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6" data-project-assessment-result={value.id} lang={locale}><h3 className="text-xl font-semibold">{t.assessmentCompleted}</h3><div className="flex flex-wrap gap-2"><Badge tone={value.needsRevision ? "warning" : "brand"}>{value.needsRevision ? t.stateRevise : t.stateAssessed}</Badge></div>
    {value.projectRevisionId !== currentRevisionId && <StatusMessage tone="warning">{t.olderAssessment}</StatusMessage>}<dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-medium">{t.declaredScore}</dt><dd className="mt-1 tabular-nums">{value.scorePoints} / {value.maxPoints}</dd></div><div><dt className="font-medium">{t.threshold}</dt><dd className="mt-1 tabular-nums">{value.passPoints} / {value.maxPoints}</dd></div><div className="sm:col-span-2"><dt className="font-medium">{t.evaluatedAt}</dt><dd className="mt-1">{projectDate(value.evaluatedAt, locale)}</dd></div></dl>
    <p className="text-sm font-medium">{value.thresholdMet ? t.thresholdDeclaredMet : t.thresholdDeclaredNotMet}</p>{value.blockingIssues.length > 0 && <div className="space-y-3"><h4 className="font-semibold">{t.blockingIssues}</h4><ul className="list-disc space-y-3 pl-5 text-sm">{value.blockingIssues.map((issue) => <li key={issue.key} className="break-words leading-relaxed">{issue.label}{issue.comment && <p className="mt-1 whitespace-pre-wrap">{issue.comment}</p>}</li>)}</ul></div>}
    {value.comment && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{value.comment}</p>}<p className="text-sm leading-relaxed text-muted-foreground">{t.assessmentNotice}</p><details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium">{t.provenance}</summary><dl className="space-y-3"><div><dt>{t.projectRevision}</dt><dd className="mt-1 break-all">{value.projectRevisionId}</dd></div><div><dt>{t.authorReference}</dt><dd className="mt-1 break-all">{value.authorId}</dd></div></dl><p className="mt-3 text-muted-foreground">{t.evaluator}. {t.humanDeferred}</p></details>
  </section>;
}

export function ProjectAssessment({ locale, project, account, boundary, clean, latestAssessment, onRecorded }: {
  locale: Locale; project: ProjectView; account: LearningAccountState; boundary: LearningAccountBoundary; clean: boolean;
  latestAssessment?: SelfAssessmentView | null; onRecorded: (value: SelfAssessmentView) => void;
}) {
  const t = getProjectsDictionary(locale), id = useId(), [target, setTarget] = useState(project);
  const [session, setSession] = useState<EditSession<Declarations>>(() => ({ ...createEditSession(emptyDeclarations(project), ""), phase: "modified" }));
  const [result, setResult] = useState<SelfAssessmentView | null>(null), [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState(false), [uncertain, setUncertain] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const [copy, setCopy] = useState<{ value: string; state: "copied" | "error" } | null>(null);
  const lock = useRef(false), request = useRef(0), copyRequest = useRef(0), feedback = useRef<HTMLDivElement>(null), manualCopy = useRef<HTMLTextAreaElement>(null);
  const pendingSubmission = useRef<{ body: SubmitSelfAssessment; etag: string; change: number } | null>(null);
  const draftIsBound = session.change > 0 || session.activeRequest !== null || result !== null;
  const currentTarget = draftIsBound ? target : project, changedRevision = currentTarget.currentRevisionId !== project.currentRevisionId;
  const blocked = account.status !== "active", dirty = session.phase !== "saved" && session.change > 0, shown = result ?? latestAssessment;
  const serialized = JSON.stringify(session.value, null, 2), copyResult = copy?.value === serialized ? copy.state : null;
  useUnsavedLearningInput(dirty, boundary, t.unsavedLeave);
  function change(value: Declarations) { if (!draftIsBound) setTarget(project); copyRequest.current++; setCopy(null); setSession((current) => changeEditSession(current, value)); setInvalid(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (blocked || lock.current || !account.accountId || (!pendingSubmission.current && (!clean || changedRevision || currentTarget.stage !== "READY_FOR_SELF_ASSESSMENT"))) return;
    if (!pendingSubmission.current && !validDeclarations(session.value)) { setInvalid(true); requestAnimationFrame(() => feedback.current?.focus()); return; }
    const pending = beginSave(session, ++request.current), previous = pendingSubmission.current;
    const body: SubmitSelfAssessment = previous?.body ?? { submissionId: crypto.randomUUID(), projectRevisionId: currentTarget.currentRevisionId, rubricVersionId: currentTarget.rubric.id, answers: pending.attempt.value.answers as SubmitSelfAssessment["answers"], blockingDeclarations: pending.attempt.value.blockingDeclarations as SubmitSelfAssessment["blockingDeclarations"], comment: pending.attempt.value.comment };
    const etag = previous?.etag ?? projectEtag(currentTarget), attempt = { ...pending.attempt, value: { answers: body.answers, blockingDeclarations: body.blockingDeclarations, comment: body.comment }, change: previous?.change ?? pending.attempt.change };
    pendingSubmission.current = { body, etag, change: attempt.change }; setTarget(currentTarget); const scope = boundary.capture();
    lock.current = true; setSession(pending.state); setError(null); setInvalid(false); setUnconfirmed(false);
    try {
      const response = await submitSelfAssessment(project.id, etag, body, account.accountId);
      if (!boundary.isCurrent(scope)) { setSession((current) => rejectSave(current, attempt, false)); setUnconfirmed(true); return; }
      if (response.ok) { pendingSubmission.current = null; setUncertain(false); setResult(response.data); setSession((current) => confirmSave(current, attempt, { answers: response.data.answers, blockingDeclarations: response.data.blockingDeclarations, comment: response.data.comment }, "")); onRecorded(response.data); requestAnimationFrame(() => feedback.current?.focus()); }
      else { const ambiguous = ambiguousLearningError(response.error); setUncertain(ambiguous); if (!ambiguous) pendingSubmission.current = null; setSession((current) => rejectSave(current, attempt, false)); setError(response.error); boundary.fail(response.error); requestAnimationFrame(() => feedback.current?.focus()); }
    } finally { lock.current = false; }
  }
  function reset() { if (lock.current || uncertain || blocked) return; pendingSubmission.current = null; setTarget(project); setSession({ ...createEditSession(emptyDeclarations(project), ""), phase: "modified" }); setResult(null); setError(null); setInvalid(false); setCopy(null); }
  async function copyDeclarations() {
    const sequence = ++copyRequest.current;
    try { await navigator.clipboard.writeText(serialized); if (sequence === copyRequest.current) setCopy({ value: serialized, state: "copied" }); }
    catch { if (sequence === copyRequest.current) setCopy({ value: serialized, state: "error" }); }
  }
  const categories = [
    { key: "fidelity", title: t.categoryFidelity }, { key: "scope", title: t.categoryScope }, { key: "budget", title: t.categoryBudget }, { key: "schedule", title: t.categorySchedule }, { key: "presentation", title: t.categoryPresentation },
  ];
  return <section className="min-w-0 space-y-6" data-project-assessment-state={session.phase}><div className="space-y-3"><h2 className="text-2xl font-semibold">{t.rubric}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.rubricHelp}</p><p className="text-sm">{t.projectRevision} {currentTarget.revisionNumber} · {t.threshold} {currentTarget.rubric.passPoints}/{currentTarget.rubric.maxPoints}</p></div>
    {(!clean || currentTarget.stage !== "READY_FOR_SELF_ASSESSMENT") && <StatusMessage>{t.readyHelp}</StatusMessage>}{changedRevision && <StatusMessage tone="warning">{t.assessmentTargetChanged}</StatusMessage>}
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-6"><fieldset disabled={blocked} className="min-w-0 space-y-6">{categories.map((category) => <section key={`assessment-category:${category.key}`} className="space-y-4 rounded-panel border border-border p-4 sm:p-5"><h3 className="text-lg font-semibold">{category.title}</h3>{currentTarget.rubric.criteria.filter((criterion) => criterion.category === category.key).map((criterion) => {
      const answer = session.value.answers.find((entry) => entry.key === criterion.key)!;
      return <div key={`assessment-criterion:${criterion.key}`} className="space-y-2 border-t border-border pt-3"><Checkbox id={`${id}-${criterion.key}`} label={<span lang={currentTarget.rubric.locale}>{criterion.label}</span>} checked={answer.satisfied} onCheckedChange={(satisfied) => change({ ...session.value, answers: session.value.answers.map((entry) => entry.key === criterion.key ? { ...entry, satisfied } : entry) })} /><details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">{t.commentToggle}</summary><FormField id={`${id}-${criterion.key}-comment`} label={t.comments}><TextArea rows={3} maxLength={1000} lang={project.fields.locale} value={answer.comment} onChange={(event) => change({ ...session.value, answers: session.value.answers.map((entry) => entry.key === criterion.key ? { ...entry, comment: event.target.value } : entry) })} /></FormField></details></div>;
    })}</section>)}
      <section className="space-y-4 rounded-panel border border-warning/30 bg-warning-soft p-4 sm:p-5"><h3 className="text-lg font-semibold">{t.blockingIssues}</h3><p className="text-sm leading-relaxed">{t.blockingHelp}</p>{currentTarget.rubric.blockingIssues.map((issue) => { const answer = session.value.blockingDeclarations.find((entry) => entry.key === issue.key)!; return <div key={`assessment-blocking:${issue.key}`} className="space-y-2"><Checkbox id={`${id}-${issue.key}`} label={<span lang={currentTarget.rubric.locale}>{issue.label}</span>} checked={answer.present} onCheckedChange={(present) => change({ ...session.value, blockingDeclarations: session.value.blockingDeclarations.map((entry) => entry.key === issue.key ? { ...entry, present } : entry) })} /><details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">{t.commentToggle}</summary><FormField id={`${id}-${issue.key}-comment`} label={t.comments}><TextArea rows={3} maxLength={1000} lang={project.fields.locale} value={answer.comment} onChange={(event) => change({ ...session.value, blockingDeclarations: session.value.blockingDeclarations.map((entry) => entry.key === issue.key ? { ...entry, comment: event.target.value } : entry) })} /></FormField></details></div>; })}</section>
      <FormField id={`${id}-comment`} label={t.comments}><TextArea name="assessmentComment" lang={project.fields.locale} rows={4} maxLength={4000} value={session.value.comment} onChange={(event) => change({ ...session.value, comment: event.target.value })} /></FormField>
    </fieldset>{uncertain && <StatusMessage tone="warning">{t.pendingAssessment}</StatusMessage>}{unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}{session.change > 0 && session.phase === "modified" && <p role="status" className="text-sm">{t.assessmentModified}</p>}<Button type="submit" busy={session.phase === "saving"} loadingLabel={t.assessing} disabled={blocked || !uncertain && (!clean || changedRevision || currentTarget.stage !== "READY_FOR_SELF_ASSESSMENT" || session.phase === "saved")}>{uncertain ? t.retry : t.submitAssessment}</Button></form>
    <div ref={feedback} tabIndex={-1} className="space-y-4 rounded-input outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{invalid && <StatusMessage tone="danger">{t.invalidFields}</StatusMessage>}{error && <ProjectError locale={locale} error={error} />}{shown && <EvaluationSummary locale={locale} value={shown} currentRevisionId={project.currentRevisionId} />}</div>
    <div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.newAssessment} description={t.newAssessmentDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" disabled={blocked || session.phase === "saving" || uncertain} className="max-w-full whitespace-normal">{t.newAssessment}</Button>} onConfirm={reset} /><Button variant="secondary" onClick={() => void copyDeclarations()}>{t.copyDeclarations}</Button></div>{copyResult && <StatusMessage tone={copyResult === "copied" ? "success" : "danger"}>{copyResult === "copied" ? t.declarationsCopied : t.copyFailed}</StatusMessage>}{copyResult === "error" && <div className="space-y-3"><FormField id={`${id}-copy`} label={t.local}><TextArea ref={manualCopy} readOnly rows={8} value={serialized} /></FormField><Button variant="secondary" onClick={() => { manualCopy.current?.focus(); manualCopy.current?.select(); }}>{t.selectText}</Button></div>}
  </section>;
}
