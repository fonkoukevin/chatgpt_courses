"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Dialog, FormField, Input, Link, Select, StatusMessage, TextArea } from "@/components/ui";
import { archiveContent, createContentTranslation, createContentVersion, duplicateContent, getContent, getContentDependencies, getContentReadiness, publishContent, replaceContentComposition, transitionContent } from "@/lib/api/cms-client";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { ContentDocument, ContentView, Dependencies, Readiness } from "@/lib/api/generated/types.gen";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { DocumentEditor, emptyDocument, normalizeDocument } from "./document-editor";
import { CmsError } from "./parts";
import { DocumentPreview } from "./preview";

export type ContentActionMode = "TO_REVIEW" | "READY" | "STALE" | "publish" | "archive" | "duplicate" | "version" | "translate" | "composition";
export type LocalContent = { title: string; summary: string; document: ContentDocument; reason: string };
type Props = { locale: Locale; mode: ContentActionMode; content: ContentView; etag: string; draft: LocalContent; childrenDraft: string[]; disabled?: boolean; onResult: (value: ContentView, etag: string, mode: ContentActionMode) => void; onConflict: () => void };

export function ContentAction(props: Props) {
  const [open, setOpen] = useState(false); const [pending, setPending] = useState(false);
  const text = getCmsDictionary(props.locale);
  const title = props.mode === "TO_REVIEW" ? text.toReview : props.mode === "READY" ? text.markReady : props.mode === "STALE" ? text.markStale : props.mode === "publish" ? text.publish : props.mode === "archive" ? text.archive : props.mode === "version" ? text.newVersion : props.mode === "translate" ? text.translate : props.mode === "composition" ? text.saveComposition : text.duplicate;
  const description = props.mode === "publish" ? text.publishHelp : props.mode === "archive" ? text.archiveHelp : props.mode === "translate" ? text.translationHelp : props.mode === "duplicate" ? text.duplicateHelp : text.versionHelp;
  return <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }} title={title} description={description} closeLabel={text.close} className={props.mode === "translate" ? "max-w-3xl" : undefined}
    trigger={<Button variant={props.mode === "archive" ? "destructive" : "secondary"} disabled={props.disabled}>{title}</Button>}>
    <ActionForm {...props} title={title} setPending={setPending} onSuccess={(value, etag) => { props.onResult(value, etag, props.mode); setOpen(false); }} />
  </Dialog>;
}

function ActionForm({ locale, mode, content, etag, draft, childrenDraft, title, setPending, onSuccess, onConflict }: Props & { title: string; setPending: (value: boolean) => void; onSuccess: (value: ContentView, etag: string) => void }) {
  const text = getCmsDictionary(locale);
  const [reason, setReason] = useState(""); const [nextTitle, setTitle] = useState(mode === "translate" ? "" : draft.title); const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState(mode === "translate" ? "" : draft.summary);
  const [objectives, setObjectives] = useState(content.objectives); const [evaluation, setEvaluation] = useState(content.evaluationDefinition);
  const [targetLocale, setTargetLocale] = useState<Locale>(content.locale === "fr" ? "en" : "fr");
  const [translation, setTranslation] = useState<ContentDocument>(() => emptyDocument());
  const [error, setError] = useState<ApiError | null>(null); const [invalid, setInvalid] = useState(false); const [busy, setBusy] = useState(false);
  const [dependencies, setDependencies] = useState<AuthResult<Dependencies> | null>(null);
  const [readiness, setReadiness] = useState<AuthResult<Readiness> | null>(null); const [source, setSource] = useState<AuthResult<ContentView> | null>(null);
  const lock = useRef(false); const form = useRef<HTMLFormElement>(null); const errorBox = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    if (mode === "archive") getContentDependencies(content.id).then((result) => { if (current) setDependencies(result); });
    if (mode === "READY") Promise.all([getContentReadiness(content.id), content.sourceTranslationId ? getContent(content.sourceTranslationId) : Promise.resolve(null)]).then(([checked, original]) => { if (current) { setReadiness(checked); setSource(original); } });
    return () => { current = false; };
  }, [mode, content.id, content.sourceTranslationId]);
  const archiveBlocked = mode === "archive" && (!dependencies?.ok || !dependencies.data.canArchive);
  const reviewBlocked = mode === "READY" && (!readiness?.ok || !readiness.data.ready || readiness.data.checkedRevision !== content.currentRevisionId || (content.sourceTranslationId !== null && !source?.ok));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || archiveBlocked || reviewBlocked) return;
    const fields = ["reason", ...((mode === "duplicate" || mode === "translate") ? ["title", "slug"] : []), ...(mode === "version" ? ["objectives", "evaluationDefinition"] : [])];
    const values: Record<string, string> = { reason, title: nextTitle, slug, objectives, evaluationDefinition: evaluation };
    const missing = fields.find((field) => !values[field].trim());
    setInvalid(Boolean(missing)); if (missing) { form.current?.querySelector<HTMLElement>(`[name="${missing}"]`)?.focus(); return; }
    lock.current = true; setBusy(true); setPending(true); setError(null);
    try {
      let result: AuthResult<ContentView>;
      if (mode === "publish") result = await publishContent(content.id, etag, { revisionId: content.currentRevisionId, reason });
      else if (mode === "archive") result = await archiveContent(content.id, etag, { reason });
      else if (mode === "duplicate") result = await duplicateContent(content.id, etag, { slug, title: nextTitle, reason });
      else if (mode === "version") result = await createContentVersion(content.id, etag, { objectives, evaluationDefinition: evaluation, title: draft.title, summary: draft.summary, document: normalizeDocument(draft.document), childVersionIds: childrenDraft, reason });
      else if (mode === "translate") result = await createContentTranslation(content.id, etag, { locale: targetLocale, slug, title: nextTitle, summary, document: normalizeDocument(translation), reason });
      else if (mode === "composition") result = await replaceContentComposition(content.id, etag, { childVersionIds: childrenDraft.filter((value) => value.trim()), reason });
      else result = await transitionContent(content.id, etag, { state: mode, reason, sourceRevisionId: source?.ok ? source.data.currentRevisionId : null });
      if (!mounted.current) return;
      if (result.ok && result.etag) onSuccess(result.data, result.etag);
      else if (!result.ok) { setError(result.error); if (result.error.status === 412) onConflict(); requestAnimationFrame(() => errorBox.current?.focus()); }
    } finally { lock.current = false; if (mounted.current) { setBusy(false); setPending(false); } }
  }
  return <form ref={form} noValidate aria-busy={busy} className="mt-6 space-y-5" onSubmit={(event) => void submit(event)}>
    {invalid && <StatusMessage tone="danger">{text.required}</StatusMessage>}
    {error && <div ref={errorBox} tabIndex={-1}><CmsError error={error} locale={locale} returnTo={cmsPath(locale, content.id)} /></div>}
    {mode === "archive" && <section className="space-y-3"><h3 className="font-semibold">{text.dependencies}</h3>{dependencies?.ok ? <><ul className="space-y-2 text-sm">{dependencies.data.items.map((item, index) => <li key={index} className="break-words">{text.kind[item.kind]} · {item.title}</li>)}</ul>{dependencies.data.items.length === 0 && <p className="text-sm">{text.noDependencies}</p>}<ul className="space-y-2 text-sm">{dependencies.data.consequences.map((code) => <li key={code}>{Object.hasOwn(text.consequences, code) ? text.consequences[code as keyof typeof text.consequences] : text.archiveHelp}</li>)}</ul>{!dependencies.data.canArchive && <StatusMessage tone="warning">{text.archiveBlocked}</StatusMessage>}</> : dependencies ? <CmsError error={dependencies.error} locale={locale} returnTo={cmsPath(locale, content.id)} /> : <p role="status">{text.loading}</p>}</section>}
    {mode === "READY" && <section className="space-y-3">{!readiness ? <p role="status">{text.loading}</p> : readiness.ok ? <StatusMessage tone={readiness.data.ready ? "success" : "warning"}>{readiness.data.ready ? text.readinessReady : text.readinessNotReady}</StatusMessage> : <CmsError error={readiness.error} locale={locale} returnTo={cmsPath(locale, content.id)} />}
      {source?.ok && <details className="rounded-input border border-border p-3"><summary className="cursor-pointer font-medium">{text.source} · {source.data.title} · {text.version} {source.data.versionNumber} · {text.state[source.data.state]}</summary><div className="mt-4">{source.data.document ? <DocumentPreview value={source.data.document} locale={locale} /> : <p>{text.legacyHelp}</p>}</div></details>}
      {source && !source.ok && <CmsError error={source.error} locale={locale} returnTo={cmsPath(locale, content.id)} />}
    </section>}
    {(mode === "duplicate" || mode === "translate") && <><FormField id="cms-action-title" label={text.contentTitle} required><Input name="title" value={nextTitle} readOnly={busy} onChange={(event) => setTitle(event.target.value)} maxLength={240} /></FormField><FormField id="cms-action-slug" label={text.slug} required><Input name="slug" value={slug} readOnly={busy} onChange={(event) => setSlug(event.target.value)} /></FormField></>}
    {mode === "version" && <><FormField id="cms-action-objectives" label={text.canonicalObjectives} required><TextArea name="objectives" value={objectives} readOnly={busy} onChange={(event) => setObjectives(event.target.value)} /></FormField><FormField id="cms-action-evaluation" label={text.evaluationDefinition} required><TextArea name="evaluationDefinition" value={evaluation} readOnly={busy} onChange={(event) => setEvaluation(event.target.value)} /></FormField></>}
    {mode === "translate" && <><FormField id="cms-action-locale" label={text.language}><Select value={targetLocale} onChange={(event) => { if (!busy) setTargetLocale(event.target.value as Locale); }} options={([{ value: "fr", label: "Français" }, { value: "en", label: "English" }]).filter((item) => item.value !== content.locale)} /></FormField><FormField id="cms-action-summary" label={text.summary}><TextArea value={summary} readOnly={busy} onChange={(event) => setSummary(event.target.value)} /></FormField><DocumentEditor locale={locale} value={translation} onChange={(value) => { if (!lock.current) setTranslation(value); }} sectionPrefix="translation" /></>}
    <FormField id="cms-action-reason" label={text.reason} hint={text.reasonHint} required><TextArea name="reason" rows={3} maxLength={1000} value={reason} readOnly={busy} onChange={(event) => setReason(event.target.value)} /></FormField>
    <Button type="submit" variant={mode === "archive" ? "destructive" : "primary"} busy={busy} disabled={archiveBlocked || reviewBlocked} loadingLabel={text.busy}>{title}</Button>
    {mode === "READY" && source?.ok && <p className="text-sm text-muted-foreground"><Link prefetch={false} href={cmsPath(locale, source.data.id, "preview")} target="_blank" rel="noreferrer">{text.source} · {text.preview}</Link></p>}
  </form>;
}
