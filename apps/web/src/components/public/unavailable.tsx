"use client";

import type { Locale } from "@/lib/i18n/locales";
import type { LanguageLinks } from "@/lib/public/routes";
import { getPublicDictionary } from "@/lib/i18n/public";
import { StatusMessage } from "@/components/ui";
import { BackToCatalogue, PublicShell } from "./parts";

export function PublicUnavailable({ locale, languageLinks, title, description, returnTo }: { locale: Locale; languageLinks: LanguageLinks; title?: string; description?: string; returnTo?: string }) {
  const t = getPublicDictionary(locale);
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-6 py-10 sm:py-16"><BackToCatalogue locale={locale} returnTo={returnTo} /><h1 className="text-3xl font-semibold tracking-tight">{title ?? t.unavailableTitle}</h1><StatusMessage tone="warning">{description ?? t.unavailableDescription}</StatusMessage></div></PublicShell>;
}
