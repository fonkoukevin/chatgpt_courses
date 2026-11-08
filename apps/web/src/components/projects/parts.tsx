"use client";

import { useId, useRef, useState } from "react";
import { Button, FormField, Link, StatusMessage, TextArea } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { ProjectFields } from "@/lib/api/generated/types.gen";
import { authHref } from "@/lib/auth/routes";
import type { Locale } from "@/lib/i18n/locales";
import { getProjectsDictionary } from "@/lib/i18n/projects";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { projectBodyText } from "@/lib/projects/fields";
import { projectsPath } from "@/lib/projects/routes";

export function projectDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

export function projectStateLabel(locale: Locale, state: string): string {
  const t = getProjectsDictionary(locale);
  return state === "READY_FOR_SELF_ASSESSMENT" ? t.stateReady : state === "SELF_ASSESSED" ? t.stateAssessed : state === "NEEDS_REVISION" ? t.stateRevise : t.stateDraft;
}

export function ProjectError({ locale, error, retry }: { locale: Locale; error: ApiError; retry?: () => void }) {
  const t = getProjectsDictionary(locale);
  return <div className="space-y-3"><StatusMessage tone="danger">{error.kind === "unavailable" ? t.unavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 401 ? t.expiredSession : error.status === 404 ? t.notFound : t.httpError}</StatusMessage>{retry && <Button variant="secondary" onClick={retry}>{t.retry}</Button>}</div>;
}

export function ProjectAccountNotice({ locale, state, boundary, returnTo }: { locale: Locale; state: LearningAccountState; boundary: LearningAccountBoundary; returnTo: string }) {
  const t = getProjectsDictionary(locale);
  if (state.status === "active") return null;
  if (state.status === "loading") return <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>;
  return <div className="space-y-3"><StatusMessage tone="warning">{state.status === "changed" ? t.accountChanged : state.status === "expired" || state.status === "anonymous" ? t.expiredSession : state.error?.kind === "unavailable" ? t.unavailable : t.invalidResponse}</StatusMessage><div className="flex flex-wrap gap-3">{state.status === "changed" ? <Link href={projectsPath(locale)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm">{t.accountLibrary}</Link> : <Link href={authHref(locale, "sign-in", returnTo)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm">{t.signIn}</Link>}<Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void boundary.refresh()}>{t.retryAccount}</Button></div></div>;
}

export function ProjectCopy({ locale, fields }: { locale: Locale; fields: ProjectFields }) {
  const t = getProjectsDictionary(locale), id = useId(), text = projectBodyText(fields), manual = useRef<HTMLTextAreaElement>(null), sequence = useRef(0);
  const [result, setResult] = useState<{ text: string; status: "copied" | "error" } | null>(null);
  async function copy() {
    const request = ++sequence.current;
    try { await navigator.clipboard.writeText(text); if (request === sequence.current) setResult({ text, status: "copied" }); }
    catch { if (request === sequence.current) setResult({ text, status: "error" }); }
  }
  const current = result?.text === text ? result : null;
  return <div className="space-y-3"><Button variant="secondary" onClick={() => void copy()}>{t.copy}</Button>{current && <StatusMessage tone={current.status === "copied" ? "success" : "danger"}>{current.status === "copied" ? t.copied : t.copyFailed}</StatusMessage>}{current?.status === "error" && <div className="space-y-3"><FormField id={`${id}-copy`} label={t.local}><TextArea ref={manual} lang={fields.locale} readOnly rows={10} value={text} /></FormField><Button variant="secondary" onClick={() => { manual.current?.focus(); manual.current?.select(); }}>{t.selectText}</Button></div>}</div>;
}
