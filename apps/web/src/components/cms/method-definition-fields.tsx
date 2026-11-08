"use client";

import { useId } from "react";
import { Button, ConfirmationDialog, FormField, TextArea } from "@/components/ui";
import type { MethodDefinition } from "@/lib/api/generated/types.gen";
import { getMethodEditorialDictionary } from "@/lib/i18n/method-editorial";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import type { Locale } from "@/lib/i18n/locales";
import { emptyParameters, generatorFields } from "@/lib/methods/generator";

export function MethodDefinitionFields({ locale, value, onChange }: { locale: Locale; value: MethodDefinition | null | undefined; onChange: (value: MethodDefinition | null) => void }) {
  const t = getMethodEditorialDictionary(locale), generator = getMethodsDictionary(locale), id = useId();
  return <section id="cms-method-definition" className="space-y-5"><h2 className="text-xl font-semibold">{t.title}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.help}</p>
    {!value ? <Button variant="secondary" onClick={() => onChange({ useCases: [], requiredInputs: [], steps: [], starterInstruction: "", example: "", checks: [], limitations: [], defaults: emptyParameters() })}>{t.add}</Button> : <>
      {(["useCases", "requiredInputs", "steps", "checks", "limitations"] as const).map((key) => <FormField key={key} id={`${id}-${key}`} label={t[key]} hint={t.lines}><TextArea rows={4} maxLength={20020} value={value[key].join("\n")} onChange={(event) => onChange({ ...value, [key]: event.target.value ? event.target.value.split("\n") : [] })} /></FormField>)}
      <FormField id={`${id}-instruction`} label={t.starterInstruction}><TextArea rows={6} maxLength={4000} value={value.starterInstruction} onChange={(event) => onChange({ ...value, starterInstruction: event.target.value })} /></FormField>
      <FormField id={`${id}-example`} label={t.example}><TextArea rows={7} maxLength={8000} value={value.example} onChange={(event) => onChange({ ...value, example: event.target.value })} /></FormField>
      <fieldset className="grid gap-5 rounded-input border border-border p-4"><legend className="px-1 font-semibold">{t.defaults}</legend>{generatorFields.map((key) => <FormField key={key} id={`${id}-default-${key}`} label={generator.fields[key]}><TextArea rows={3} maxLength={4000} value={value.defaults[key]} onChange={(event) => onChange({ ...value, defaults: { ...value.defaults, [key]: event.target.value } })} /></FormField>)}</fieldset>
      <ConfirmationDialog title={t.removeTitle} description={t.removeHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="ghost">{t.remove}</Button>} onConfirm={() => onChange(null)} />
    </>}
  </section>;
}
