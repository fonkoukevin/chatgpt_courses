"use client";

import { Button, Link, StatusMessage } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { MethodOrigin } from "@/lib/api/generated/types.gen";
import { authHref } from "@/lib/auth/routes";
import { getMethodsDictionary } from "@/lib/i18n/methods";
import type { Locale } from "@/lib/i18n/locales";
import { methodsPath } from "@/lib/methods/routes";
import { resourceHref } from "@/lib/public/routes";

export const accountContextChanged = (error: ApiError | null) => error !== null && "problem" in error && error.problem?.code === "ACCOUNT_CONTEXT_CHANGED";
export function methodErrorText(locale: Locale, error: ApiError): string {
  const t = getMethodsDictionary(locale);
  if (accountContextChanged(error)) return t.accountChanged;
  if (error.kind === "unavailable") return t.unavailable;
  if (error.kind === "invalid-response") return t.invalidResponse;
  if (error.status === 401) return t.accountRequired;
  if (error.status === 403) return t.forbidden;
  if (error.status === 404) return t.notFound;
  if (error.status === 412) return t.conflictHelp;
  return t.genericError;
}
export function MethodsError({ locale, error, returnTo, retry }: { locale: Locale; error: ApiError; returnTo: string; retry?: () => void }) {
  const t = getMethodsDictionary(locale);
  return <StatusMessage tone="danger"><p>{methodErrorText(locale, error)}</p><div className="mt-3 flex flex-wrap gap-3">
    {error.status === 401 && <Link prefetch={false} href={authHref(locale, "sign-in", returnTo, "required")}>{t.signIn}</Link>}
    {accountContextChanged(error) && <Link prefetch={false} href={methodsPath(locale)}>{t.accountLibrary}</Link>}
    {retry && !accountContextChanged(error) && <Button variant="secondary" className="max-w-full whitespace-normal" onClick={retry}>{t.retry}</Button>}
  </div></StatusMessage>;
}
export function personalMethodLanguages(id?: string): Record<Locale, string> { return { fr: methodsPath("fr", id), en: methodsPath("en", id) }; }
export function sourceMethodHref(source: MethodOrigin): string {
  return resourceHref({ locale: source.locale, kind: "METHOD_TEMPLATE", slug: source.slug, resourceId: source.resourceId, versionId: source.versionId });
}
export const methodDate = (value: string, locale: Locale) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
