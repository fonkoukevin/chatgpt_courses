"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Badge, Button, ConfirmationDialog, FormField, RadioGroup, StatusMessage, TextArea } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { checkQuiz, listQuizAttempts, submitQuiz } from "@/lib/api/learning-client";
import type { QuizAttemptPage, QuizAttemptView, QuizCheckResult, QuizOverview, ResourceDetail, SubmitQuiz } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { ambiguousLearningError, remainingQuizAttempts } from "@/lib/learning/state";
import { LearningError, learningDate } from "./parts";
import { useUnsavedLearningInput } from "./unsaved";

export function QuizResult({ locale, value }: { locale: Locale; value: QuizAttemptView | QuizCheckResult }) {
  const t = getLearningDictionary(locale), durable = "id" in value;
  return <section className="space-y-5 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6" data-learning-quiz-result={durable ? "attempt" : "formative"} lang={locale}>
    <h3 className="text-xl font-semibold">{durable ? t.result : t.formativeResult}</h3><Badge tone={value.passed ? "success" : "warning"}>{value.passed ? t.quizPassed : t.quizNotPassed}</Badge>
    {!durable && <p className="text-sm leading-relaxed">{t.formativeHelp}</p>}<dl className="space-y-2 text-sm"><div><dt className="font-medium">{t.score}</dt><dd>{value.scorePoints} / {value.maxPoints}</dd></div><div><dt className="font-medium">{t.passThreshold}</dt><dd>{value.policy.passPercent}%</dd></div><div><dt className="font-medium">{t.attemptLanguage}</dt><dd>{value.locale.toUpperCase()}</dd></div>{durable && <div><dt className="font-medium">{t.attemptedAt}</dt><dd>{learningDate(value.submittedAt, locale)}</dd></div>}</dl>
    <ol className="space-y-5">{value.results.map((question) => <li key={question.key} className="space-y-3 border-t border-border pt-4"><h4 className="break-words font-semibold" lang={value.locale}>{question.prompt}</h4><p className="break-words text-sm"><span className="font-medium">{t.yourAnswer} : </span><span lang={value.locale}>{question.options[question.selectedOption]}</span></p><p className="break-words text-sm"><span className="font-medium">{t.correctAnswer} : </span><span lang={value.locale}>{question.options[question.correctOption]}</span></p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed"><span className="font-medium">{t.explanation} : </span><span lang={value.locale}>{question.explanation}</span></p><p className="text-sm tabular-nums">{question.awardedPoints} / {question.points}</p></li>)}</ol>
    <p className="text-sm leading-relaxed text-muted-foreground">{t.distinctEvidence}</p>
  </section>;
}

export function QuizHistory({ locale, activityVersionId, account, boundary, refresh = 0 }: { locale: Locale; activityVersionId: string; account: LearningAccountState; boundary: LearningAccountBoundary; refresh?: number }) {
  const t = getLearningDictionary(locale), sequence = useRef(0), [page, setPage] = useState(0), [result, setResult] = useState<AuthResult<QuizAttemptPage> | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (account.status !== "active") return;
    const scope = boundary.capture(), request = ++sequence.current; let active = true;
    void listQuizAttempts(activityVersionId, page, 5).then((value) => { if (active && request === sequence.current && boundary.isCurrent(scope)) { setResult(value); if (!value.ok) boundary.fail(value.error); } });
    return () => { active = false; };
  }, [activityVersionId, account.status, boundary, page, refresh, retry]);
  if (account.status !== "active") return null;
  return <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.attemptHistory}</h2>{!result ? <p role="status">{t.loading}</p> : !result.ok ? <LearningError locale={locale} error={result.error} retry={() => setRetry((value) => value + 1)} /> : <>{result.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t.noAttempts}</p> : result.data.items.map((attempt) => <details key={attempt.id} className="rounded-panel border border-border p-4"><summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-medium">{learningDate(attempt.submittedAt, locale)} · {attempt.locale.toUpperCase()} · {attempt.scorePoints}/{attempt.maxPoints}</summary><div className="mt-4"><QuizResult locale={locale} value={attempt} /></div></details>)}<div className="flex flex-wrap gap-3">{page > 0 && <Button variant="secondary" onClick={() => setPage((value) => value - 1)}>{t.previousAttempts}</Button>}{(result.data.page + 1) * result.data.pageSize < result.data.total && <Button variant="secondary" onClick={() => setPage((value) => value + 1)}>{t.moreAttempts}</Button>}</div></>}</section>;
}

export function ActivityQuiz({ locale, resource, enrollmentId, overview, account, boundary, available, contentVisible = true, onAttempt }: {
  locale: Locale; resource: ResourceDetail; enrollmentId?: string; overview?: QuizOverview | null;
  account: LearningAccountState; boundary: LearningAccountBoundary; available: boolean; contentVisible?: boolean; onAttempt?: () => void;
}) {
  const t = getLearningDictionary(locale), id = useId(), form = useRef<HTMLFormElement>(null), feedback = useRef<HTMLDivElement>(null), manualCopy = useRef<HTMLTextAreaElement>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({}), [result, setResult] = useState<QuizAttemptView | QuizCheckResult | null>(null), [submittedAnswers, setSubmittedAnswers] = useState("");
  const [error, setError] = useState<ApiError | null>(null), [busy, setBusy] = useState(false), [invalid, setInvalid] = useState(false), [uncertain, setUncertain] = useState(false), [unconfirmed, setUnconfirmed] = useState(false), [copy, setCopy] = useState<"copied" | "error" | null>(null);
  const lock = useRef(false), pendingSubmission = useRef<SubmitQuiz | null>(null), copySequence = useRef(0);
  const questions = resource.document?.quiz ?? [], answerText = JSON.stringify(questions.filter((question) => answers[question.key] !== undefined).map((question) => ({ key: question.key, optionIndex: answers[question.key] })));
  const durable = account.status === "active" && Boolean(enrollmentId), blocked = !available || ["changed", "expired"].includes(account.status) || account.status === "error" && account.accountId !== null;
  const policy = overview?.policy ?? resource.document?.quizPolicy ?? { passPercent: 100, maxAttempts: null };
  const remaining = remainingQuizAttempts(policy, overview?.attemptsRemaining, result && "attemptNumber" in result ? result.attemptNumber : undefined);
  const changedAfterResult = Boolean(result && submittedAnswers && submittedAnswers !== answerText);
  useUnsavedLearningInput(Object.keys(answers).length > 0 && (!result || changedAfterResult), boundary, t.unsavedLeave);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current || blocked || !resource.revisionId || questions.length === 0 || durable && remaining === 0 && !uncertain) return;
    if (!pendingSubmission.current && questions.some((question) => answers[question.key] === undefined)) { setInvalid(true); const missing = questions.findIndex((question) => answers[question.key] === undefined); form.current?.querySelectorAll("fieldset")[missing]?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    const body = pendingSubmission.current ?? { enrollmentId: enrollmentId ?? "", activityVersionId: resource.versionId, revisionId: resource.revisionId, locale: resource.locale, submissionId: crypto.randomUUID(), answers: JSON.parse(answerText) as SubmitQuiz["answers"] };
    if (durable) pendingSubmission.current = body;
    const scope = boundary.capture(); lock.current = true; setBusy(true); setInvalid(false); setError(null); setUnconfirmed(false);
    try {
      const response = durable && account.accountId ? await submitQuiz(resource.resourceId, body, account.accountId) : await checkQuiz(resource.resourceId, resource.versionId, { locale: body.locale, revisionId: body.revisionId, answers: body.answers });
      if (!boundary.isCurrent(scope)) { setUnconfirmed(true); return; }
      if (response.ok) { setResult(response.data); setSubmittedAnswers(JSON.stringify(body.answers)); pendingSubmission.current = null; setUncertain(false); if ("id" in response.data) onAttempt?.(); requestAnimationFrame(() => feedback.current?.focus()); }
      else { setError(response.error); const ambiguous = durable && ambiguousLearningError(response.error); setUncertain(ambiguous); if (!ambiguous) pendingSubmission.current = null; boundary.fail(response.error); requestAnimationFrame(() => feedback.current?.focus()); }
    } finally { lock.current = false; setBusy(false); }
  }
  async function copyAnswers() {
    const sequence = ++copySequence.current;
    try { await navigator.clipboard.writeText(JSON.stringify({ activityId: resource.resourceId, activityVersionId: resource.versionId, revisionId: resource.revisionId, locale: resource.locale, answers: JSON.parse(answerText) }, null, 2)); if (sequence === copySequence.current) setCopy("copied"); }
    catch { if (sequence === copySequence.current) setCopy("error"); }
  }
  if (!contentVisible) return null;
  if (questions.length === 0) return <section className="space-y-3"><h2 className="text-2xl font-semibold">{t.quiz}</h2><p className="text-sm text-muted-foreground">{t.noQuiz}</p></section>;
  return <section className="min-w-0 space-y-5" aria-labelledby={`${id}-heading`}><h2 id={`${id}-heading`} className="text-2xl font-semibold">{t.quiz}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.quizHelp}</p>{!durable && <StatusMessage>{t.quizAnonymous}</StatusMessage>}<p className="text-sm">{t.passThreshold} : {policy.passPercent}%{durable && (remaining === null || remaining === undefined ? ` · ${t.unlimitedAttempts}` : ` · ${t.attemptsRemaining} : ${remaining}`)}</p>
    <form ref={form} onSubmit={(event) => void submit(event)} noValidate className="space-y-5">{questions.map((question, index) => <div key={question.key} lang={resource.locale} className="rounded-panel border border-border p-4 sm:p-5"><RadioGroup label={`${index + 1}. ${question.prompt}`} name={`quiz-${question.key}`} disabled={blocked} value={answers[question.key] === undefined ? "" : String(answers[question.key])} options={question.options.map((option, optionIndex) => ({ value: String(optionIndex), label: option }))} onValueChange={(value) => { copySequence.current++; setCopy(null); setInvalid(false); setAnswers((current) => ({ ...current, [question.key]: Number(value) })); }} /></div>)}
      {invalid && <StatusMessage tone="danger">{t.answerRequired}</StatusMessage>}{uncertain && <StatusMessage tone="warning">{t.uncertainQuiz}</StatusMessage>}{unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}
      {durable && remaining === 0 && !uncertain ? <StatusMessage>{t.noMoreAttempts}</StatusMessage> : <Button type="submit" busy={busy} loadingLabel={durable ? t.submittingQuiz : t.checkingQuiz} disabled={blocked || result !== null && !changedAfterResult && !uncertain}>{uncertain ? t.retry : durable ? t.submitQuiz : t.checkQuiz}</Button>}
    </form>
    <div ref={feedback} tabIndex={-1} className="space-y-4 rounded-input outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{error && <LearningError locale={locale} error={error} />}{error?.status === 412 && <><StatusMessage tone="warning">{t.quizVersionChanged}</StatusMessage><ConfirmationDialog title={t.reloadActivity} description={t.reloadActivityDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.reloadActivity}</Button>} onConfirm={() => window.location.reload()} /></>}{changedAfterResult && <StatusMessage tone="warning">{t.answersChanged}</StatusMessage>}{result && <QuizResult locale={locale} value={result} />}</div>
    <div className="flex flex-wrap items-center gap-3">{result && (!durable || remaining !== 0) && <Button variant="secondary" disabled={blocked || busy} onClick={() => { setResult(null); setSubmittedAnswers(""); setError(null); }}>{t.tryAgain}</Button>}
    <Button variant="secondary" onClick={() => void copyAnswers()}>{t.copyAnswers}</Button></div>{copy && <StatusMessage tone={copy === "copied" ? "success" : "danger"}>{copy === "copied" ? t.copied : t.copyFailed}</StatusMessage>}{copy === "error" && <div className="space-y-3"><FormField id={`${id}-copy`} label={t.localVersion}><TextArea ref={manualCopy} readOnly rows={6} value={answerText} /></FormField><Button variant="secondary" onClick={() => { manualCopy.current?.focus(); manualCopy.current?.select(); }}>{t.selectText}</Button></div>}
  </section>;
}
