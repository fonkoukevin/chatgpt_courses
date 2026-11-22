"use client";

import { useId, useRef, useState } from "react";
import { Button, FormField, Select, StatusMessage, TextArea } from "@/components/ui";
import { MarkdownExport } from "@/components/files/markdown-export";
import type { ResourceDetail } from "@/lib/api/generated/types.gen";
import { practiceMarkdown } from "@/lib/files/markdown-export";
import type { Locale } from "@/lib/i18n/locales";
import { getPracticeDraftDictionary } from "@/lib/i18n/practice-draft";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { useUnsavedLearningInput } from "./unsaved";

// An exercise without a project policy remains a local practice, with no
// invented project template, assessment, browser persistence or account import.
export function ActivityPracticeDraft({ locale, resource, account, boundary, available }: {
  locale: Locale; resource: ResourceDetail; account: LearningAccountState; boundary: LearningAccountBoundary; available: boolean;
}) {
  const t = getPracticeDraftDictionary(locale), id = useId(), input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(""), [textLocale, setTextLocale] = useState<Locale>(resource.locale);
  const [copy, setCopy] = useState<{ value: string; state: "copied" | "error" } | null>(null);
  useUnsavedLearningInput(Boolean(text), boundary, t.unsaved);
  if (resource.document?.projectPolicy || !resource.document?.exerciseInstructions) return null;
  const blocked = !available || !["anonymous", "active"].includes(account.status), copyState = copy?.value === text ? copy.state : null;
  async function copyText() {
    const value = text;
    try { await navigator.clipboard.writeText(value); setCopy({ value, state: "copied" }); }
    catch { setCopy({ value, state: "error" }); }
  }
  return <section className="min-w-0 space-y-5 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6" data-activity-practice-draft>
    <h3 className="text-xl font-semibold">{t.title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t.local}</p>
    {available && <details><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{t.instructions}</summary><p lang={resource.locale} className="whitespace-pre-wrap break-words pb-3 leading-relaxed">{resource.document.exerciseInstructions}</p></details>}
    <FormField id={`${id}-locale`} label={t.language} hint={t.languageHelp}><Select name="practiceLocale" disabled={blocked} value={textLocale} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} onChange={event => setTextLocale(event.target.value as Locale)} /></FormField>
    <FormField id={`${id}-text`} label={t.response} hint={t.responseHelp}><TextArea ref={input} name="practiceText" lang={textLocale} rows={10} maxLength={32000} readOnly={blocked} value={text} onChange={event => { setText(event.target.value); setCopy(null); }} /></FormField>
    <div className="space-y-3"><Button variant="secondary" disabled={!text.trim()} onClick={() => void copyText()} data-practice-copy>{t.copy}</Button>
      {copyState && <StatusMessage tone={copyState === "copied" ? "success" : "danger"}>{copyState === "copied" ? t.copied : t.copyFailed}</StatusMessage>}
      {copyState === "error" && <Button variant="secondary" onClick={() => { input.current?.focus(); input.current?.select(); }}>{t.select}</Button>}
      <MarkdownExport locale={locale} textLocale={textLocale} kind="practice" text={practiceMarkdown({ title: resource.title ?? t.exportTitle, versionNumber: resource.versionNumber, locale: textLocale, text })} disabled={!text.trim()} />
    </div>
  </section>;
}
