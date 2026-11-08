"use client";

import { useId, useRef, useState } from "react";
import { Button, Checkbox, ConfirmationDialog, StatusMessage } from "@/components/ui";
import type { ActivityProgressView } from "@/lib/api/generated/types.gen";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { getActivityProgress, setActivityProgress } from "@/lib/api/learning-client";
import { activityProgressEtag } from "@/lib/api/learning-validation";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave } from "@/lib/cms/edit-session";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { LearningError } from "./parts";
import { useUnsavedLearningInput } from "./unsaved";

const declarations = (value: ActivityProgressView) => ({ read: value.readAt !== null, completed: value.completedAt !== null });
export function ActivityProgress({ locale, contentLocale, initial, account, boundary, available, onSaved }: {
  locale: Locale; contentLocale: Locale; initial: ActivityProgressView; account: LearningAccountState;
  boundary: LearningAccountBoundary; available: boolean; onSaved?: (value: ActivityProgressView) => void;
}) {
  const t = getLearningDictionary(locale), id = useId(), lock = useRef(false), request = useRef(0), conflictRequest = useRef(0);
  const [record, setRecord] = useState(initial), [session, setSession] = useState(() => createEditSession(declarations(initial), activityProgressEtag(initial)));
  const [error, setError] = useState<ApiError | null>(null), [conflict, setConflict] = useState<AuthResult<ActivityProgressView> | null>(null), [loadingConflict, setLoadingConflict] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const blocked = account.status !== "active" || !available;
  useUnsavedLearningInput(session.phase !== "saved", boundary, t.unsavedLeave);
  async function readConflict() {
    const scope = boundary.capture(), sequence = ++conflictRequest.current; setLoadingConflict(true);
    const result = await getActivityProgress(record.activityId, record.enrollmentId, record.activityVersionId);
    if (!boundary.isCurrent(scope) || sequence !== conflictRequest.current) return;
    setConflict(result.ok && result.data.revision < record.revision ? { ok: false, error: { kind: "invalid-response", status: 200 } } : result); setLoadingConflict(false);
  }
  async function save() {
    if (blocked || lock.current || !account.accountId || session.phase === "conflict") return;
    lock.current = true; const scope = boundary.capture(), pending = beginSave(session, ++request.current); setSession(pending.state); setError(null); setUnconfirmed(false);
    try {
      const result = await setActivityProgress(record.activityId, pending.attempt.etag, { enrollmentId: record.enrollmentId, activityVersionId: record.activityVersionId, locale: contentLocale, ...pending.attempt.value }, account.accountId);
      if (!boundary.isCurrent(scope)) { setSession((current) => rejectSave(current, pending.attempt, false)); setUnconfirmed(true); return; }
      if (result.ok && result.etag) { setRecord(result.data); setSession((current) => confirmSave(current, pending.attempt, declarations(result.data), result.etag!)); conflictRequest.current++; setConflict(null); onSaved?.(result.data); }
      else if (!result.ok) { setSession((current) => rejectSave(current, pending.attempt, result.error.status === 412)); setError(result.error); boundary.fail(result.error); if (result.error.status === 412) await readConflict(); }
    } finally { lock.current = false; }
  }
  function adopt(keep: boolean) {
    if (!conflict?.ok || blocked) return;
    const value = conflict.data; setRecord(value); conflictRequest.current++;
    setSession((current) => keep ? rebaseLocalEdit(current, declarations(value), activityProgressEtag(value)) : createEditSession(declarations(value), activityProgressEtag(value))); setConflict(null); setError(null);
  }
  return <section className="space-y-4 rounded-panel border border-border p-4 sm:p-6" data-learning-progress={session.phase}><h2 className="text-2xl font-semibold">{t.progress}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.completionNotice}</p>
    <Checkbox id={`${id}-read`} label={t.read} checked={session.value.read} disabled={blocked} onCheckedChange={(read) => setSession((current) => changeEditSession(current, { ...current.value, read }))} />
    <Checkbox id={`${id}-completed`} label={t.completed} checked={session.value.completed} disabled={blocked} onCheckedChange={(completed) => setSession((current) => changeEditSession(current, { ...current.value, completed }))} />
    <p role="status" className="text-sm">{session.phase === "saved" ? record.revision === 0 ? t.noDeclarations : t.progressSaved : session.phase === "saving" ? t.savingProgress : session.phase === "error" || session.phase === "conflict" ? t.saveFailed : t.progressModified}</p>
    {error && <LearningError locale={locale} error={error} />}{unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}
    {session.phase === "conflict" && <div className="space-y-4"><h3 className="font-semibold">{t.progressConflictTitle}</h3><Button variant="secondary" busy={loadingConflict} loadingLabel={t.loading} disabled={blocked} onClick={() => void readConflict()}>{t.retry}</Button>{conflict?.ok && <><dl className="space-y-3 rounded-input bg-surface-subtle p-4 text-sm"><div><dt className="font-semibold">{t.localVersion}</dt><dd>{t.read}: {session.value.read ? t.yes : t.no} · {t.completed}: {session.value.completed ? t.yes : t.no}</dd></div><div><dt className="font-semibold">{t.serverVersion}</dt><dd>{t.read}: {conflict.data.readAt ? t.yes : t.no} · {t.completed}: {conflict.data.completedAt ? t.yes : t.no}</dd></div></dl><div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.reload} description={t.reloadDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" disabled={blocked} className="max-w-full whitespace-normal">{t.reload}</Button>} onConfirm={() => adopt(false)} /><ConfirmationDialog title={t.keepLocal} description={t.keepLocalDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" disabled={blocked} className="max-w-full whitespace-normal">{t.keepLocal}</Button>} onConfirm={() => adopt(true)} /></div></>}{conflict && !conflict.ok && <LearningError locale={locale} error={conflict.error} />}</div>}
    <Button busy={session.phase === "saving"} loadingLabel={t.savingProgress} disabled={blocked || session.phase === "saved" || session.phase === "conflict"} onClick={() => void save()}>{t.saveProgress}</Button>
  </section>;
}
