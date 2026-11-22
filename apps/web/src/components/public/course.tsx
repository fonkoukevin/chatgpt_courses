"use client";

import { ArrowRight, FileCheck2, FileText } from "lucide-react";
import { PublicBreadcrumbs } from "./breadcrumbs";
import { CourseMemberAccess } from "@/components/learning/course-access";
import { Accordion, Badge, Button, Card, CardContent, CardHeader, Link } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { CurriculumNode, ResourceDetail } from "@/lib/api/generated/types.gen";
import type { CourseOfferSelection } from "@/lib/commerce/course-offers";
import { getCourseDictionary } from "@/lib/i18n/course";
import { localeName, type Locale } from "@/lib/i18n/locales";
import { getPublicDictionary } from "@/lib/i18n/public";
import type { LanguageLinks } from "@/lib/public/routes";
import { CourseOffers } from "./course-offers";
import { AvailabilityNotice, BackToCatalogue, PublicApiError, PublicShell, ResourceCards, TranslationAvailability, type DetailProps } from "./parts";

function Programme({ locale, nodes, activityHrefs, nested = false }: { locale: Locale; nodes: CurriculumNode[]; activityHrefs: Record<string, string>; nested?: boolean }) {
  const t = getPublicDictionary(locale);
  return <ol className={nested ? "mt-4 space-y-4 border-l border-border pl-4 sm:pl-5" : "divide-y divide-border border-y border-border"}>{nodes.map((node, index) => {
    const child = node.children[0];
    const mergedActivity = node.kind === "MODULE" && node.availability === "PUBLISHED" && node.children.length === 1 && child !== undefined
      && child.kind === "ACTIVITY" && child.availability === "PUBLISHED" && child.locale === node.locale
      && node.title !== null && child.title === node.title && child.summary === node.summary
      && child.children.length === 0 && activityHrefs[child.versionId] ? child : undefined;
    const presented = mergedActivity ?? node;
    const href = presented.availability === "PUBLISHED" ? activityHrefs[presented.versionId] : undefined;
    const title = <span lang={presented.title ? presented.locale : locale}>{href ? <Link href={href}>{presented.title ?? t.ACTIVITY}</Link> : presented.title ?? t.unavailableTitle}</span>;
    return <li key={node.versionId} className={nested ? "min-w-0" : "flex min-w-0 gap-4 py-6 sm:gap-5"}>
      {!nested && <span aria-hidden="true" className="pt-1 text-sm font-medium tabular-nums text-brand">{String(index + 1).padStart(2, "0")}</span>}
      <div className="min-w-0 flex-1 space-y-2">
        {nested ? <p className="break-words font-medium leading-snug">{title}</p> : <h3 className="break-words text-lg font-semibold leading-snug">{title}</h3>}
        {presented.summary && <p lang={presented.locale} className="text-sm leading-relaxed text-muted-foreground">{presented.summary}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {presented.access && <span>{t[presented.access]}</span>}
          {presented.estimatedMinutes !== null && <span>{presented.estimatedMinutes} {t.minutes}</span>}
          {presented.availability !== "PUBLISHED" && <span className="text-warning">{t[presented.availability]}</span>}
        </div>
        {!mergedActivity && node.children.length > 0 && <Programme locale={locale} nodes={node.children} activityHrefs={activityHrefs} nested />}
      </div>
    </li>;
  })}</ol>;
}

function firstFreeActivity(nodes: CurriculumNode[], activityHrefs: Record<string, string>): { node: CurriculumNode; href: string } | undefined {
  for (const node of nodes) {
    if (node.availability !== "PUBLISHED") continue;
    if (node.kind === "ACTIVITY" && node.access === "FREE" && activityHrefs[node.versionId]) return { node, href: activityHrefs[node.versionId] };
    const child = firstFreeActivity(node.children, activityHrefs); if (child) return child;
  }
}

function CourseLanguages({ locale, resource, languageLinks }: { locale: Locale; resource: ResourceDetail; languageLinks: LanguageLinks }) {
  const t = getPublicDictionary(locale), course = getCourseDictionary(locale);
  return <div className="space-y-3"><h3 className="font-semibold">{course.languages}</h3><ul className="space-y-3">{resource.languages.map(language => {
    const link = languageLinks[language.locale];
    return <li key={language.locale} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span lang={language.locale} className="font-medium">{localeName(language.locale)}</span>
      {language.locale === resource.locale && language.status === "PUBLISHED" ? <span className="text-muted-foreground">{course.currentLanguage}</span> : link.reason === "COURSE_CONTEXT_UNAVAILABLE" ? <div data-language-alternative={language.locale} data-language-reason={link.reason} className="w-full space-y-2"><p className="leading-relaxed text-muted-foreground">{t.courseContextUnavailable}</p><div className="flex flex-wrap gap-x-4 gap-y-2">{link.alternativeHref && <Link href={link.alternativeHref} hrefLang={language.locale}>{t.openStandaloneActivity}</Link>}<Link href={link.href} hrefLang={language.locale}>{t.alternative}</Link></div></div> : language.status === "PUBLISHED" && link.available ? <Link href={link.href} hrefLang={language.locale}>{t.open}</Link> : <><span className="text-muted-foreground">{t[language.status === "PUBLISHED" ? "MISSING_TRANSLATION" : language.status]}</span><Link href={link.href}>{t.alternative}</Link></>}
    </li>;
  })}</ul></div>;
}

function ProgrammeVersions({ locale, nodes }: { locale: Locale; nodes: CurriculumNode[] }) {
  const t = getPublicDictionary(locale);
  return <ul className="space-y-2">{nodes.map(node => <li key={node.versionId} className="space-y-2"><p><span lang={node.title ? node.locale : locale}>{node.title ?? t.unavailableTitle}</span> · {t.version} {node.versionNumber}</p>{node.children.length > 0 && <div className="border-l border-border pl-4"><ProgrammeVersions locale={locale} nodes={node.children} /></div>}</li>)}</ul>;
}

export function PublicCourse({ locale, result, languageLinks, activityHrefs = {}, offersResult, returnTo, breadcrumbs }: DetailProps & { offersResult?: AuthResult<CourseOfferSelection> }) {
  const t = getPublicDictionary(locale), course = getCourseDictionary(locale);
  const resource = result.ok ? result.data : undefined;
  const trial = resource ? firstFreeActivity(resource.curriculum, activityHrefs) : undefined;
  return <PublicShell locale={locale} languageLinks={languageLinks}><div data-course-presentation className="space-y-8 py-8 sm:py-12"><PublicBreadcrumbs trail={breadcrumbs} /><BackToCatalogue locale={locale} returnTo={returnTo} />{!result.ok ? <PublicApiError locale={locale} result={result} standalone /> : result.data.availability !== "PUBLISHED" ? <><AvailabilityNotice locale={locale} resource={result.data} /><TranslationAvailability locale={locale} resource={result.data} languageLinks={languageLinks} /></> : <>
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
      <div className="min-w-0 space-y-10 lg:col-start-1">
      <header className="space-y-5"><div className="flex flex-wrap items-center gap-3"><p className="text-sm font-medium text-brand">{course.eyebrow}</p>{result.data.metadata.level && <Badge>{t[result.data.metadata.level]}</Badge>}</div><h1 lang={result.data.title ? result.data.locale : locale} className="max-w-3xl break-words text-[2rem] font-semibold leading-[1.12] tracking-tight sm:text-5xl">{result.data.title ?? t.unavailableTitle}</h1>{result.data.summary && <p lang={result.data.locale} className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{result.data.summary}</p>}{trial && <Button asChild><Link data-course-trial href={trial.href} className="no-underline">{t.try}<ArrowRight size={17} aria-hidden="true" /></Link></Button>}</header>
      <section className="space-y-4 rounded-panel border border-border bg-surface-subtle p-5 sm:p-7"><FileText className="text-brand" size={24} aria-hidden="true" /><h2 className="text-2xl font-semibold tracking-tight">{t.expected}</h2><p lang={result.data.expectedResult ? result.data.locale : locale} className="whitespace-pre-wrap leading-relaxed">{result.data.expectedResult || t.missingInfo}</p>{result.data.objective && <div className="space-y-2 border-t border-border pt-4"><h3 className="text-sm font-semibold">{t.objective}</h3><p lang={result.data.locale} className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{result.data.objective}</p></div>}</section>
      {trial && <section className="space-y-4 border-l-2 border-brand pl-5 sm:pl-6"><p className="text-sm font-medium text-brand">{course.preview}</p><h2 lang={trial.node.locale} className="text-xl font-semibold tracking-tight">{trial.node.title ?? t.ACTIVITY}</h2>{trial.node.summary && <p lang={trial.node.locale} className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{trial.node.summary}</p>}<Link href={trial.href} className="inline-flex min-h-11 items-center gap-2 font-medium">{course.previewOpen}<ArrowRight size={17} aria-hidden="true" /></Link><p className="text-sm text-muted-foreground">{course.previewNote}</p></section>}
      </div>
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:row-span-2"><Card><CardHeader><h2 className="text-xl font-semibold">{t.offerTitle}</h2></CardHeader><CardContent className="space-y-5"><CourseMemberAccess locale={locale} course={result.data} activityHrefs={activityHrefs} />{offersResult && <CourseOffers locale={locale} result={offersResult} />}</CardContent></Card>{result.data.access === "PROTECTED" && <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t.protectedBody}</p>}</aside>
      <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-2">
      <div className="grid gap-8 border-y border-border py-7 sm:grid-cols-2">{[{ title: t.audience, values: result.data.metadata.audience }, { title: t.prerequisites, values: result.data.prerequisites }].map(section => <section key={section.title} className="space-y-3"><h2 className="text-xl font-semibold">{section.title}</h2>{section.values.length ? <ul lang={result.data.locale} className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{section.values.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t.missingInfo}</p>}</section>)}</div>
      <section data-course-programme className="space-y-4"><h2 className="text-2xl font-semibold tracking-tight">{t.programme}</h2><p className="text-sm leading-relaxed text-muted-foreground">{course.programmeLead}</p>{result.data.curriculum.length ? <Programme locale={locale} nodes={result.data.curriculum} activityHrefs={activityHrefs} /> : <p className="text-muted-foreground">{t.noProgramme}</p>}</section>
      <section className="space-y-3"><h2 className="text-2xl font-semibold tracking-tight">{course.practice}</h2><h3 className="font-semibold">{t.evaluation}</h3><p lang={result.data.metadata.evaluationDescription ? result.data.locale : locale} className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{result.data.metadata.evaluationDescription || t.missingInfo}</p></section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">{t.tools}</h2>{result.data.metadata.tools.length ? <ul className="space-y-2 text-sm leading-relaxed">{result.data.metadata.tools.map((tool, index) => <li key={index} lang={result.data.locale}>{tool.url ? <Link href={tool.url}>{tool.name}</Link> : tool.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t.missingInfo}</p>}</section>
      <section className="space-y-6 border-y border-border py-7"><h2 className="text-xl font-semibold">{course.information}</h2><dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">{[{ label: course.author, value: course.authorUnknown }, { label: course.format, value: course.formatUnknown }, { label: course.duration, value: result.data.estimatedMinutes === null ? t.durationUnknown : `${result.data.estimatedMinutes} ${t.minutes}` }].map(item => <div key={item.label} className="space-y-1"><dt className="font-medium">{item.label}</dt><dd className="text-muted-foreground">{item.value}</dd></div>)}</dl><CourseLanguages locale={locale} resource={result.data} languageLinks={languageLinks} /></section>
      {result.data.metadata.faq.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-semibold tracking-tight">{t.faq}</h2><Accordion items={result.data.metadata.faq.map((item, index) => ({ value: `faq-${index}`, title: <span lang={result.data.locale}>{item.question}</span>, content: <p lang={result.data.locale} className="whitespace-pre-wrap leading-relaxed">{item.answer}</p> }))} /></section>}
      <details className="rounded-input border border-border p-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{course.versionDetails}</summary><div className="space-y-4 pt-4 text-muted-foreground"><p>{t.version} {result.data.versionNumber}</p><p className="flex items-start gap-2"><FileCheck2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{result.data.reviewedAt ? `${t.reviewed} ${new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(result.data.reviewedAt))}` : t.reviewUnknown}</p><p>{course.pinnedProgramme}</p><ProgrammeVersions locale={locale} nodes={result.data.curriculum} /></div></details>
    </div></div>
    {result.data.related.length > 0 && <section className="space-y-5 border-t border-border pt-8"><h2 className="text-2xl font-semibold">{t.related}</h2><ResourceCards locale={locale} resources={result.data.related} returnTo={returnTo} /></section>}
  </>}</div></PublicShell>;
}
