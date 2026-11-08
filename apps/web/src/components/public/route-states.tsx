"use client";
import { useParams } from "next/navigation";
import { isLocale } from "@/lib/i18n/locales";
import { getPublicLoadingCopy, getPublicPageDictionary } from "@/lib/i18n/public-pages";
import { publicCatalogueHref, type LanguageLinks } from "@/lib/public/routes";
import { PublicUnavailable } from "./unavailable";

export function PublicNotFound() {
  const params = useParams(), locale = isLocale(params.locale) ? params.locale : "fr", copy = getPublicPageDictionary(locale);
  const links: LanguageLinks = { fr: { href: publicCatalogueHref("fr"), available: true }, en: { href: publicCatalogueHref("en"), available: true } };
  return <PublicUnavailable locale={locale} languageLinks={links} title={copy.notFoundTitle} description={copy.notFoundDescription} returnTo={publicCatalogueHref(locale)} />;
}
export function PublicLoading() {
  const params = useParams(), locale = isLocale(params.locale) ? params.locale : "fr";
  return <main id="main-content" tabIndex={-1} className="mx-auto max-w-[var(--content-max)] space-y-6 px-4 py-16 sm:px-6"><p role="status" className="text-muted-foreground">{getPublicLoadingCopy(locale)}</p><div aria-hidden="true" className="h-32 rounded-panel bg-surface-subtle motion-safe:animate-pulse" /></main>;
}
