"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Copy } from "lucide-react";
import { Button, ConfirmationDialog, FormField, StatusMessage, TextArea } from "@/components/ui";
import type { Locale } from "@/lib/i18n/locales";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import { emptyParameters, generateInstruction, generatorFields, parametersChanged, requiredGeneratorFields, validateGenerator, type GeneratorErrors, type GeneratorValue } from "@/lib/methods/generator";

export type MethodGeneratorProps = {
  locale: Locale; textLocale: Locale; value: GeneratorValue; onChange: (value: GeneratorValue) => void;
  sourceInstruction?: string; disabled?: boolean; outputError?: string;
};
export function MethodGenerator({ locale, textLocale, value, onChange, sourceInstruction, disabled, outputError }: MethodGeneratorProps) {
  const t = getMethodsDictionary(locale), id = useId();
  const [errors, setErrors] = useState<GeneratorErrors>({}); const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [copyText, setCopyText] = useState<string | null>(null);
  const output = useRef<HTMLTextAreaElement>(null), form = useRef<HTMLFormElement>(null), copySequence = useRef(0);
  function changed(next: GeneratorValue) { copySequence.current++; setCopyState("idle"); onChange(next); }
  function rebuild() {
    if (disabled) return;
    changed(generateInstruction(value, textLocale, sourceInstruction)); setErrors({});
    requestAnimationFrame(() => output.current?.focus());
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (disabled) return;
    const nextErrors = validateGenerator(value.parameters); setErrors(nextErrors);
    const first = generatorFields.find((field) => nextErrors[field]);
    if (first) { form.current?.querySelector<HTMLTextAreaElement>(`[name="${first}"]`)?.focus(); return; }
    if (value.text.trim()) setConfirmRebuild(true); else rebuild();
  }
  async function copy() {
    const sequence = ++copySequence.current; const snapshot = value.text; setCopyText(snapshot); setCopyState("busy");
    try { await navigator.clipboard.writeText(snapshot); if (sequence === copySequence.current) setCopyState("copied"); }
    catch { if (sequence === copySequence.current) setCopyState("error"); }
  }
  function reset() { if (disabled) return; changed({ parameters: emptyParameters(), generatedFrom: null, text: "" }); setErrors({}); requestAnimationFrame(() => form.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus()); }
  return <section className="min-w-0 space-y-6" aria-labelledby={`${id}-title`}>
    <div className="space-y-3"><h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">{t.generator}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.generatorIntro}</p><p className="text-sm text-muted-foreground">{t.requiredHint}</p></div>
    <form ref={form} noValidate onSubmit={prepare} className="space-y-5">
      {Object.values(errors).some(Boolean) && <StatusMessage tone="danger">{t.invalid}</StatusMessage>}
      <fieldset disabled={disabled} className="grid min-w-0 gap-5 md:grid-cols-2">{generatorFields.map((field) => <FormField key={field} id={`${id}-${field}`} label={t.fields[field]} hint={t.hints[field]} required={requiredGeneratorFields.some((key) => key === field)} error={errors[field] ? t[errors[field]] : undefined}>
        <TextArea name={field} maxLength={4000} rows={field === "availableData" || field === "context" ? 5 : 3} value={value.parameters[field]} onChange={(event) => { changed({ ...value, parameters: { ...value.parameters, [field]: event.target.value } }); if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined })); }} />
      </FormField>)}</fieldset>
      <div className="flex flex-wrap gap-3"><ConfirmationDialog open={confirmRebuild} onOpenChange={(next) => { if (!next) setConfirmRebuild(false); }} trigger={<Button type="submit" disabled={disabled} className="max-w-full whitespace-normal">{value.generatedFrom || value.text ? t.rebuild : t.prepare}</Button>} title={t.replaceTitle} description={t.replaceHelp} confirmLabel={t.confirmRebuild} cancelLabel={t.cancel} destructive={false} onConfirm={rebuild} /><ConfirmationDialog title={t.resetTitle} description={t.resetHelp} confirmLabel={t.confirmReset} cancelLabel={t.cancel} trigger={<Button variant="ghost" disabled={disabled} className="max-w-full whitespace-normal">{t.reset}</Button>} onConfirm={reset} /></div>
    </form>
    <div className="space-y-4 border-t border-border pt-6"><FormField id={`${id}-output`} label={t.output} hint={t.outputHint} error={outputError ?? (value.text.length > 32000 ? t.outputLimit : undefined)}><TextArea ref={output} name="text" lang={textLocale} rows={14} readOnly={disabled} value={value.text} placeholder={t.outputEmpty} onChange={(event) => changed({ ...value, text: event.target.value })} /></FormField>
      <p className="text-sm leading-relaxed text-muted-foreground">{t.textLanguage} : {textLocale.toUpperCase()}. {t.originalLanguage}</p>
      {parametersChanged(value) ? <StatusMessage tone="warning">{t.stale}</StatusMessage> : value.generatedFrom && <StatusMessage>{t.prepared}</StatusMessage>}
      <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={!value.text.trim()} busy={copyState === "busy" && copyText === value.text} loadingLabel={t.copying} onClick={() => void copy()}><Copy size={17} aria-hidden="true" />{t.copy}</Button><Button variant="ghost" disabled={!value.text} onClick={() => { output.current?.focus(); output.current?.select(); }}>{t.selectText}</Button></div>
      {copyText === value.text && copyState === "copied" && <StatusMessage tone="success">{t.copied}</StatusMessage>}{copyText === value.text && copyState === "error" && <StatusMessage tone="danger">{t.copyFailed}</StatusMessage>}
    </div>
  </section>;
}
