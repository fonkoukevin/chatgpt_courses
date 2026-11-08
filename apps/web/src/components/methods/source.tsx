"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge, Button, ConfirmationDialog, FormField, Input, Link, StatusMessage, TextArea } from "@/components/ui";
import { AvailabilityNotice, BackToCatalogue, DetailHeading, PublicApiError, PublicShell, TranslationAvailability, type DetailProps } from "@/components/public/parts";
import { PublicDocumentBody, ResourceTools } from "@/components/public/document";
import { getCurrentUser, type AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { isUuid } from "@/lib/api/cms-validation";
import { createMethodFromTemplate, getMethod, updateMethod } from "@/lib/api/methods-client";
import type { MethodDefinition, MethodFields, MethodView, ResourceDetail } from "@/lib/api/generated/types.gen";
import { subscribeAccountEvents } from "@/lib/auth/account-events";
import { keepAnonymousMethodDraft, type MethodSource } from "@/lib/auth/method-draft";
import { authHref } from "@/lib/auth/routes";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave, type EditSession } from "@/lib/cms/edit-session";
import { getMethodPageDictionary } from "@/lib/i18n/method-pages";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import { getMethodSourceDictionary } from "@/lib/i18n/methods-source";
import { getPublicDictionary } from "@/lib/i18n/public";
import type { Locale } from "@/lib/i18n/locales";
import { invalidMethodField, methodFields } from "@/lib/methods/editor-state";
import { methodsNewHref, methodsPath } from "@/lib/methods/routes";
import { isCompleteMethodDefinition } from "@/lib/methods/validation";
import { MethodGenerator } from "./generator";
import { accountContextChanged, MethodsError } from "./parts";

export function PublicMethodSource({ locale, result, languageLinks, returnTo }: DetailProps) {
  const page = getMethodPageDictionary(locale);
  const resource = result.ok ? result.data : null;
  const definition = resource?.document?.methodDefinition;
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} />
    {!result.ok ? <PublicApiError locale={locale} result={result} standalone /> : resource && resource.availability !== "PUBLISHED" ? <><AvailabilityNotice locale={locale} resource={resource} /><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} /></> : resource && <>
      <DetailHeading locale={locale} resource={resource} /><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} />
      <div className="max-w-3xl space-y-8">{resource.document && <><section className="space-y-3"><h2 className="text-2xl font-semibold">{getMethodsDictionary(locale).fields.objective}</h2><p className="whitespace-pre-wrap leading-relaxed">{resource.document.objective}</p>{resource.document.prerequisites.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm">{resource.document.prerequisites.map((line, index) => <li key={index}>{line}</li>)}</ul>}</section><PublicDocumentBody locale={locale} document={resource.document} prefix="method" /></>}</div>
      {resource.access === "FREE" && resource.document && isUuid(resource.revisionId) && isCompleteMethodDefinition(definition) ? <SourceWorkbench key={`${resource.resourceId}:${resource.versionId}:${resource.locale}`} locale={locale} resource={resource} definition={definition} revisionId={resource.revisionId} /> : <StatusMessage tone="warning">{resource.access === "PROTECTED" ? getPublicDictionary(locale).protectedBody : page.templateMissing}</StatusMessage>}
      <ResourceTools locale={locale} resource={resource} />
    </>}
  </div></PublicShell>;
}

type Account = { kind: "loading" } | { kind: "anonymous" } | { kind: "account"; id: string; email: string } | { kind: "blocked" } | { kind: "error"; error: ApiError };
function SourceWorkbench({ locale, resource, definition, revisionId }: { locale: Locale; resource: ResourceDetail; definition: MethodDefinition; revisionId: string }) {
  const page = getMethodPageDictionary(locale), t = getMethodsDictionary(locale), s = getMethodSourceDictionary(locale), id = useId();
  const [capturedDefinition] = useState(() => structuredClone(definition));
  const [source] = useState<MethodSource>(() => ({ sourceResourceId: resource.resourceId, sourceVersionId: resource.versionId, sourceRevisionId: revisionId, sourceLocale: resource.locale }));
  const [session, setSession] = useState<EditSession<MethodFields>>(() => ({ ...createEditSession<MethodFields>({ title: resource.title ?? "", locale: resource.locale, text: "", parameters: structuredClone(definition.defaults), generatedFrom: null, notes: "", category: null }, ""), phase: "modified" }));
  const [record, setRecord] = useState<MethodView | null>(null), [account, setAccount] = useState<Account>({ kind: "loading" });
  const [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState<ReturnType<typeof invalidMethodField>>(null), [storageFailed, setStorageFailed] = useState(false);
  const [conflict, setConflict] = useState<AuthResult<MethodView> | null>(null), [conflictPending, setConflictPending] = useState(false);
  const [copyState, setCopyState] = useState<"copied" | "error" | null>(null);
  const [transitionWaiting, setTransitionWaiting] = useState(false), [transitionUnconfirmed, setTransitionUnconfirmed] = useState(false);
  const lifetime = useRef(0), authRequest = useRef(0), boundAccount = useRef<string | null | undefined>(undefined), privacyExit = useRef(false), lock = useRef(false), saveId = useRef(0), conflictId = useRef(0);
  const fieldsBox = useRef<HTMLDivElement>(null), feedback = useRef<HTMLDivElement>(null);
  const copyId = useRef(0), manualCopy = useRef<HTMLTextAreaElement>(null), minimumRevision = useRef(0);
  const saving = session.activeRequest !== null, dirty = session.phase !== "saved" && (session.change > 0 || Boolean(session.value.text.trim()));
  const sourceChanged = !record && (resource.revisionId !== source.sourceRevisionId || error?.status === 412);
  const blocked = account.kind === "blocked" || accountContextChanged(error);
  const acceptAccount = useCallback((result: Awaited<ReturnType<typeof getCurrentUser>>, sequence: number) => {
    if (sequence !== authRequest.current) return;
    if (result.ok) {
      if (boundAccount.current === undefined) boundAccount.current = result.data.id;
      if (boundAccount.current !== result.data.id) { setAccount({ kind: "blocked" }); return; }
      setAccount({ kind: "account", id: result.data.id, email: result.data.email });
      setError((previous) => accountContextChanged(previous) ? null : previous);
    } else if (result.error.kind === "http" && result.error.status === 401 && boundAccount.current !== undefined && boundAccount.current !== null) setAccount({ kind: "error", error: result.error });
    else if (result.error.kind === "http" && result.error.status === 401) { boundAccount.current = null; setAccount({ kind: "anonymous" }); }
    else setAccount({ kind: "error", error: result.error });
  }, []);
  const checkAccount = useCallback(async () => { const sequence = ++authRequest.current; acceptAccount(await getCurrentUser(), sequence); }, [acceptAccount]);
  useEffect(() => { const sequence = ++authRequest.current; void getCurrentUser().then((result) => acceptAccount(result, sequence)); }, [acceptAccount]);
  useEffect(() => () => { lifetime.current++; authRequest.current++; conflictId.current++; copyId.current++; }, []);
  useEffect(() => subscribeAccountEvents((kind) => {
    if (kind === "signed-in") {
      lifetime.current++; conflictId.current++; setConflictPending(false);
      if (lock.current) { setTransitionWaiting(true); setTransitionUnconfirmed(true); }
      setSession((current) => current.activeRequest !== null ? { ...current, activeRequest: null, phase: "error" } : current);
      setAccount({ kind: "loading" }); void checkAccount();
    }
    else { privacyExit.current = true; lifetime.current++; authRequest.current++; window.location.reload(); }
  }), [checkAccount]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { if (!privacyExit.current) event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, location.href);
      if (destination.pathname === location.pathname && destination.search === location.search) return;
      if (!window.confirm(t.unsavedLeave)) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, t.unsavedLeave]);
  function change(value: MethodFields) { copyId.current++; setCopyState(null); setStorageFailed(false); setSession((current) => changeEditSession(current, value)); }
  function validate(): boolean {
    const field = invalidMethodField(session.value); setInvalid(field);
    if (field) requestAnimationFrame(() => field === "size" ? feedback.current?.focus() : fieldsBox.current?.querySelector<HTMLElement>(`[name="${field === "parameters" ? "objective" : field}"]`)?.focus());
    return field === null;
  }
  async function readConflict() {
    if (!record) return;
    const sequence = ++conflictId.current; setConflictPending(true); const result = await getMethod(record.id);
    if (sequence !== conflictId.current) return;
    if (result.ok && result.data.revision < Math.max(minimumRevision.current, record.revision + 1)) setConflict({ ok: false, error: { kind: "invalid-response", status: 200 } });
    else { if (result.ok) minimumRevision.current = Math.max(minimumRevision.current, result.data.revision); setConflict(result); } setConflictPending(false);
  }
  async function save() {
    if (lock.current || transitionWaiting || blocked || account.kind !== "account" || sourceChanged || session.phase === "conflict" || !validate()) return;
    lock.current = true; setError(null); const pending = beginSave(session, ++saveId.current), active = lifetime.current; setSession(pending.state);
    try {
      const result = record ? await updateMethod(record.id, pending.attempt.etag, pending.attempt.value, account.id) : await createMethodFromTemplate(source, pending.attempt.value, account.id);
      if (active !== lifetime.current) return;
      if (result.ok && result.etag) { minimumRevision.current = Math.max(minimumRevision.current, result.data.revision); copyId.current++; setCopyState(null); setRecord(result.data); setSession((current) => confirmSave(current, pending.attempt, methodFields(result.data), result.etag!)); setConflict(null); }
      else if (!result.ok) { setError(result.error); setSession((current) => rejectSave(current, pending.attempt, Boolean(record && result.error.status === 412))); if (accountContextChanged(result.error)) setAccount({ kind: "blocked" }); if (record && result.error.status === 412) await readConflict(); requestAnimationFrame(() => feedback.current?.focus()); }
    } finally { lock.current = false; setTransitionWaiting(false); }
  }
  function keepAndSignIn() {
    if (account.kind !== "anonymous" || boundAccount.current !== null || !validate()) return;
    const draft = keepAnonymousMethodDraft(session.value, source);
    if (!draft) { setStorageFailed(true); return; }
    privacyExit.current = true; window.location.assign(authHref(locale, "sign-in", methodsNewHref(locale, draft)));
  }
  function adoptConflict(keep: boolean) {
    if (!conflict?.ok || !conflict.etag) return;
    conflictId.current++; copyId.current++; setCopyState(null); minimumRevision.current = Math.max(minimumRevision.current, conflict.data.revision); setRecord(conflict.data); setSession((current) => keep ? rebaseLocalEdit(current, methodFields(conflict.data), conflict.etag!) : createEditSession(methodFields(conflict.data), conflict.etag!)); setConflict(null); setError(null);
  }
  async function copyAll() { const sequence = ++copyId.current; try { await navigator.clipboard.writeText(JSON.stringify({ fields: session.value, source }, null, 2)); if (sequence === copyId.current) setCopyState("copied"); } catch { if (sequence === copyId.current) setCopyState("error"); } }
  return <div className="space-y-8" ref={fieldsBox}>
    <div className="grid gap-6 lg:grid-cols-2">{[{ title: page.useCases, values: capturedDefinition.useCases }, { title: page.requiredInputs, values: capturedDefinition.requiredInputs }, { title: page.steps, values: capturedDefinition.steps }, { title: page.checks, values: capturedDefinition.checks }, { title: page.limitations, values: capturedDefinition.limitations }].map((section) => <section key={section.title} className="space-y-3 rounded-panel border border-border p-5"><h2 className="text-xl font-semibold">{section.title}</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">{section.values.map((line, index) => <li key={index}>{line}</li>)}</ol></section>)}</div>
    <section className="max-w-3xl space-y-3"><h2 className="text-2xl font-semibold">{page.instruction}</h2><p className="whitespace-pre-wrap leading-relaxed">{capturedDefinition.starterInstruction}</p></section><section className="max-w-3xl space-y-3 rounded-panel border border-border bg-surface-subtle p-5"><h2 className="text-2xl font-semibold">{page.example}</h2><p className="whitespace-pre-wrap leading-relaxed">{capturedDefinition.example}</p></section>
    <section className="space-y-6 border-t border-border pt-8"><h2 className="text-2xl font-semibold">{s.personalise}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{s.sourceSnapshot}</p>
      {account.kind === "loading" && <p role="status" className="text-sm">{s.accountLoading}</p>}{account.kind === "account" && <p className="text-sm">{page.connectedAs} : <span className="font-medium">{account.email}</span></p>}{account.kind === "anonymous" && <StatusMessage>{page.temporary}</StatusMessage>}{account.kind === "blocked" && <StatusMessage tone="warning">{page.accountChanged}</StatusMessage>}{account.kind === "error" && <MethodsError locale={locale} error={account.error} returnTo={methodsPath(locale)} retry={() => void checkAccount()} />}
      {transitionUnconfirmed && <StatusMessage tone="warning">{t.accountTransitionUnconfirmed}</StatusMessage>}
      {sourceChanged && <StatusMessage tone="warning">{s.sourceChanged}<div className="mt-3"><ConfirmationDialog title={s.reloadTitle} description={s.reloadHelp} confirmLabel={s.reloadSource} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{s.reloadSource}</Button>} onConfirm={() => { privacyExit.current = true; window.location.reload(); }} /></div></StatusMessage>}
      {(error || invalid || storageFailed) && <div ref={feedback} tabIndex={-1}>{error && <MethodsError locale={locale} error={error} returnTo={methodsPath(locale)} />}{invalid && <StatusMessage tone="danger">{invalid === "size" ? t.tooLarge : s.saveValidation}</StatusMessage>}{storageFailed && <StatusMessage tone="danger">{page.storageFailed}</StatusMessage>}</div>}
      {session.phase === "conflict" && <section className="space-y-4 rounded-panel border border-danger bg-danger-soft p-4 sm:p-6"><h3 className="text-xl font-semibold">{t.conflictTitle}</h3><p className="text-sm">{t.conflictHelp}</p><Button variant="secondary" busy={conflictPending} loadingLabel={t.loading} onClick={() => void readConflict()}>{t.retry}</Button><div className="grid gap-4 lg:grid-cols-2"><FormField id={`${id}-local`} label={t.local}><TextArea readOnly rows={10} value={JSON.stringify(session.value, null, 2)} /></FormField>{conflict?.ok && <FormField id={`${id}-server`} label={t.server}><TextArea readOnly rows={10} value={JSON.stringify(methodFields(conflict.data), null, 2)} /></FormField>}</div>{conflict && !conflict.ok && <MethodsError locale={locale} error={conflict.error} returnTo={methodsPath(locale)} />}{conflict?.ok && <div className="flex flex-wrap gap-3"><ConfirmationDialog title={t.reload} description={t.reloadHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.reload}</Button>} onConfirm={() => adoptConflict(false)} /><ConfirmationDialog title={t.keepLocal} description={t.keepLocalHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.keepLocal}</Button>} onConfirm={() => adoptConflict(true)} /></div>}</section>}
      <fieldset disabled={blocked} className="min-w-0 space-y-5"><FormField id={`${id}-title`} label={page.title} required error={invalid === "title" ? t.titleRequired : undefined}><Input name="title" maxLength={240} value={session.value.title} onChange={(event) => change({ ...session.value, title: event.target.value })} /></FormField><MethodGenerator locale={locale} textLocale={session.value.locale} value={session.value} sourceInstruction={capturedDefinition.starterInstruction} disabled={blocked} outputError={invalid === "text" ? !session.value.text.trim() ? t.textRequired : t.invalidText : undefined} onChange={(value) => change({ ...session.value, ...value })} /><FormField id={`${id}-notes`} label={t.notes} hint={t.notesHint}><TextArea name="notes" maxLength={8000} rows={4} value={session.value.notes} onChange={(event) => change({ ...session.value, notes: event.target.value })} /></FormField></fieldset>
      <div className="flex flex-wrap gap-3">{account.kind === "anonymous" ? <Button disabled={Boolean(sourceChanged) || transitionWaiting} onClick={keepAndSignIn} className="max-w-full whitespace-normal">{page.keepAndSignIn}</Button> : <Button busy={saving} loadingLabel={page.saving} disabled={account.kind !== "account" || transitionWaiting || blocked || Boolean(sourceChanged) || session.phase === "saved" || session.phase === "conflict"} onClick={() => void save()} className="max-w-full whitespace-normal">{page.save}</Button>}{record && <Link href={methodsPath(locale, record.id)} prefetch={false} className="inline-flex min-h-11 items-center">{s.savedLink}</Link>}</div>
      <Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void copyAll()}>{t.copyLocal}</Button>{copyState && <StatusMessage tone={copyState === "copied" ? "success" : "danger"}>{copyState === "copied" ? t.localCopied : t.localCopyFailed}</StatusMessage>}{copyState === "error" && <div className="space-y-3"><FormField id={`${id}-manual-copy`} label={t.local}><TextArea ref={manualCopy} readOnly rows={10} value={JSON.stringify({ fields: session.value, source }, null, 2)} /></FormField><Button variant="secondary" onClick={() => { manualCopy.current?.focus(); manualCopy.current?.select(); }}>{t.selectText}</Button></div>}
      <div role="status" aria-live="polite" className="text-sm" data-method-save-state={saving ? "saving" : session.phase}>{saving ? page.saving : session.phase === "saved" ? <Badge tone="success">{page.saved}</Badge> : session.phase === "error" ? t.saveFailed : s.local}</div>
    </section>
  </div>;
}
