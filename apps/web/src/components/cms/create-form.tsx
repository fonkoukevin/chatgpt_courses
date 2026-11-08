"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, FormField, Input, Select, StatusMessage, TextArea } from "@/components/ui";
import { createContent } from "@/lib/api/cms-client";
import type { ContentView, CreateContent } from "@/lib/api/generated/types.gen";
import type { ApiError } from "@/lib/api/client";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { cmsPath } from "@/lib/cms/routes";
import { DocumentEditor, emptyDocument, normalizeDocument } from "./document-editor";
import { CmsError } from "./parts";

export function CreateContentForm({ locale, onCreated, onBusyChange, initialDraft, onDraftChange }: { locale: Locale; onCreated: (value: ContentView) => void; onBusyChange?: (value: boolean) => void; initialDraft?: CreateContent | null; onDraftChange?: (value: CreateContent) => void }) {
  const text = getCmsDictionary(locale);
  const [value, setValue] = useState<CreateContent>(() => initialDraft ?? ({ kind: "ACTIVITY", locale, slug: "", title: "", summary: "", objectives: "", evaluationDefinition: "", document: emptyDocument(), childVersionIds: [], reason: "" }));
  const [pending, setPending] = useState(false); const [error, setError] = useState<ApiError | null>(null); const [invalid, setInvalid] = useState(false);
  const lock = useRef(false); const form = useRef<HTMLFormElement>(null); const errorBox = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function update<K extends keyof CreateContent>(key: K, next: CreateContent[K]) {
    if (lock.current) return;
    const draft = { ...value, [key]: next };
    setValue(draft); onDraftChange?.(draft);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const required = ["title", "slug", "objectives", "evaluationDefinition", "reason"] as const;
    const missing = required.find((key) => !value[key].trim());
    setInvalid(Boolean(missing));
    if (missing) { form.current?.querySelector<HTMLElement>(`[name="${missing}"]`)?.focus(); return; }
    lock.current = true; setPending(true); onBusyChange?.(true); setError(null);
    try {
      const result = await createContent({ ...value, document: normalizeDocument(value.document), childVersionIds: value.childVersionIds.filter((item) => item.trim()) });
      if (!mounted.current) return;
      if (result.ok) onCreated(result.data);
      else { setError(result.error); requestAnimationFrame(() => errorBox.current?.focus()); }
    } finally { lock.current = false; if (mounted.current) { setPending(false); onBusyChange?.(false); } }
  }
  return <form ref={form} noValidate onSubmit={(event) => void submit(event)} aria-busy={pending} className="mt-6 space-y-6">
    {invalid && <StatusMessage tone="danger">{text.required}</StatusMessage>}
    {error && <div ref={errorBox} tabIndex={-1}><CmsError error={error} locale={locale} returnTo={cmsPath(locale)} /></div>}
    <fieldset aria-disabled={pending} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2"><FormField id="cms-create-kind" label={text.type}><Select value={value.kind} onChange={(event) => update("kind", event.target.value as CreateContent["kind"])} options={Object.entries(text.kind).map(([value, label]) => ({ value, label }))} /></FormField>
        <FormField id="cms-create-locale" label={text.language}><Select value={value.locale} onChange={(event) => update("locale", event.target.value as Locale)} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} /></FormField></div>
      <FormField id="cms-title" label={text.contentTitle} required><Input name="title" value={value.title} maxLength={240} readOnly={pending} onChange={(event) => update("title", event.target.value)} /></FormField>
      <FormField id="cms-create-slug" label={text.slug} required><Input name="slug" value={value.slug} readOnly={pending} onChange={(event) => update("slug", event.target.value)} /></FormField>
      <FormField id="cms-summary" label={text.summary}><TextArea name="summary" rows={3} value={value.summary} maxLength={2000} readOnly={pending} onChange={(event) => update("summary", event.target.value)} /></FormField>
      <FormField id="cms-create-objectives" label={text.canonicalObjectives} required><TextArea name="objectives" value={value.objectives} maxLength={4000} readOnly={pending} onChange={(event) => update("objectives", event.target.value)} /></FormField>
      <FormField id="cms-create-evaluation" label={text.evaluationDefinition} required><TextArea name="evaluationDefinition" value={value.evaluationDefinition} maxLength={4000} readOnly={pending} onChange={(event) => update("evaluationDefinition", event.target.value)} /></FormField>
      <DocumentEditor locale={locale} value={value.document} onChange={(document) => update("document", document)} sectionPrefix="create" />
      {(value.kind === "COURSE" || value.kind === "MODULE") && <FormField id="cms-create-children" label={text.childId} hint={text.compositionHelp}><TextArea rows={4} value={value.childVersionIds.join("\n")} onChange={(event) => update("childVersionIds", event.target.value ? event.target.value.split("\n") : [])} /></FormField>}
      <FormField id="cms-reason" label={text.reason} hint={text.reasonHint} required><TextArea name="reason" rows={3} value={value.reason} maxLength={1000} readOnly={pending} onChange={(event) => update("reason", event.target.value)} /></FormField>
    </fieldset>
    <Button type="submit" busy={pending} loadingLabel={text.busy}>{text.create}</Button>
  </form>;
}
