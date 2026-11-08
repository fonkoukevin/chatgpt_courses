"use client";

import { Button, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ContentView, Readiness } from "@/lib/api/generated/types.gen";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { CmsError } from "./parts";

export function ReadinessPanel({ locale, value, content, dirty, current, pending, refresh }: { locale: Locale; value: AuthResult<Readiness>; content: ContentView; dirty: boolean; current: boolean; pending: boolean; refresh: () => void }) {
  const text = getCmsDictionary(locale);
  const stale = dirty || !current || (value.ok && value.data.checkedRevision !== content.currentRevisionId);
  function focus(field: string) {
    const section = field.includes("media") ? "media" : field.includes("exercise") || field.includes("correction") ? "exercise" : field.includes("rubric") ? "rubric" : field.includes("quiz") ? "quiz" : field.includes("child") || field.includes("composition") ? "composition" : field.includes("blocks") ? "blocks" : "objective";
    document.getElementById(`cms-${section}`)?.querySelector<HTMLElement>("input,textarea,select,button")?.focus();
  }
  return <section aria-labelledby="cms-readiness-title" className="space-y-4 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6">
    <h2 id="cms-readiness-title" className="text-xl font-semibold">{text.readiness}</h2>
    <Button variant="secondary" busy={pending} disabled={dirty} onClick={refresh} loadingLabel={text.busy}>{text.checkReadiness}</Button>
    {stale && <StatusMessage tone="warning">{text.readinessStale}</StatusMessage>}
    {!value.ok ? <CmsError error={value.error} locale={locale} returnTo={cmsPath(locale, content.id)} /> : !stale && <>
      <StatusMessage tone={value.data.ready ? "success" : "warning"}>{value.data.ready ? text.readinessReady : text.readinessNotReady}</StatusMessage>
      {(["blockingIssues", "warnings"] as const).map((group) => value.data[group].length > 0 && <div key={group}><h3 className="font-semibold">{group === "blockingIssues" ? text.blockers : text.warnings}</h3><ul className="mt-3 space-y-3">{value.data[group].map((issue, index) => <li key={`${issue.code}-${index}`} className="rounded-input border border-border bg-surface p-3"><p className="text-sm">{Object.hasOwn(text.issues, issue.code) ? text.issues[issue.code as keyof typeof text.issues] : text.readinessNotReady}</p><Button variant="link" className="mt-1 px-0" onClick={() => focus(issue.field)}>{text.fix}</Button></li>)}</ul></div>)}
    </>}
  </section>;
}
