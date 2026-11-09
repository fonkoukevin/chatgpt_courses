"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock3, FileCheck2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, Link, StatusMessage } from "@/components/ui";
import { PublicLayout } from "@/components/layouts/public-layout";
import { getPublicDictionary } from "@/lib/i18n/public";
import { localeName, type Locale } from "@/lib/i18n/locales";
import type { BreadcrumbTrail } from "./breadcrumbs";
import type { AuthResult } from "@/lib/api/auth-client";
import type { CataloguePage, ResourceCard, ResourceDetail } from "@/lib/api/generated/types.gen";
import { publicCatalogueHref, resourceHref, type LanguageLinks } from "@/lib/public/routes";

export type DetailProps = { locale: Locale; result: AuthResult<ResourceDetail>; languageLinks: LanguageLinks; activityHrefs?: Record<string, string>; returnTo?: string; breadcrumbs?: BreadcrumbTrail };
export function PublicShell({ locale, languageLinks, children }: { locale: Locale; languageLinks: LanguageLinks; children: ReactNode }) {
  return <PublicLayout locale={locale} product={{ languageLinks }}>{children}</PublicLayout>;
}
export function Retry({ locale }: { locale: Locale }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const t = getPublicDictionary(locale);
  return <Button variant="secondary" busy={pending} loadingLabel={t.retrying} onClick={() => startTransition(() => router.refresh())}>{t.retry}</Button>;
}
export function PublicApiError({ locale, result, standalone = false }: { locale: Locale; result: Extract<AuthResult<unknown>, { ok: false }>; standalone?: boolean }) {
  const t = getPublicDictionary(locale); const { error } = result;
  const description = error.kind === "unavailable" ? t.serviceUnavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 404 ? t.notFound : t.httpError;
  return <div className="space-y-4">{standalone && <h1 className="text-3xl font-semibold tracking-tight">{t.serviceTitle}</h1>}<StatusMessage tone="danger" title={standalone ? undefined : t.serviceTitle}>{description}</StatusMessage><Retry locale={locale} /></div>;
}
export function ResourceCards({ locale, resources, returnTo }: { locale: Locale; resources: ResourceCard[]; returnTo?: string }) {
  const t = getPublicDictionary(locale);
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{resources.map((resource) => <Card key={`${resource.resourceId}-${resource.versionId}`} className="flex flex-col">
    <CardHeader><div className="flex flex-wrap gap-2"><Badge tone="brand">{t[resource.kind]}</Badge><Badge>{t[resource.access]}</Badge><Badge>{localeName(resource.locale)}</Badge></div><h3 lang={resource.locale} className="break-words text-xl font-semibold leading-snug"><Link href={resourceHref(resource, returnTo)} className="no-underline hover:underline">{resource.title}</Link></h3><p lang={resource.locale} className="text-sm leading-relaxed text-muted-foreground">{resource.summary || resource.objective}</p></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4"><p className="text-sm leading-relaxed"><span className="font-medium">{t.expected} : </span>{resource.expectedResult ? <span lang={resource.locale}>{resource.expectedResult}</span> : t.missingInfo}</p><div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 text-[0.8125rem] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Clock3 size={15} aria-hidden="true" />{resource.estimatedMinutes === null ? t.durationUnknown : `${resource.estimatedMinutes} ${t.minutes}`}</span><span>{resource.level ? t[resource.level] : t.levelUnknown}</span></div><Link href={resourceHref(resource, returnTo)} className="inline-flex min-h-11 items-center gap-2 self-start font-medium">{t.open}<ArrowRight size={16} aria-hidden="true" /></Link></CardContent>
  </Card>)}</div>;
}
export function PublicationList({ locale, result, returnTo }: { locale: Locale; result: AuthResult<CataloguePage>; returnTo?: string }) {
  const t = getPublicDictionary(locale);
  if (!result.ok) return <PublicApiError locale={locale} result={result} />;
  return result.data.items.length ? <ResourceCards locale={locale} resources={result.data.items} returnTo={returnTo} /> : <StatusMessage>{t.noPublication}</StatusMessage>;
}
export function BackToCatalogue({ locale, returnTo }: { locale: Locale; returnTo?: string }) {
  const t = getPublicDictionary(locale);
  const course = /^\/(?:fr\/parcours|en\/courses)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\?|$)/.test(returnTo ?? "");
  return <Link href={returnTo ?? publicCatalogueHref(locale)} className="inline-flex min-h-11 items-center text-sm">← {course ? t.backCourse : t.backCatalogue}</Link>;
}
export function AvailabilityNotice({ locale, resource }: { locale: Locale; resource: ResourceDetail }) {
  const t = getPublicDictionary(locale);
  return <div className="space-y-4"><h1 className="text-3xl font-semibold tracking-tight">{t.unavailableTitle}</h1><StatusMessage tone="warning">{resource.availability === "PUBLISHED" ? t.unavailableDescription : t[resource.availability]}</StatusMessage><p className="text-sm leading-relaxed text-muted-foreground">{t.unavailableDescription}</p></div>;
}
export function TranslationAvailability({ locale, resource, languageLinks }: { locale: Locale; resource: ResourceDetail; languageLinks: LanguageLinks }) {
  const t = getPublicDictionary(locale);
  const others = resource.languages.filter((language) => language.locale !== resource.locale || language.status !== "PUBLISHED" || languageLinks[language.locale].reason);
  if (!others.length) return null;
  return <section aria-label={t.linkedLanguage} className="space-y-3 rounded-input border border-border bg-surface-subtle p-4"><h2 className="text-sm font-semibold">{t.linkedLanguage}</h2><ul className="space-y-3">{others.map((language) => {
    const link = languageLinks[language.locale];
    return <li key={language.locale} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span lang={language.locale} className="font-medium">{localeName(language.locale)}</span>{link.reason === "COURSE_CONTEXT_UNAVAILABLE" ? <div data-language-alternative={language.locale} data-language-reason={link.reason} className="w-full space-y-2"><p className="leading-relaxed text-muted-foreground">{t.courseContextUnavailable}</p><div className="flex flex-wrap gap-x-4 gap-y-2">{link.alternativeHref && <Link href={link.alternativeHref} hrefLang={language.locale}>{t.openStandaloneActivity}</Link>}<Link href={link.href} hrefLang={language.locale}>{t.alternative}</Link></div></div> : language.status === "PUBLISHED" && link.available ? <Link href={link.href} hrefLang={language.locale}>{t.open}</Link> : <><span className="text-muted-foreground">{t[language.status === "PUBLISHED" ? "MISSING_TRANSLATION" : language.status]}</span><Link href={link.href}>{t.alternative}</Link></>}</li>;
  })}</ul></section>;
}
export function DetailHeading({ locale, resource }: { locale: Locale; resource: ResourceDetail }) {
  const t = getPublicDictionary(locale);
  return <header className="space-y-4"><div className="flex flex-wrap gap-2"><Badge tone="brand">{t[resource.kind]}</Badge><Badge>{t.version} {resource.versionNumber}</Badge>{resource.access && <Badge>{t[resource.access]}</Badge>}<Badge>{localeName(resource.locale)}</Badge></div><h1 lang={resource.title ? resource.locale : locale} className="max-w-4xl break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{resource.title ?? t.unavailableTitle}</h1>{resource.summary && <p lang={resource.locale} className="max-w-3xl text-lg leading-relaxed text-muted-foreground">{resource.summary}</p>}<p className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><FileCheck2 size={16} aria-hidden="true" />{resource.reviewedAt ? `${t.reviewed} ${new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(resource.reviewedAt))}` : t.reviewUnknown}</p></header>;
}
