"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, ConfirmationDialog, FormField, StatusMessage, TextArea } from "@/components/ui";
import type { ActivityNoteView } from "@/lib/api/generated/types.gen";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { createActivityNote, getActivityNote, getActivityNoteForActivity, updateActivityNote } from "@/lib/api/learning-client";
import { activityNoteEtag } from "@/lib/api/learning-validation";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave, type EditSession } from "@/lib/cms/edit-session";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { validActivityNote } from "@/lib/learning/state";
import { LearningError, learningDate } from "./parts";
import { useUnsavedLearningInput } from "./unsaved";

export type ActivityNotesProps = {
  locale: Locale; contentLocale: Locale; activityId: string; activityVersionId: string;
  account: LearningAccountState; boundary: LearningAccountBoundary; canCreate: boolean;
};

export function ActivityNotes({ locale, contentLocale, activityId, activityVersionId, account, boundary, canCreate }: ActivityNotesProps) {
  const t = getLearningDictionary(locale), id = useId(), input = useRef<HTMLTextAreaElement>(null), manualCopy = useRef<HTMLTextAreaElement>(null), feedback = useRef<HTMLDivElement>(null);
  const [record, setRecord] = useState<ActivityNoteView | null>(null), [session, setSession] = useState<EditSession<string> | null>(null);
  const [error, setError] = useState<ApiError | null>(null), [loading, setLoading] = useState(true), [invalid, setInvalid] = useState(false);
  const [conflict, setConflict] = useState<AuthResult<ActivityNoteView> | null>(null), [conflictPending, setConflictPending] = useState(false);
  const [copy, setCopy] = useState<"copied" | "error" | null>(null), [unconfirmed, setUnconfirmed] = useState(false);
  const loaded = useRef(false), request = useRef(0), conflictRequest = useRef(0), copyRequest = useRef(0), lock = useRef(false), minimumRevision = useRef(0);
  const blocked = account.status !== "active", dirty = Boolean(session && session.phase !== "saved" && (session.change > 0 || record !== null));
  useUnsavedLearningInput(dirty, boundary, t.unsavedLeave);
  const accept = useCallback((value: ActivityNoteView | null) => {
    setRecord(value); setSession(value ? createEditSession(value.text, activityNoteEtag(value)) : { ...createEditSession("", ""), phase: "modified" });
    if (value) minimumRevision.current = Math.max(minimumRevision.current, value.revision);
    loaded.current = true; setLoading(false); setError(null);
  }, []);
  useEffect(() => {
    if (account.status !== "active" || !account.accountId || loaded.current) return;
    const scope = boundary.capture(), sequence = ++request.current; let active = true;
    void getActivityNoteForActivity(activityId, activityVersionId).then((result) => {
      if (!active || !boundary.isCurrent(scope) || sequence !== request.current) return;
      if (result.ok) accept(result.data.note); else { setError(result.error); setLoading(false); boundary.fail(result.error); }
    });
    return () => { active = false; };
  }, [account.status, account.accountId, activityId, activityVersionId, boundary, accept]);
  async function reloadLookup() {
    if (blocked || lock.current) return;
    const scope = boundary.capture(), sequence = ++request.current; setLoading(true);
    const result = await getActivityNoteForActivity(activityId, activityVersionId);
    if (!boundary.isCurrent(scope) || sequence !== request.current) return;
    if (result.ok) accept(result.data.note); else { setError(result.error); setLoading(false); boundary.fail(result.error); }
  }
  async function readConflict() {
    if (blocked) return;
    const scope = boundary.capture(), sequence = ++conflictRequest.current; setConflictPending(true);
    const result = record ? await getActivityNote(record.id) : await getActivityNoteForActivity(activityId, activityVersionId).then((response): AuthResult<ActivityNoteView> => response.ok ? response.data.note ? { ok: true, data: response.data.note, status: 200, etag: activityNoteEtag(response.data.note) } : { ok: false, error: { kind: "invalid-response", status: 200 } } : response);
    if (!boundary.isCurrent(scope) || sequence !== conflictRequest.current) return;
    if (result.ok && result.data.revision < minimumRevision.current) setConflict({ ok: false, error: { kind: "invalid-response", status: 200 } });
    else { if (result.ok) minimumRevision.current = Math.max(minimumRevision.current, result.data.revision); setConflict(result); }
    setConflictPending(false);
  }
  async function save() {
    if (!session || !account.accountId || blocked || lock.current || session.phase === "conflict" || (!record && !canCreate)) return;
    if (!validActivityNote(session.value)) { setInvalid(true); input.current?.focus(); return; }
    lock.current = true; setError(null); setInvalid(false); setUnconfirmed(false);
    const scope = boundary.capture(), pending = beginSave(session, ++request.current); setSession(pending.state);
    try {
      const result = record ? await updateActivityNote(record.id, pending.attempt.etag, { text: pending.attempt.value }, account.accountId)
        : await createActivityNote({ activityId, activityVersionId, locale: contentLocale, text: pending.attempt.value }, account.accountId);
      if (!boundary.isCurrent(scope)) { setSession((current) => current ? rejectSave(current, pending.attempt, false) : current); setUnconfirmed(true); return; }
      if (result.ok && result.etag) {
        setRecord(result.data); minimumRevision.current = Math.max(minimumRevision.current, result.data.revision); conflictRequest.current++;
        setSession((current) => current ? confirmSave(current, pending.attempt, result.data.text, result.etag!) : current); setConflict(null);
      } else if (!result.ok) {
        const isConflict = result.error.status === 412 || result.error.status === 409 && "problem" in result.error && result.error.problem?.code === "ACTIVITY_NOTE_EXISTS";
        setSession((current) => current ? rejectSave(current, pending.attempt, isConflict) : current); setError(result.error); boundary.fail(result.error);
        if (isConflict) await readConflict();
        requestAnimationFrame(() => feedback.current?.focus());
      }
    } finally { lock.current = false; }
  }
  function adopt(keep: boolean) {
    if (!session || !conflict?.ok || blocked) return;
    const etag = activityNoteEtag(conflict.data); setRecord(conflict.data); conflictRequest.current++; copyRequest.current++; setCopy(null);
    setSession(keep ? rebaseLocalEdit(session, conflict.data.text, etag) : createEditSession(conflict.data.text, etag)); setConflict(null); setError(null); setInvalid(false);
  }
  async function copyNote() {
    if (!session) return; const sequence = ++copyRequest.current;
    try { await navigator.clipboard.writeText(session.value); if (sequence === copyRequest.current) setCopy("copied"); }
    catch { if (sequence === copyRequest.current) setCopy("error"); }
  }
  if (!session) return <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.notes}</h2>{loading ? <p role="status">{t.loading}</p> : error && <LearningError locale={locale} error={error} retry={() => void reloadLookup()} />}</section>;
  return <section className="min-w-0 space-y-5 rounded-panel border border-border p-4 sm:p-6" aria-labelledby={`${id}-heading`} data-learning-note-state={session.phase}><h2 id={`${id}-heading`} className="text-2xl font-semibold">{t.notes}</h2>
    <p className="text-sm leading-relaxed text-muted-foreground">{t.notesHelp}</p><p className="text-sm">{t.originalLanguage} : {(record?.locale ?? contentLocale).toUpperCase()}</p>
    <p role="status" className="text-sm font-medium">{!record && session.change === 0 && session.phase === "modified" ? t.noSavedNote : session.phase === "saved" ? t.savedNote : session.phase === "saving" ? t.savingNote : session.phase === "error" || session.phase === "conflict" ? t.failedNote : t.modifiedNote}</p>
    {record && <p className="text-sm text-muted-foreground">{t.updated} {learningDate(record.updatedAt, locale)}</p>}
    <div ref={feedback} tabIndex={-1} className="space-y-3 rounded-input outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{error && <LearningError locale={locale} error={error} />}{unconfirmed && <StatusMessage tone="warning">{t.accountTransition}</StatusMessage>}</div>
    {session?.phase === "conflict" && <div className="space-y-4 rounded-input border border-danger bg-danger-soft p-4"><h3 className="text-lg font-semibold">{t.conflictTitle}</h3><p className="text-sm leading-relaxed">{t.conflictDescription}</p><Button variant="secondary" busy={conflictPending} loadingLabel={t.loading} disabled={blocked} onClick={() => void readConflict()}>{t.retry}</Button>
      <div className="grid gap-4 xl:grid-cols-2"><FormField id={`${id}-local`} label={t.localVersion}><TextArea readOnly rows={7} value={session.value} /></FormField>{conflict?.ok && <FormField id={`${id}-server`} label={t.serverVersion}><TextArea readOnly rows={7} lang={conflict.data.locale} value={conflict.data.text} /></FormField>}</div>
      {conflict && !conflict.ok && <LearningError locale={locale} error={conflict.error} />}{conflict?.ok && <div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.reload} description={t.reloadDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" disabled={blocked} className="max-w-full whitespace-normal">{t.reload}</Button>} onConfirm={() => adopt(false)} /><ConfirmationDialog title={t.keepLocal} description={t.keepLocalDescription} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" disabled={blocked} className="max-w-full whitespace-normal">{t.keepLocal}</Button>} onConfirm={() => adopt(true)} /></div>}
    </div>}
    <FormField id={`${id}-note`} label={t.notes} error={invalid ? t.noteTooLong : undefined}><TextArea ref={input} name="activityNote" rows={8} lang={record?.locale ?? contentLocale} value={session?.value ?? ""} disabled={blocked} placeholder={t.notePlaceholder} onChange={(event) => { copyRequest.current++; setCopy(null); setInvalid(false); setSession((current) => current ? changeEditSession(current, event.target.value) : current); }} /></FormField>
    <div className="flex flex-wrap gap-3"><Button busy={session?.phase === "saving"} loadingLabel={t.savingNote} disabled={blocked || !record && !canCreate || session?.phase === "saved" || session?.phase === "conflict"} onClick={() => void save()}>{t.saveNote}</Button><Button variant="secondary" onClick={() => void copyNote()}>{t.copyNote}</Button></div>
    {copy && <StatusMessage tone={copy === "copied" ? "success" : "danger"}>{copy === "copied" ? t.copied : t.copyFailed}</StatusMessage>}{copy === "error" && <div className="space-y-3"><FormField id={`${id}-manual-copy`} label={t.localVersion}><TextArea ref={manualCopy} readOnly rows={8} lang={record?.locale ?? contentLocale} value={session.value} /></FormField><Button variant="secondary" onClick={() => { manualCopy.current?.focus(); manualCopy.current?.select(); }}>{t.selectText}</Button></div>}
  </section>;
}
