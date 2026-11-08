"use client";

import { useId } from "react";
import { Button, FormField, Input } from "@/components/ui";
import type { QuizPolicy } from "@/lib/api/generated/types.gen";
import { getQuizEditorialDictionary } from "@/lib/i18n/quiz-editorial";
import type { Locale } from "@/lib/i18n/locales";

export function QuizPolicyFields({ locale, value, onChange }: { locale: Locale; value: QuizPolicy | null | undefined; onChange: (value: QuizPolicy | null) => void }) {
  const t = getQuizEditorialDictionary(locale), id = useId();
  return <section className="space-y-4 rounded-panel border border-border p-4 sm:p-6">
    <h2 className="text-xl font-semibold">{t.title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.help}</p>
    {value ? <><div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${id}-threshold`} label={t.threshold} required><Input type="number" min={1} max={100} value={value.passPercent} onChange={(event) => onChange({ ...value, passPercent: Number(event.target.value) })} /></FormField>
      <FormField id={`${id}-attempts`} label={t.attempts} hint={t.unlimited}><Input type="number" min={1} max={50} value={value.maxAttempts ?? ""} onChange={(event) => onChange({ ...value, maxAttempts: event.target.value === "" ? null : Number(event.target.value) })} /></FormField>
    </div><Button variant="secondary" onClick={() => onChange(null)}>{t.reset}</Button></> : <><p className="text-sm">{t.legacy}</p><Button variant="secondary" onClick={() => onChange({ passPercent: 100, maxAttempts: null })}>{t.enable}</Button></>}
  </section>;
}
