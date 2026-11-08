"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AdminLayout } from "@/components/layouts";
import { Badge, Button, ConfirmationDialog, FormField, Input, Link, Pagination, StatusMessage, TextArea } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { getContent, getContentDependencies, getContentReadiness, listContentRevisions, saveContentRevision } from "@/lib/api/cms-client";
import type { ContentView, Dependencies, Readiness, RevisionPage, RevisionView } from "@/lib/api/generated/types.gen";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave, type EditSession } from "@/lib/cms/edit-session";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { ContentAction, type ContentActionMode, type LocalContent } from "./content-action";
import { DocumentEditor, emptyDocument, moveItem, normalizeDocument } from "./document-editor";
import { cmsNavigation, CmsError, formatCmsInstant } from "./parts";
import { DocumentPreview } from "./preview";
import { ReadinessPanel } from "./readiness";
import { ChildVersionPicker } from "./child-version-picker";
import { MetadataEditor } from "./metadata-editor";

type Props = { locale: Locale; initial: AuthResult<ContentView>; initialReadiness: AuthResult<Readiness>; initialDependencies: AuthResult<Dependencies>; permissions: string[] };
const editable = (content: ContentView): LocalContent => ({ title: content.title, summary: content.summary, document: content.document ?? emptyDocument(), reason: "" });
const editSession = (content: ContentView, etag: string) => ({ ...createEditSession(editable(content), etag), phase: content.document ? "saved" as const : "modified" as const });

export function ContentEditor(props: Props) {
  const text = getCmsDictionary(props.locale);
  if (!props.initial.ok) return <AdminLayout locale={props.locale} title={text.edit} description={text.versionHelp} product={cmsNavigation(props.locale)}><CmsError error={props.initial.error} locale={props.locale} returnTo={cmsPath(props.locale)} /></AdminLayout>;
  if (!props.initial.etag) return <AdminLayout locale={props.locale} title={text.edit} description={text.versionHelp} product={cmsNavigation(props.locale)}><CmsError error={{ kind: "invalid-response", status: 200 }} locale={props.locale} returnTo={cmsPath(props.locale)} /></AdminLayout>;
  return <EditorReady key={props.initial.data.id} {...props} initial={props.initial.data} initialEtag={props.initial.etag} />;
}

function EditorReady({ locale, initial, initialEtag, initialReadiness, initialDependencies, permissions }: Omit<Props, "initial"> & { initial: ContentView; initialEtag: string }) {
  const text = getCmsDictionary(locale); const router = useRouter();
  const [content, setContent] = useState(initial);
  const [session, setSession] = useState<EditSession<LocalContent>>(() => editSession(initial, initialEtag));
  const [childrenDraft, setChildrenDraft] = useState(initial.childVersionIds);
  const [childLabels, setChildLabels] = useState<Record<string, string>>(() => initialDependencies.ok ? Object.fromEntries(initialDependencies.data.items.map((item) => [item.versionId, item.title])) : {});
  const [readiness, setReadiness] = useState(initialReadiness); const [dependencies, setDependencies] = useState(initialDependencies);
  const [readinessEtag, setReadinessEtag] = useState(initialEtag);
  const [checking, setChecking] = useState(false); const [error, setError] = useState<ApiError | null>(null);
  const [conflict, setConflict] = useState<AuthResult<ContentView> | null>(null); const [copyState, setCopyState] = useState<"copied" | "error" | null>(null);
  const [history, setHistory] = useState<AuthResult<RevisionPage> | null>(null); const [historyPending, setHistoryPending] = useState(false);
  const [reasonMissing, setReasonMissing] = useState(false); const [resetKey, setResetKey] = useState(0);
  const [legacyBody, setLegacyBody] = useState(initial.legacyBody); const [legacyPending, setLegacyPending] = useState(initial.document === null);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const lock = useRef(false); const requestId = useRef(0); const checkId = useRef(0); const historyId = useRef(0); const conflictId = useRef(0); const minimumRevision = useRef(initial.revision); const errorBox = useRef<HTMLDivElement>(null);
  const canWrite = permissions.includes("content.write"); const saving = session.activeRequest !== null;
  const compositionDirty = JSON.stringify(childrenDraft) !== JSON.stringify(content.childVersionIds);
  const bodyDirty = session.phase !== "saved" || compositionDirty;
  const dirty = bodyDirty || metadataDirty;
  const rememberChildLabels = useCallback((labels: Record<string, string>) => {
    setChildLabels((previous) => Object.entries(labels).some(([id, label]) => previous[id] !== label) ? { ...previous, ...labels } : previous);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, location.href);
      if (target.pathname === location.pathname && target.search === location.search) return;
      if (!window.confirm(text.unsavedLeave)) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, text.unsavedLeave]);

  function update<K extends keyof LocalContent>(key: K, value: LocalContent[K]) { setSession((state) => changeEditSession(state, { ...state.value, [key]: value })); }
  async function loadConflict() {
    const sequence = ++conflictId.current;
    const minimum = Math.max(minimumRevision.current, content.revision + 1);
    const result = await getContent(content.id);
    if (sequence !== conflictId.current) return;
    if (result.ok && result.data.revision < minimum) {
      setConflict((current) => current ?? { ok: false, error: { kind: "invalid-response", status: 200 } });
      return;
    }
    if (result.ok) minimumRevision.current = Math.max(minimumRevision.current, result.data.revision);
    setConflict(result);
  }
  function showError(value: ApiError) { setError(value); requestAnimationFrame(() => errorBox.current?.focus()); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || metadataDirty || !canWrite || session.phase === "conflict") return;
    if (!session.value.reason.trim()) { setReasonMissing(true); document.getElementById("cms-reason")?.focus(); return; }
    setReasonMissing(false); setError(null); lock.current = true;
    const pending = beginSave(session, ++requestId.current); setSession(pending.state);
    try {
      const result = await saveContentRevision(content.id, pending.attempt.etag, { ...pending.attempt.value, document: normalizeDocument(pending.attempt.value.document) });
      if (result.ok && result.etag) {
        conflictId.current++; checkId.current++; historyId.current++; setHistory(null); setChecking(false); minimumRevision.current = Math.max(minimumRevision.current, result.data.revision);
        setContent(result.data); setLegacyPending(false); setLegacyBody(result.data.legacyBody);
        setSession((state) => confirmSave(state, pending.attempt, editable(result.data), result.etag!));
      } else if (!result.ok) {
        setSession((state) => rejectSave(state, pending.attempt, result.error.status === 412)); showError(result.error);
        if (result.error.status === 412) await loadConflict();
      }
    } finally { lock.current = false; }
  }
  async function check(target = content, etag = session.etag) {
    const sequence = ++checkId.current; setChecking(true);
    const [result, related] = await Promise.all([getContentReadiness(target.id), getContentDependencies(target.id)]);
    if (sequence === checkId.current) { setReadiness(result); setDependencies(related); setReadinessEtag(etag); setChecking(false); }
  }
  async function loadHistory(page = 0) {
    const sequence = ++historyId.current; setHistoryPending(true);
    const result = await listContentRevisions(content.id, page);
    if (sequence === historyId.current) { setHistory(result); setHistoryPending(false); }
  }
  function applyOperation(value: ContentView, etag: string, mode: ContentActionMode | "metadata") {
    conflictId.current++; checkId.current++; historyId.current++; setHistory(null); minimumRevision.current = Math.max(minimumRevision.current, value.revision);
    if (["duplicate", "version", "translate"].includes(mode)) {
      // A new version explicitly includes the current local document. The modal
      // prevents further editing until its result has been confirmed.
      router.push(cmsPath(locale, value.id)); router.refresh(); return;
    }
    setContent(value); setSession(editSession(value, etag)); setChildrenDraft(value.childVersionIds);
    setConflict(null); setError(null); setLegacyPending(value.document === null); setLegacyBody(value.legacyBody); setResetKey((key) => key + 1);
    void check(value, etag);
  }
  function loadServerVersion() {
    if (!conflict?.ok || !conflict.etag) return;
    const next = conflict.data;
    conflictId.current++; historyId.current++; setHistory(null); minimumRevision.current = Math.max(minimumRevision.current, next.revision);
    setContent(next); setSession(editSession(next, conflict.etag)); setChildrenDraft(next.childVersionIds);
    setConflict(null); setError(null); setResetKey((key) => key + 1); setLegacyPending(next.document === null); setLegacyBody(next.legacyBody);
    void check(next, conflict.etag);
  }
  function keepLocal() {
    if (!conflict?.ok || !conflict.etag) return;
    conflictId.current++; checkId.current++; setChecking(false); minimumRevision.current = Math.max(minimumRevision.current, conflict.data.revision);
    setContent(conflict.data); setSession((state) => rebaseLocalEdit(state, editable(conflict.data), conflict.etag!));
    setConflict(null); setError(null);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify({ ...session.value, childVersionIds: childrenDraft, ...(legacyPending && legacyBody ? { legacyBody } : {}) }, null, 2)); setCopyState("copied"); } catch { setCopyState("error"); }
  }
  function restore(revision: RevisionView) {
    if (dirty && !window.confirm(text.unsavedLeave)) return;
    setSession((state) => changeEditSession(state, { title: revision.title, summary: revision.summary, document: revision.document ?? emptyDocument(), reason: "" }));
    setLegacyPending(revision.document === null); setLegacyBody(revision.legacyBody); setResetKey((key) => key + 1);
    document.getElementById("cms-title")?.focus();
  }
  const action = (mode: ContentActionMode, extraDisabled = false) => <ContentAction key={mode} locale={locale} mode={mode} content={content} etag={session.etag} draft={session.value} childrenDraft={childrenDraft}
    disabled={saving || metadataDirty || extraDisabled || (mode !== "version" && mode !== "composition" && dirty) || (mode === "composition" && session.phase !== "saved")}
    onResult={applyOperation} onConflict={() => { setSession((state) => ({ ...state, phase: "conflict" })); void loadConflict(); }} />;

  return <AdminLayout locale={locale} title={text.edit} description={text.versionHelp} product={cmsNavigation(locale, content.id)}>
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3"><Badge tone={content.state === "PUBLISHED" ? "success" : content.state === "STALE" ? "warning" : "neutral"}>{text.state[content.state]}</Badge><Badge>{text.kind[content.kind]}</Badge><Badge>{content.locale.toUpperCase()}</Badge><span className="text-sm text-muted-foreground">{text.version} {content.versionNumber}</span></div>
      <div className="flex flex-wrap gap-4"><Link href={cmsPath(locale)} prefetch={false}>{text.back}</Link><Link href={cmsPath(locale, content.id, "preview")} prefetch={false} target="_blank" rel="noreferrer">{text.preview}</Link></div>
      <p className="text-sm text-muted-foreground">{text.lastReview}: {formatCmsInstant(content.verifiedAt, locale)}</p>
      <div className="rounded-panel border border-border bg-surface-subtle p-4"><p role="status" aria-live="polite" data-cms-save-state={saving ? "saving" : dirty ? session.phase === "conflict" ? "conflict" : "modified" : "saved"} className="font-medium">{saving ? text.saving : dirty ? session.phase === "conflict" ? text.conflict : text.modified : text.saved}</p></div>
      {error && <div ref={errorBox} tabIndex={-1} className="rounded-input focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"><CmsError error={error} locale={locale} returnTo={cmsPath(locale, content.id)} /></div>}
      {session.phase === "conflict" && <section className="space-y-4 rounded-panel border border-danger bg-danger-soft p-4 sm:p-6"><h2 className="text-xl font-semibold">{text.conflict}</h2><p>{text.conflictHelp}</p>
        <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void copy()}>{text.copy}</Button><Button variant="secondary" onClick={() => void loadConflict()}>{text.retry}</Button></div>{copyState && <p role="status">{copyState === "copied" ? text.copied : text.copyFailed}</p>}
        <div className="grid gap-4 lg:grid-cols-2"><FormField id="cms-local-copy" label={text.local}><TextArea readOnly rows={12} value={JSON.stringify({ ...session.value, childVersionIds: childrenDraft, ...(legacyPending && legacyBody ? { legacyBody } : {}) }, null, 2)} /></FormField>{conflict?.ok && <FormField id="cms-server-copy" label={text.server}><TextArea readOnly rows={12} value={JSON.stringify({ ...editable(conflict.data), childVersionIds: conflict.data.childVersionIds, legacyBody: conflict.data.legacyBody }, null, 2)} /></FormField>}</div>
        {conflict && !conflict.ok && <CmsError error={conflict.error} locale={locale} returnTo={cmsPath(locale, content.id)} />}
        {conflict?.ok && <div className="flex flex-wrap gap-3"><ConfirmationDialog title={text.reload} description={text.reloadHelp} confirmLabel={text.confirm} cancelLabel={text.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{text.reload}</Button>} onConfirm={loadServerVersion} /><ConfirmationDialog title={text.keepLocal} description={text.keepLocalHelp} confirmLabel={text.confirm} cancelLabel={text.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{text.keepLocal}</Button>} onConfirm={keepLocal} /></div>}
      </section>}
      {content.frozenAt && <StatusMessage tone="info">{text.frozen}</StatusMessage>}
      <fieldset disabled={metadataDirty} className="min-w-0 space-y-7">
      {legacyPending && <section className="space-y-4"><StatusMessage tone="warning">{text.legacyHelp}</StatusMessage>{legacyBody && <><FormField id="cms-legacy-body" label={text.legacy}><TextArea readOnly rows={10} value={legacyBody} /></FormField>{canWrite && <Button variant="secondary" onClick={() => update("document", { ...session.value.document, blocks: [...session.value.document.blocks, { type: "PARAGRAPH", text: legacyBody, url: null }] })}>{text.importLegacy}</Button>}</>}</section>}
      <form noValidate onSubmit={(event) => void save(event)} className="space-y-6" aria-busy={saving}>
        <FormField id="cms-title" label={text.contentTitle} required><Input name="title" maxLength={240} value={session.value.title} readOnly={!canWrite} onChange={(event) => update("title", event.target.value)} /></FormField>
        <FormField id="cms-summary" label={text.summary}><TextArea name="summary" maxLength={2000} rows={3} value={session.value.summary} readOnly={!canWrite} onChange={(event) => update("summary", event.target.value)} /></FormField>
        {canWrite ? <DocumentEditor key={resetKey} locale={locale} value={session.value.document} onChange={(document) => update("document", document)} /> : <DocumentPreview locale={locale} value={session.value.document} />}
        {canWrite && <><FormField id="cms-reason" label={text.reason} hint={text.reasonHint} error={reasonMissing ? text.required : undefined} required><TextArea name="reason" maxLength={1000} rows={3} value={session.value.reason} onChange={(event) => update("reason", event.target.value)} /></FormField><Button type="submit" busy={saving} disabled={session.phase === "saved" || session.phase === "conflict"} loadingLabel={text.saving}>{text.save}</Button></>}
      </form>
      {(content.kind === "COURSE" || content.kind === "MODULE") && <section id="cms-composition" className="space-y-4 rounded-panel border border-border p-4 sm:p-6"><h2 className="text-xl font-semibold">{text.composition}</h2><p className="text-sm text-muted-foreground">{text.compositionHelp}</p>
        {canWrite && !content.frozenAt && <ChildVersionPicker locale={locale} parentKind={content.kind} contentLocale={content.locale} selected={childrenDraft} onAdd={(id) => setChildrenDraft((items) => items.includes(id) || items.length >= 100 ? items : [...items, id])} onLabels={rememberChildLabels} />}
        {childrenDraft.map((id, index) => <div key={index} className="grid min-w-0 gap-3 rounded-input border border-border p-3">
          {(childLabels[id] || (dependencies.ok && dependencies.data.items.find((item) => item.versionId === id)?.title)) && <p className="break-words font-medium">{childLabels[id] || (dependencies.ok && dependencies.data.items.find((item) => item.versionId === id)?.title)}</p>}
          <FormField id={`cms-child-${index}`} label={`${text.childId} ${index + 1}`}><Input value={id} readOnly={!canWrite || Boolean(content.frozenAt)} onChange={(event) => setChildrenDraft((items) => items.map((value, position) => index === position ? event.target.value : value))} /></FormField>
          {canWrite && !content.frozenAt && <div className="flex flex-wrap gap-2"><Button variant="secondary" size="icon" disabled={index === 0} aria-label={text.moveUp.replace("{n}", String(index + 1))} onClick={() => setChildrenDraft((items) => moveItem(items, index, -1))}><ArrowUp aria-hidden="true" size={18} /></Button><Button variant="secondary" size="icon" disabled={index === childrenDraft.length - 1} aria-label={text.moveDown.replace("{n}", String(index + 1))} onClick={() => setChildrenDraft((items) => moveItem(items, index, 1))}><ArrowDown aria-hidden="true" size={18} /></Button><Button variant="ghost" onClick={() => setChildrenDraft((items) => items.filter((_, position) => position !== index))}>{text.remove}</Button></div>}
        </div>)}
        {canWrite && !content.frozenAt && <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setChildrenDraft((items) => [...items, ""])} disabled={childrenDraft.length >= 100}>{text.addChild}</Button>{action("composition", !compositionDirty)}</div>}
      </section>}
      </fieldset>
      {canWrite && <MetadataEditor key={content.id} locale={locale} content={content} etag={session.etag} disabled={bodyDirty || saving || legacyPending} onDirtyChange={setMetadataDirty} onSaved={(value, etag) => applyOperation(value, etag, "metadata")} />}
      <section className="space-y-3 rounded-panel border border-border p-4 sm:p-6"><h2 className="text-xl font-semibold">{text.translations}</h2><ul className="space-y-3">{content.translations.map((translation) => <li key={translation.id} className="flex flex-wrap items-center gap-3"><Link prefetch={false} href={cmsPath(locale, translation.id)}>{translation.locale.toUpperCase()}</Link><Badge>{text.state[translation.state]}</Badge></li>)}</ul>{content.sourceTranslationId && <p><Link prefetch={false} href={cmsPath(locale, content.sourceTranslationId, "preview")} target="_blank" rel="noreferrer">{text.source}</Link></p>}{content.state === "STALE" && content.sourceTranslationId && <StatusMessage tone="warning">{text.sourceChanged}</StatusMessage>}</section>
      <ReadinessPanel locale={locale} value={readiness} content={content} dirty={dirty} current={readinessEtag === session.etag} pending={checking} refresh={() => void check()} />
      <section className="flex flex-wrap gap-3" aria-label={text.status}>
        {canWrite && <>{action("TO_REVIEW", content.state !== "DRAFT" && content.state !== "STALE")}{action("STALE", content.state !== "PUBLISHED")}{action("duplicate")}{action("version")}{!content.translations.some((item) => item.locale !== content.locale) && action("translate")}</>}
        {permissions.includes("content.review") && action("READY", content.state !== "TO_REVIEW")}
        {permissions.includes("content.publish") && action("publish", content.state !== "READY")}
        {permissions.includes("content.archive") && action("archive", content.state === "ARCHIVED")}
      </section>
      <section className="space-y-5 rounded-panel border border-border p-4 sm:p-6"><h2 className="text-xl font-semibold">{text.history}</h2><Button variant="secondary" busy={historyPending} onClick={() => void loadHistory()} loadingLabel={text.loading}>{text.history}</Button>
        {history && !history.ok && <CmsError error={history.error} locale={locale} returnTo={cmsPath(locale, content.id)} />}
        {history?.ok && <>{history.data.items.length === 0 && <p>{text.historyEmpty}</p>}<ol className="space-y-5">{history.data.items.map((revision) => <li key={revision.id} className="space-y-3 rounded-input border border-border p-4"><h3 className="font-semibold">{text.revision} {revision.revisionNumber} · {revision.title}</h3><p className="text-sm text-muted-foreground">{formatCmsInstant(revision.createdAt, locale)}</p><p className="whitespace-pre-wrap text-sm">{revision.reason}</p><p className="break-words text-sm text-muted-foreground">{text.author}: {revision.authorId ?? text.noAuthor}</p>{canWrite && <Button variant="secondary" disabled={saving || metadataDirty} onClick={() => restore(revision)}>{text.restoreRevision}</Button>}</li>)}</ol>
          {history.data.total > history.data.size && <Pagination page={history.data.page + 1} totalPages={Math.ceil(history.data.total / history.data.size)} label={text.history} previousLabel={text.previous} nextLabel={text.next} pageLabel={text.page} onPageChange={(page) => void loadHistory(page - 1)} />}</>}
      </section>
    </div>
  </AdminLayout>;
}
