"use client";

import { Link, StatusMessage } from "@/components/ui";
import { getPublicDictionary } from "@/lib/i18n/public";
import { AvailabilityNotice, BackToCatalogue, DetailHeading, PublicApiError, PublicShell, ResourceCards, TranslationAvailability, type DetailProps } from "./parts";
import { PublicDocumentBody, ResourceTools } from "./document";
import { PublicBreadcrumbs } from "./breadcrumbs";

export function PublicGuide({ locale, result, languageLinks, returnTo, breadcrumbs }: DetailProps) {
  const t = getPublicDictionary(locale); const resource = result.ok ? result.data : null;
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><PublicBreadcrumbs trail={breadcrumbs} /><BackToCatalogue locale={locale} returnTo={returnTo} />{!result.ok ? <PublicApiError locale={locale} result={result} standalone /> : resource && resource.availability !== "PUBLISHED" ? <><AvailabilityNotice locale={locale} resource={resource} /><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} /></> : resource && <>
    <DetailHeading locale={locale} resource={resource} /><TranslationAvailability locale={locale} resource={resource} languageLinks={languageLinks} />
    {resource.document ? <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,720px)]"><nav aria-label={t.contents} className="rounded-panel border border-border bg-surface-subtle p-4"><h2 className="font-semibold">{t.contents}</h2><ol className="mt-3 space-y-1">{resource.document.blocks.flatMap((block, index) => block.type === "HEADING" ? [<li key={index}><Link href={`#guide-section-${index}`} lang={resource.locale} className="inline-flex min-h-11 items-center text-sm">{block.text}</Link></li>] : [])}<li><Link href="#guide-sources" className="inline-flex min-h-11 items-center text-sm">{t.sources}</Link></li></ol></nav><article className="min-w-0 space-y-8"><PublicDocumentBody locale={locale} contentLocale={resource.locale} document={resource.document} prefix="guide" /><section id="guide-sources" className="space-y-3 border-t border-border pt-6"><h2 className="text-2xl font-semibold">{t.sources}</h2>{resource.metadata.sources.length ? <ul className="space-y-2">{resource.metadata.sources.map((source, index) => <li key={index}><Link href={source.url} lang={resource.locale}>{source.label}</Link></li>)}</ul> : <p className="text-sm text-muted-foreground">{t.missingInfo}</p>}</section><ResourceTools key={resource.revisionId} locale={locale} resource={resource} /></article></div> : <StatusMessage>{resource.access === "PROTECTED" ? t.protectedBody : t.missingInfo}</StatusMessage>}
    {resource.related.length > 0 && <section className="space-y-5"><h2 className="text-2xl font-semibold">{t.related}</h2><ResourceCards locale={locale} resources={resource.related} returnTo={returnTo} /></section>}
  </>}</div></PublicShell>;
}
