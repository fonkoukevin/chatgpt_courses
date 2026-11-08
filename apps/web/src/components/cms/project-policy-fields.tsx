"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, ConfirmationDialog, FormField, Input, Select, StatusMessage, TextArea } from "@/components/ui";
import type { ContentDocument, ProjectPreset } from "@/lib/api/generated/types.gen";
import { getProjectPreset } from "@/lib/api/projects-client";
import { getProjectEditorialDictionary } from "@/lib/i18n/project-editorial";
import type { Locale } from "@/lib/i18n/locales";

export function ProjectPolicyFields({ locale, contentLocale, value, onChange }: { locale: Locale; contentLocale: Locale; value: ContentDocument; onChange: (value: ContentDocument) => void }) {
  const t = getProjectEditorialDictionary(locale), id = useId(), request = useRef(0), latest = useRef(value);
  const [caseCode, setCaseCode] = useState<"BR01" | "BR02">(value.projectPolicy?.caseCode ?? "BR01"), [preset, setPreset] = useState<ProjectPreset | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(false);
  useEffect(() => { latest.current = value; }, [value]);
  useEffect(() => () => { request.current++; }, []);
  async function load() {
    const sequence = ++request.current; setPending(true); setError(false); setPreset(null);
    const result = await getProjectPreset(caseCode, contentLocale);
    if (sequence !== request.current) return;
    setPending(false); if (result.ok) setPreset(result.data); else setError(true);
  }
  const policy = value.projectPolicy;
  return <section className="space-y-5 rounded-panel border border-border p-4 sm:p-6"><h2 className="text-xl font-semibold">{t.title}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.help}</p>
    {policy && <div className="space-y-4"><Badge>{t.configured} {policy.caseCode}</Badge><div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${id}-threshold`} label={t.threshold} required><Input type="number" min={1} max={20} value={policy.passPoints} onChange={(event) => onChange({ ...value, projectPolicy: { ...policy, passPoints: Number(event.target.value) } })} /></FormField>
      <FormField id={`${id}-reveal`} label={t.reveal}><Select value={policy.revealPolicy} options={[{ value: "EXPLICIT", label: t.explicit }, { value: "AFTER_SUBMISSION", label: t.afterAssessment }]} onChange={(event) => onChange({ ...value, projectPolicy: { ...policy, revealPolicy: event.target.value as "EXPLICIT" | "AFTER_SUBMISSION" } })} /></FormField>
    </div><h3 className="font-semibold">{t.blocking}</h3>{policy.blockingIssues.map((issue, index) => <FormField key={`project-policy-issue:${issue.key}`} id={`${id}-issue-${index}`} label={`${t.issue} ${index + 1}`}><TextArea rows={2} lang={contentLocale} maxLength={1000} value={issue.label} onChange={(event) => onChange({ ...value, projectPolicy: { ...policy, blockingIssues: policy.blockingIssues.map((item, position) => position === index ? { ...item, label: event.target.value } : item) } })} /></FormField>)}
      <ConfirmationDialog title={t.removeTitle} description={t.removeHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.remove}</Button>} onConfirm={() => onChange({ ...latest.current, projectPolicy: null })} />
    </div>}
    <div className="space-y-4 border-t border-border pt-4"><FormField id={`${id}-case`} label={t.reference}><Select value={caseCode} options={[{ value: "BR01", label: "BR01 · Client R" }, { value: "BR02", label: "BR02 · Client S" }]} onChange={(event) => { request.current++; setPending(false); setPreset(null); setCaseCode(event.target.value as "BR01" | "BR02"); }} /></FormField>
      <Button variant="secondary" busy={pending} loadingLabel={t.loading} onClick={() => void load()}>{t.load}</Button>{error && <StatusMessage tone="danger">{t.unavailable}</StatusMessage>}
      {preset && <div className="space-y-4"><details className="rounded-input border border-border p-4"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t.preview} · {preset.caseCode}</summary><ol className="mt-3 list-decimal space-y-2 pl-5" lang={preset.locale}>{preset.rubric.map((criterion) => <li key={`preset-criterion:${criterion.key}`} className="text-sm leading-relaxed">{criterion.label}</li>)}</ol></details>
        <ConfirmationDialog title={t.replaceTitle} description={t.replaceHelp} confirmLabel={t.confirm} cancelLabel={t.cancel} destructive={false} trigger={<Button variant="secondary" className="max-w-full whitespace-normal">{t.apply}</Button>}
          onConfirm={() => { onChange({ ...latest.current, projectPolicy: structuredClone(preset.policy), rubric: structuredClone(preset.rubric) }); setPreset(null); }} />
      </div>}
    </div>
  </section>;
}
