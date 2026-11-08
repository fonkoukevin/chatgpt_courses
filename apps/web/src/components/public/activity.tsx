"use client";

import { useId, useState } from "react";
import { Checkbox, StatusMessage } from "@/components/ui";
import type { PublicDocument } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getPublicDictionary } from "@/lib/i18n/public";
import { AvailabilityNotice, BackToCatalogue, DetailHeading, PublicApiError, PublicShell, TranslationAvailability, type DetailProps } from "./parts";
import { PublicDocumentBody, ResourceTools } from "./document";

function PublicExercise({ locale, document }: { locale: Locale; document: PublicDocument }) {
  const t = getPublicDictionary(locale), id = useId(); const [checked, setChecked] = useState<string[]>([]);
  return <div className="space-y-8"><section className="space-y-4 rounded-panel border border-brand/20 bg-brand-soft p-5 sm:p-6"><h2 className="text-2xl font-semibold">{t.exercise}</h2><p className="whitespace-pre-wrap leading-relaxed">{document.exerciseInstructions || t.noExercise}</p></section>
    {document.rubric.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.checklist}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.checklistNotice}</p><div className="space-y-4">{document.rubric.map((criterion, index) => <Checkbox key={criterion.key} id={`${id}-criterion-${index}`} label={criterion.label} checked={checked.includes(criterion.key)} onCheckedChange={(next) => setChecked((previous) => next === true ? [...previous, criterion.key] : previous.filter((key) => key !== criterion.key))} />)}</div></section>}
    {document.quiz.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.reflection}</h2><p className="text-sm text-muted-foreground">{t.reflectionNotice}</p>{document.quiz.map((question) => <div key={question.key} className="space-y-3 rounded-panel border border-border p-4"><h3 className="font-semibold">{question.prompt}</h3><ul className="list-disc space-y-2 pl-5 text-sm">{question.options.map((option, index) => <li key={index}>{option}</li>)}</ul></div>)}</section>}
  </div>;
}
export function PublicActivity({ locale, result, languageLinks, returnTo }: DetailProps) {
  const t = getPublicDictionary(locale), resource = result.ok ? result.data : null;
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><BackToCatalogue locale={locale} returnTo={returnTo} />{!result.ok ? <PublicApiError locale={locale} result={result} standalone /> : resource && resource.availability !== "PUBLISHED" ? <><AvailabilityNotice locale={locale} resource={resource} /><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} /></> : resource && <>
    <DetailHeading locale={locale} resource={resource} /><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} /><div className="max-w-3xl space-y-8">{resource.document ? <><StatusMessage>{t.activityNotice}</StatusMessage><PublicDocumentBody locale={locale} document={resource.document} prefix="activity" /><PublicExercise key={resource.revisionId} locale={locale} document={resource.document} /><ResourceTools key={resource.revisionId} locale={locale} resource={resource} /></> : <StatusMessage>{resource.access === "PROTECTED" ? t.protectedBody : t.missingInfo}</StatusMessage>}</div>
  </>}</div></PublicShell>;
}
