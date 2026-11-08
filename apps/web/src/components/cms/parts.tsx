"use client";

import { Button, Link, StatusMessage } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { authHref, authPath } from "@/lib/auth/routes";
import { cmsPath } from "@/lib/cms/routes";

export function cmsNavigation(locale: Locale, id?: string, mode: "edit" | "preview" = "edit") {
  return { contentHref: cmsPath(locale), accountHref: authPath(locale, "account"), languageHrefs: { fr: cmsPath("fr", id, mode), en: cmsPath("en", id, mode) }, navigationDescription: getCmsDictionary(locale).navigationDescription };
}
export function cmsErrorCopy(error: ApiError, locale: Locale): string {
  const text = getCmsDictionary(locale); const auth = getAuthDictionary(locale);
  if (error.kind === "unavailable") return auth.unavailable;
  if (error.kind === "invalid-response") return auth.invalidResponse;
  if (error.status === 403) return text.forbidden;
  if (error.status === 412) return text.conflictHelp;
  if (error.status === 401) return auth.AUTHENTICATION_REQUIRED;
  if (error.status === 429) return auth.RATE_LIMITED;
  const code = error.problem?.code;
  return code && Object.hasOwn(text.errors, code) ? text.errors[code as keyof typeof text.errors] : auth.genericError;
}
export function CmsError({ error, locale, returnTo, retry }: { error: ApiError; locale: Locale; returnTo: string; retry?: () => void }) {
  const text = getCmsDictionary(locale);
  return <StatusMessage tone="danger"><p>{cmsErrorCopy(error, locale)}</p><div className="mt-3 flex flex-wrap gap-3">
    {error.kind === "http" && error.status === 401 && <Link prefetch={false} href={authHref(locale, "sign-in", returnTo, "required")}>{getAuthDictionary(locale).signIn}</Link>}
    {retry && <Button variant="secondary" onClick={retry}>{text.retry}</Button>}
  </div></StatusMessage>;
}
export function formatCmsInstant(value: string | null, locale: Locale): string {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC" : getCmsDictionary(locale).noReview;
}
