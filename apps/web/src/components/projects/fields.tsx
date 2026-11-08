"use client";

import { useId } from "react";
import { FormField, Input, Select, TextArea } from "@/components/ui";
import type { ProjectFields } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import { projectSectionKeys } from "@/lib/projects/fields";

export type ProjectFieldErrors = Partial<Record<keyof ProjectFields, string>>;
export function ProjectFieldsEditor({ locale, value, onChange, disabled = false, errors = {}, localeEditable = false }: {
  locale: Locale; value: ProjectFields; onChange: (value: ProjectFields) => void;
  disabled?: boolean; errors?: ProjectFieldErrors; localeEditable?: boolean;
}) {
  const t = getProjectsDictionary(locale), id = useId();
  return <fieldset disabled={disabled} className="min-w-0 space-y-6"><FormField id={`${id}-title`} label={t.title} required error={errors.title}><Input name="title" maxLength={240} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></FormField>
    {localeEditable ? <FormField id={`${id}-locale`} label={t.locale} hint={t.localeHelp} error={errors.locale}><Select name="locale" value={value.locale} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} onChange={(event) => onChange({ ...value, locale: event.target.value as Locale })} /></FormField> : <div className="space-y-2 text-sm"><p>{t.locale} : <span className="font-medium">{value.locale.toUpperCase()}</span></p><p className="leading-relaxed text-muted-foreground">{t.localeHelp}</p></div>}
    <div className="grid gap-6 xl:grid-cols-2">{projectSectionKeys.map((key) => <FormField key={`project-field:${key}`} id={`${id}-${key}`} label={t[key]} error={errors[key]}><TextArea name={key} lang={value.locale} rows={5} value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} /></FormField>)}</div>
    <FormField id={`${id}-external`} label={t.externalText} hint={t.externalHelp} error={errors.externalText}><TextArea name="externalText" lang={value.locale} rows={10} value={value.externalText} onChange={(event) => onChange({ ...value, externalText: event.target.value })} /></FormField>
  </fieldset>;
}
