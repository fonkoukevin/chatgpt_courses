"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, StatusMessage } from "@/components/ui";
import { domainDictionary } from "@/lib/i18n/domain";
import type { Locale } from "@/lib/i18n/locales";
import type { MethodValues } from "./types";

const fields = ["objective", "context", "data", "audience", "format", "constraints"] as const;
const requiredFields = ["objective", "context", "format"] as const;
const emptyValues: MethodValues = { objective: "", context: "", data: "", audience: "", format: "", constraints: "" };

export function MethodBuilder({ locale, initialValues, className }: {
  locale: Locale; initialValues?: Partial<MethodValues>; className?: string;
}) {
  const t = domainDictionary(locale).method;
  const prefix = useId();
  const inputRefs = useRef<Partial<Record<keyof MethodValues, HTMLTextAreaElement | null>>>({});
  const copyOperation = useRef(0);
  const [values, setValues] = useState<MethodValues>(() => Object.fromEntries(
    fields.map((field) => [field, initialValues?.[field] ?? emptyValues[field]]),
  ) as MethodValues);
  const [errors, setErrors] = useState<Partial<Record<keyof MethodValues, boolean>>>({});
  const [prompt, setPrompt] = useState("");
  const [generatedFrom, setGeneratedFrom] = useState<MethodValues | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const isStale = generatedFrom !== null && fields.some((field) => generatedFrom[field] !== values[field]);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing = requiredFields.filter((field) => !values[field].trim());
    setErrors(Object.fromEntries(missing.map((field) => [field, true])));
    copyOperation.current += 1;
    setCopyState("idle");
    if (missing.length > 0) {
      inputRefs.current[missing[0]]?.focus();
      return;
    }
    const sections = fields.map((field) => `${t.labels[field]}\n${values[field].trim() || t.notProvided}`);
    setPrompt([t.instruction, ...sections, t.verify].join("\n\n"));
    setGeneratedFrom({ ...values });
  }

  async function copyPrompt() {
    const operation = ++copyOperation.current;
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(prompt);
      if (operation === copyOperation.current) setCopyState("copied");
    } catch {
      if (operation === copyOperation.current) setCopyState("error");
    }
  }

  return <Card className={className}>
    <CardHeader>
      <CardTitle>{t.title}</CardTitle>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
    </CardHeader>
    <CardContent>
      <form onSubmit={prepare} noValidate className="space-y-5">
        <p id={`${prefix}-help`} className="text-sm text-muted-foreground">{t.requiredHint}</p>
        {Object.values(errors).some(Boolean) && <StatusMessage tone="danger">{t.invalid}</StatusMessage>}
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          {fields.map((field) => {
            const required = requiredFields.some((name) => name === field);
            const inputId = `${prefix}-${field}`;
            return <div key={field} className="min-w-0">
              <label htmlFor={inputId} className="mb-2 block text-sm font-medium">{t.labels[field]}{required && <span aria-hidden="true"> *</span>}</label>
              <textarea id={inputId} name={field} ref={(node) => { inputRefs.current[field] = node; }}
                value={values[field]} placeholder={t.placeholders[field]} rows={field === "context" || field === "data" ? 4 : 3}
                required={required} aria-invalid={errors[field] || undefined}
                aria-describedby={`${prefix}-help${errors[field] ? ` ${inputId}-error` : ""}`}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [field]: event.target.value }));
                  if (errors[field]) setErrors((current) => ({ ...current, [field]: false }));
                  copyOperation.current += 1;
                  setCopyState("idle");
                }}
                className={`block min-h-28 w-full resize-y rounded-lg border bg-surface px-3 py-3 text-base leading-relaxed text-foreground placeholder:text-muted-foreground ${errors[field] ? "border-danger" : "border-control"}`} />
              {errors[field] && <p id={`${inputId}-error`} className="mt-2 text-sm text-danger">{t.required}</p>}
            </div>;
          })}
        </div>
        <Button type="submit">{t.generate}</Button>
      </form>
      <div className="mt-6 border-t border-border pt-6">
        <label htmlFor={`${prefix}-prompt`} className="mb-2 block text-sm font-semibold">{t.output}</label>
        <textarea id={`${prefix}-prompt`} value={prompt} rows={prompt ? 12 : 5}
          placeholder={t.empty} aria-describedby={`${prefix}-local`}
          onChange={(event) => { copyOperation.current += 1; setPrompt(event.target.value); setCopyState("idle"); }}
          className="block min-h-36 w-full resize-y rounded-lg border border-control bg-surface-subtle p-4 font-mono text-sm leading-relaxed text-foreground placeholder:font-sans placeholder:text-muted-foreground" />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={!prompt.trim()} onClick={copyPrompt}>{t.copy}</Button>
          <p id={`${prefix}-local`} className="text-sm text-muted-foreground">{t.local}</p>
        </div>
        <div className="mt-4 space-y-3">
          {isStale ? <StatusMessage tone="warning">{t.stale}</StatusMessage>
            : generatedFrom && <StatusMessage tone="info">{t.generated}</StatusMessage>}
          {copyState === "copied" && <StatusMessage tone="success">{t.copied}</StatusMessage>}
          {copyState === "error" && <StatusMessage tone="danger">{t.copyFailed}</StatusMessage>}
        </div>
      </div>
    </CardContent>
  </Card>;
}
