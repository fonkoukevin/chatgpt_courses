"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button, FormField, Link, StatusMessage, TextArea } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import { authHref } from "@/lib/auth/routes";
import { getAccountDictionary } from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { projectDate } from "@/components/projects/parts";

export const accountDate = projectDate;
export function AccountError({ locale, error, retry }: { locale: Locale; error: ApiError; retry?: () => void }) {
  const t = getAccountDictionary(locale);
  return <div className="space-y-3"><StatusMessage tone="danger">{error.kind === "unavailable" ? t.unavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 404 ? t.notFound : error.status === 403 ? t.forbidden : error.status === 409 || error.status === 412 ? t.conflict : t.invalidResponse}</StatusMessage>{retry && <Button variant="secondary" onClick={retry}>{t.retry}</Button>}</div>;
}
export function AccountNotice({ locale, account, boundary, destination }: { locale: Locale; account: LearningAccountState; boundary: LearningAccountBoundary; destination: string }) {
  const t = getAccountDictionary(locale);
  return account.status === "active" ? null : <div className="space-y-3"><StatusMessage tone="warning">{account.status === "loading" ? t.accountLoading : account.status === "changed" ? t.accountChanged : account.status === "expired" || account.status === "anonymous" ? t.expired : t.unavailable}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "sign-in", destination)} prefetch={false} className="inline-flex min-h-11 items-center">{t.signIn}</Link><Button variant="secondary" onClick={() => void boundary.refresh()}>{t.checkAccount}</Button></div></div>;
}
export function AccountTextCopy({ locale, value }: { locale: Locale; value: string }) {
  const t = getAccountDictionary(locale), id = useId(), sequence = useRef(0), [result, setResult] = useState<{ value: string; copied: boolean } | null>(null);
  useEffect(() => () => { sequence.current++; }, []);
  async function copy() { const attempt = ++sequence.current; try { await navigator.clipboard.writeText(value); if (attempt === sequence.current) setResult({ value, copied: true }); } catch { if (attempt === sequence.current) setResult({ value, copied: false }); } }
  const current = result?.value === value ? result : null;
  return <div className="space-y-3"><Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void copy()}>{t.copy}</Button>{current && <StatusMessage tone={current.copied ? "success" : "warning"}>{current.copied ? t.copied : t.copyFailed}</StatusMessage>}{current && !current.copied && <FormField id={id} label={t.copy}><TextArea readOnly value={value} rows={6} onFocus={event => event.currentTarget.select()} /></FormField>}</div>;
}
export function saveAccountDownload(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); try { const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } }
