"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, ConfirmationDialog, FormField, Input, Link, Select, StatusMessage, TextArea } from "@/components/ui";
import { getCurrentUser, type AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { createMethod, createMethodFromTemplate, deleteMethod, duplicateMethod, getMethod, getMethodSourceUpdate, updateMethod } from "@/lib/api/methods-client";
import type { MethodFields, MethodFromTemplate, MethodSourceUpdate, MethodView } from "@/lib/api/generated/types.gen";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave } from "@/lib/cms/edit-session";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import type { Locale } from "@/lib/i18n/locales";
import { emptyMethodFields, invalidMethodField, methodFields } from "@/lib/methods/editor-state";
import { methodsPath } from "@/lib/methods/routes";
import { authHref } from "@/lib/auth/routes";
import { subscribeAccountEvents } from "@/lib/auth/account-events";
import { MethodGenerator } from "./generator";
import { accountContextChanged, methodDate, MethodsError, personalMethodLanguages, sourceMethodHref } from "./parts";
import { MethodShell } from "./shell";
import { MarkdownExport } from "@/components/files/markdown-export";
import { methodMarkdown } from "@/lib/files/markdown-export";

export type PersonalMethodEditorProps = {
  locale: Locale; initial: AuthResult<MethodView> | null; sourceUpdate?: AuthResult<MethodSourceUpdate>;
  expectedAccountId: string; email?: string; draftId?: string; initialFields?: MethodFields;
  source?: Omit<MethodFromTemplate, "fields">; onCreated?: (saved: MethodView) => void;
};
export function PersonalMethodEditor(props: PersonalMethodEditorProps) {
  const t = getMethodsDictionary(props.locale);
  if (props.initial && !props.initial.ok) return <MethodShell locale={props.locale} title={t.editorTitle} description={t.editorIntro} languageLinks={personalMethodLanguages()}><MethodsError locale={props.locale} error={props.initial.error} returnTo={methodsPath(props.locale)} /></MethodShell>;
  if (props.initial?.ok && !props.initial.etag) return <MethodShell locale={props.locale} title={t.editorTitle} description={t.editorIntro} languageLinks={personalMethodLanguages()}><MethodsError locale={props.locale} error={{ kind: "invalid-response", status: 200 }} returnTo={methodsPath(props.locale)} /></MethodShell>;
  return <EditorReady key={`${props.expectedAccountId}:${props.initial?.ok ? props.initial.data.id : props.draftId ?? "new"}`} {...props} initial={props.initial?.ok ? props.initial : null} />;
}
function EditorReady({ locale, initial, initialFields, source, sourceUpdate: firstSourceUpdate, expectedAccountId, onCreated }: Omit<PersonalMethodEditorProps, "initial"> & { initial: Extract<AuthResult<MethodView>, { ok: true }> | null }) {
  const t = getMethodsDictionary(locale), id = useId(), router = useRouter();
  const [record, setRecord] = useState(initial?.data ?? null);
  const [session, setSession] = useState(() => initial ? createEditSession(methodFields(initial.data), initial.etag!) : { ...createEditSession(initialFields ?? emptyMethodFields(locale), ""), phase: "modified" as const });
  const [origin, setOrigin] = useState(source);
  const [error, setError] = useState<ApiError | null>(null); const [invalid, setInvalid] = useState<ReturnType<typeof invalidMethodField>>(null);
  const [conflict, setConflict] = useState<AuthResult<MethodView> | null>(null), [conflictPending, setConflictPending] = useState(false);
  const [sourceState, setSourceState] = useState(firstSourceUpdate), [sourcePending, setSourcePending] = useState(false);
  const [operation, setOperation] = useState<"duplicate" | "delete" | null>(null), [deleteOpen, setDeleteOpen] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "error" | null>(null);
  const [accountVerified, setAccountVerified] = useState(true), [accountMismatch, setAccountMismatch] = useState(false);
  const [transitionWaiting, setTransitionWaiting] = useState(false), [transitionUnconfirmed, setTransitionUnconfirmed] = useState(false);
  const lock = useRef(false), requestId = useRef(0), conflictId = useRef(0), sourceId = useRef(0), minimumRevision = useRef(initial?.data.revision ?? 0);
  const fieldsBox = useRef<HTMLDivElement>(null), feedback = useRef<HTMLDivElement>(null);
  const manualCopy = useRef<HTMLTextAreaElement>(null);
  const lifetime = useRef(0), accountRequest = useRef(0), privacyExit = useRef(false), copyId = useRef(0);
  const dirty = session.phase !== "saved", saving = session.activeRequest !== null, blocked = accountContextChanged(error) || accountMismatch || !accountVerified;
  const sourceConflict = !record && origin && error?.status === 412;
  useEffect(() => () => { lifetime.current++; conflictId.current++; sourceId.current++; accountRequest.current++; copyId.current++; }, []);
  const verifyAccount = useCallback(async () => {
    const sequence = ++accountRequest.current; setAccountVerified(false);
    const result = await getCurrentUser();
    if (sequence !== accountRequest.current) return;
    if (result.ok) {
      const matches = result.data.id === expectedAccountId;
      setAccountMismatch(!matches); setAccountVerified(matches);
      if (matches) setError((previous) => accountContextChanged(previous) ? null : previous);
    } else setError(result.error);
  }, [expectedAccountId]);
  useEffect(() => subscribeAccountEvents((kind) => {
    if (kind === "signed-in") {
      lifetime.current++; conflictId.current++; sourceId.current++; setConflictPending(false); setSourcePending(false);
      if (lock.current) { setTransitionWaiting(true); setTransitionUnconfirmed(true); }
      setSession((current) => current.activeRequest !== null ? { ...current, activeRequest: null, phase: "error" } : current); setOperation(null);
      void verifyAccount(); return;
    }
    privacyExit.current = true; lifetime.current++; accountRequest.current++;
    window.location.replace(authHref(locale, "sign-in", methodsPath(locale, record?.id ?? "new"), "required"));
  }), [locale, record?.id, verifyAccount]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { if (!privacyExit.current) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(t.unsavedLeave)) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, t.unsavedLeave]);
  function change(value: MethodFields) { copyId.current++; setCopyState(null); setSession((current) => changeEditSession(current, value)); }
  function showError(value: ApiError) { setError(value); requestAnimationFrame(() => feedback.current?.focus()); }
  async function readConflict(target = record) {
    if (!target) return;
    const sequence = ++conflictId.current; setConflictPending(true);
    const result = await getMethod(target.id);
    if (sequence !== conflictId.current) return;
    if (result.ok && result.data.revision < Math.max(minimumRevision.current, target.revision + 1)) setConflict({ ok: false, error: { kind: "invalid-response", status: 200 } });
    else { if (result.ok) minimumRevision.current = Math.max(minimumRevision.current, result.data.revision); setConflict(result); }
    setConflictPending(false);
  }
  async function refreshSource(target = record) {
    if (!target) return;
    const sequence = ++sourceId.current; setSourcePending(true);
    const result = await getMethodSourceUpdate(target.id);
    if (sequence === sourceId.current) { setSourceState(result); setSourcePending(false); }
  }
  async function save() {
    if (lock.current || transitionWaiting || blocked || session.phase === "conflict" || sourceConflict) return;
    const next = { ...session.value, category: session.value.category?.trim() ? session.value.category : null };
    const invalidField = invalidMethodField(next); setInvalid(invalidField);
    if (invalidField) { requestAnimationFrame(() => invalidField === "size" ? feedback.current?.focus() : fieldsBox.current?.querySelector<HTMLElement>(`[name="${invalidField === "parameters" ? "objective" : invalidField}"]`)?.focus()); return; }
    lock.current = true; setError(null); const pending = beginSave({ ...session, value: next }, ++requestId.current); const activeLifetime = lifetime.current; setSession(pending.state);
    try {
      const result = record ? await updateMethod(record.id, pending.attempt.etag, pending.attempt.value, expectedAccountId)
        : origin ? await createMethodFromTemplate(origin, pending.attempt.value, expectedAccountId) : await createMethod(pending.attempt.value, expectedAccountId);
      if (activeLifetime !== lifetime.current) return;
      if (result.ok && result.etag) {
        copyId.current++; setCopyState(null);
        conflictId.current++; minimumRevision.current = Math.max(minimumRevision.current, result.data.revision);
        setRecord(result.data); setSession((current) => confirmSave(current, pending.attempt, methodFields(result.data), result.etag!)); setConflict(null);
        if (!record) { window.history.replaceState(null, "", methodsPath(locale, result.data.id)); onCreated?.(result.data); }
        void refreshSource(result.data);
      } else if (!result.ok) {
        setSession((current) => rejectSave(current, pending.attempt, Boolean(record && result.error.status === 412))); showError(result.error);
        if (record && result.error.status === 412) await readConflict(record);
      }
    } finally { lock.current = false; setTransitionWaiting(false); }
  }
  function adoptServer(keep: boolean) {
    if (!conflict?.ok || !conflict.etag) return;
    conflictId.current++; copyId.current++; setCopyState(null); minimumRevision.current = Math.max(minimumRevision.current, conflict.data.revision); setRecord(conflict.data);
    setSession((current) => keep ? rebaseLocalEdit(current, methodFields(conflict.data), conflict.etag!) : createEditSession(methodFields(conflict.data), conflict.etag!)); setConflict(null); setError(null); setInvalid(null);
    void refreshSource(conflict.data);
  }
  async function copyAll() { const sequence = ++copyId.current; try { await navigator.clipboard.writeText(JSON.stringify(session.value, null, 2)); if (sequence === copyId.current) setCopyState("copied"); } catch { if (sequence === copyId.current) setCopyState("error"); } }
  async function duplicate() {
    if (!record || lock.current || transitionWaiting || dirty || blocked) return;
    lock.current = true; setOperation("duplicate"); setError(null); const activeLifetime = lifetime.current;
    try { const result = await duplicateMethod(record.id, session.etag, expectedAccountId); if (activeLifetime !== lifetime.current) return; if (result.ok) { router.push(methodsPath(locale, result.data.id)); router.refresh(); } else { showError(result.error); if (result.error.status === 412) { setSession((current) => ({ ...current, phase: "conflict" })); await readConflict(); } } }
    finally { lock.current = false; setOperation(null); setTransitionWaiting(false); }
  }
  async function remove() {
    if (!record || lock.current || transitionWaiting || blocked || session.phase === "conflict") return;
    lock.current = true; setOperation("delete"); setError(null); const activeLifetime = lifetime.current;
    try { const result = await deleteMethod(record.id, session.etag, expectedAccountId); if (activeLifetime !== lifetime.current) return; if (result.ok) { setDeleteOpen(false); privacyExit.current = true; router.push(methodsPath(locale)); router.refresh(); } else { showError(result.error); if (result.error.status === 412) { setSession((current) => ({ ...current, phase: "conflict" })); await readConflict(); } } }
    finally { lock.current = false; setOperation(null); setTransitionWaiting(false); }
  }
  const currentPath = methodsPath(locale, record?.id ?? "new");
  return <MethodShell locale={locale} title={record ? t.editorTitle : t.newTitle} description={t.editorIntro} languageLinks={personalMethodLanguages(record?.id ?? "new")}><div className="space-y-7" ref={fieldsBox}>
    <Link href={methodsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">← {t.back}</Link>
    {accountMismatch && <StatusMessage tone="warning">{t.accountChanged}<div className="mt-3"><Link href={methodsPath(locale)} prefetch={false}>{t.accountLibrary}</Link></div></StatusMessage>}
    {transitionUnconfirmed && <StatusMessage tone="warning">{t.accountTransitionUnconfirmed}</StatusMessage>}
    {!accountVerified && <Button variant="secondary" onClick={() => void verifyAccount()}>{t.retry}</Button>}
    <div className="rounded-panel border border-border bg-surface-subtle p-4"><p role="status" aria-live="polite" data-method-save-state={saving ? "saving" : session.phase} className="font-medium">{saving ? t.saving : session.phase === "saved" ? t.saved : session.phase === "conflict" ? t.conflictTitle : session.phase === "error" ? t.saveFailed : t.modified}</p>{record && <p className="mt-2 text-sm text-muted-foreground">{t.updated} {methodDate(record.updatedAt, locale)}</p>}</div>
    {(error || invalid) && <div ref={feedback} tabIndex={-1} className="rounded-input focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{error && <MethodsError locale={locale} error={error} returnTo={currentPath} />}{invalid && <StatusMessage tone="danger">{invalid === "size" ? t.tooLarge : t.fieldsInvalid}</StatusMessage>}</div>}
    {sourceConflict && <section className="space-y-4"><StatusMessage tone="warning">{t.sourceConflict}</StatusMessage><ConfirmationDialog title={t.detachTitle} description={t.detachHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.detach}</Button>} onConfirm={() => { setOrigin(undefined); setError(null); }} /></section>}
    {session.phase === "conflict" && <section className="space-y-4 rounded-panel border border-danger bg-danger-soft p-4 sm:p-6"><h2 className="text-xl font-semibold">{t.conflictTitle}</h2><p className="text-sm leading-relaxed">{t.conflictHelp}</p><Button variant="secondary" className="max-w-full whitespace-normal" busy={conflictPending} loadingLabel={t.loading} onClick={() => void readConflict()}>{t.retry}</Button>
      <div className="grid gap-4 lg:grid-cols-2"><FormField id={`${id}-local`} label={t.local}><TextArea readOnly rows={12} value={JSON.stringify(session.value, null, 2)} /></FormField>{conflict?.ok && <FormField id={`${id}-server`} label={t.server}><TextArea readOnly rows={12} value={JSON.stringify(methodFields(conflict.data), null, 2)} /></FormField>}</div>
      {conflict && !conflict.ok && <MethodsError locale={locale} error={conflict.error} returnTo={currentPath} />}
      {conflict?.ok && <div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.reload} description={t.reloadHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.reload}</Button>} onConfirm={() => adoptServer(false)} /><ConfirmationDialog title={t.keepLocal} description={t.keepLocalHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.keepLocal}</Button>} onConfirm={() => adoptServer(true)} /></div>}
    </section>}
    <fieldset disabled={blocked || operation !== null} className="min-w-0 space-y-6"><FormField id={`${id}-title`} label={t.title} required error={invalid === "title" ? !session.value.title.trim() ? t.titleRequired : t.invalidText : undefined}><Input name="title" maxLength={240} value={session.value.title} onChange={(event) => change({ ...session.value, title: event.target.value })} /></FormField>
      <div className="grid gap-5 sm:grid-cols-2"><FormField id={`${id}-language`} label={t.textLocale} hint={t.savedLanguage}><Select name="locale" value={session.value.locale} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} onChange={(event) => change({ ...session.value, locale: event.target.value as Locale })} /></FormField><FormField id={`${id}-category`} label={t.category} hint={t.categoryHint} error={invalid === "category" ? t.invalidText : undefined}><Input name="category" maxLength={80} value={session.value.category ?? ""} onChange={(event) => change({ ...session.value, category: event.target.value || null })} /></FormField></div>
      <MethodGenerator locale={locale} textLocale={session.value.locale} value={session.value} disabled={blocked || operation !== null} outputError={invalid === "text" ? !session.value.text.trim() ? t.textRequired : t.invalidText : undefined} onChange={(value) => change({ ...session.value, ...value })} />
      <FormField id={`${id}-notes`} label={t.notes} hint={t.notesHint} error={invalid === "notes" ? t.invalidText : undefined}><TextArea name="notes" maxLength={8000} rows={5} value={session.value.notes} onChange={(event) => change({ ...session.value, notes: event.target.value })} /></FormField>
    </fieldset>
    <div className="flex flex-wrap gap-3"><Button busy={saving} loadingLabel={t.saving} disabled={blocked || transitionWaiting || operation !== null || session.phase === "saved" || session.phase === "conflict" || Boolean(sourceConflict)} onClick={() => void save()}>{t.save}</Button><Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void copyAll()}>{t.copyLocal}</Button></div>{copyState && <StatusMessage tone={copyState === "copied" ? "success" : "danger"}>{copyState === "copied" ? t.localCopied : t.localCopyFailed}</StatusMessage>}{copyState === "error" && <div className="space-y-3"><FormField id={`${id}-manual-copy`} label={t.local}><TextArea ref={manualCopy} readOnly rows={10} value={JSON.stringify(session.value, null, 2)} /></FormField><Button variant="secondary" onClick={() => { manualCopy.current?.focus(); manualCopy.current?.select(); }}>{t.selectText}</Button></div>}
    <MarkdownExport locale={locale} textLocale={session.value.locale} kind="method" text={methodMarkdown(session.value)} disabled={blocked} />
    {record && <section className="space-y-4 rounded-panel border border-border p-4 sm:p-6"><h2 className="text-xl font-semibold">{t.sourceTitle}</h2>{record.origin ? <><p className="text-sm leading-relaxed text-muted-foreground">{t.sourceSnapshot}</p><div className="flex flex-wrap gap-2"><Badge>{record.origin.locale.toUpperCase()}</Badge><Badge>{t.hasSource}</Badge></div><p className="break-words font-medium">{record.origin.title}</p><details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">{t.sourceVersion}</summary><dl className="space-y-3"><div><dt className="font-medium">{t.sourceVersion}</dt><dd className="mt-1 break-all">{record.origin.versionId}</dd></div><div><dt className="font-medium">{t.sourceRevision}</dt><dd className="mt-1 break-all">{record.origin.revisionId}</dd></div></dl></details></> : <p className="text-sm text-muted-foreground">{t.sourceNone}</p>}
      {sourceState && !sourceState.ok && <MethodsError locale={locale} error={sourceState.error} returnTo={currentPath} />}{sourceState?.ok && <StatusMessage tone={sourceState.data.status === "UPDATE_AVAILABLE" || sourceState.data.status === "UNAVAILABLE" ? "warning" : "info"}>{sourceState.data.status === "CURRENT" ? t.sourceCurrent : sourceState.data.status === "UPDATE_AVAILABLE" ? t.sourceUpdated : sourceState.data.status === "UNAVAILABLE" ? t.sourceUnavailable : t.sourceNone}</StatusMessage>}
      <div className="flex flex-wrap items-center gap-3">{sourceState?.ok && sourceState.data.candidate && <Link href={sourceMethodHref(sourceState.data.candidate)} prefetch={false} className="inline-flex min-h-11 items-center">{sourceState.data.status === "UPDATE_AVAILABLE" ? t.sourceNewCopy : t.sourceOpen}</Link>}
      <Button variant="secondary" busy={sourcePending} loadingLabel={t.loading} onClick={() => void refreshSource()}>{t.sourceRefresh}</Button></div>
    </section>}
    {record && <section className="space-y-3 border-t border-border pt-5"><p className="text-sm text-muted-foreground">{t.duplicateHelp}</p><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={dirty || blocked || transitionWaiting || saving || operation !== null} busy={operation === "duplicate"} loadingLabel={t.duplicating} onClick={() => void duplicate()}>{t.duplicate}</Button><ConfirmationDialog open={deleteOpen} onOpenChange={(next) => { if (operation !== "delete") setDeleteOpen(next); }} title={t.deleteTitle} description={t.deleteHelp} confirmLabel={t.confirmDelete} cancelLabel={t.cancel} busy={operation === "delete"} trigger={<Button variant="destructive" disabled={blocked || transitionWaiting || saving || operation !== null || session.phase === "conflict"} className="max-w-full whitespace-normal">{t.delete}</Button>} onConfirm={(event) => { event.preventDefault(); void remove(); }}>{error && <MethodsError locale={locale} error={error} returnTo={currentPath} />}</ConfirmationDialog></div></section>}
  </div></MethodShell>;
}
