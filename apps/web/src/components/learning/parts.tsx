"use client";

import { Button, Link, StatusMessage } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import { authHref } from "@/lib/auth/routes";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { learningPath } from "@/lib/learning/routes";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";

export function learningDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

export function LearningError({ locale, error, retry }: { locale: Locale; error: ApiError; retry?: () => void }) {
  const t = getLearningDictionary(locale);
  return <div className="space-y-3"><StatusMessage tone="danger">{error.status === 401 ? t.expiredSession : error.kind === "unavailable" ? t.unavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 404 ? t.notFound : t.httpError}</StatusMessage>{retry && <Button variant="secondary" onClick={retry}>{t.retry}</Button>}</div>;
}

export function AccountNotice({ locale, state, boundary, returnTo }: { locale: Locale; state: LearningAccountState; boundary: LearningAccountBoundary; returnTo: string }) {
  const t = getLearningDictionary(locale);
  if (state.status === "active") return null;
  if (state.status === "loading") return <p role="status" className="text-sm text-muted-foreground">{t.privateLoading}</p>;
  if (state.status === "anonymous") return <div className="space-y-4 rounded-panel border border-brand/20 bg-brand-soft p-4 sm:p-5"><p className="text-sm leading-relaxed">{t.signInHelp}</p><Link href={authHref(locale, "sign-in", returnTo)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm font-medium">{t.signIn}</Link></div>;
  return <div className="space-y-3"><StatusMessage tone="warning">{state.status === "changed" ? t.accountChanged : state.status === "expired" ? t.expiredSession : state.error?.kind === "unavailable" ? t.unavailable : t.invalidResponse}</StatusMessage><div className="flex flex-wrap gap-3">{state.status === "changed" ? <Link href={learningPath(locale)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm">{t.accountLibrary}</Link> : <Link href={authHref(locale, "sign-in", returnTo)} prefetch={false} className="inline-flex min-h-11 max-w-full items-center text-sm">{t.signIn}</Link>}<Button variant="secondary" className="max-w-full whitespace-normal" onClick={() => void boundary.refresh()}>{t.accountCheck}</Button></div></div>;
}
