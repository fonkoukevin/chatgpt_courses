"use client";

import { PublicBreadcrumbs } from "./breadcrumbs";
import { CourseMemberAccess } from "@/components/learning/course-access";
import { Accordion, Badge, Button, Card, CardContent, CardHeader, Link, StatusMessage } from "@/components/ui";
import type { CurriculumNode } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getPublicDictionary } from "@/lib/i18n/public";
import { AvailabilityNotice, BackToCatalogue, DetailHeading, PublicApiError, PublicShell, ResourceCards, TranslationAvailability, type DetailProps } from "./parts";

function Programme({ locale, nodes, activityHrefs }: { locale: Locale; nodes: CurriculumNode[]; activityHrefs: Record<string, string> }) {
  const t = getPublicDictionary(locale);
  return <ol className="space-y-3">{nodes.map((node) => <li key={node.versionId} className="min-w-0 rounded-input border border-border p-4"><div className="flex flex-wrap gap-2"><Badge>{t[node.kind]}</Badge><Badge>{t.version} {node.versionNumber}</Badge>{node.access && <Badge>{t[node.access]}</Badge>}</div>
    <h3 lang={node.title ? node.locale : locale} className="mt-3 break-words font-semibold">{node.availability === "PUBLISHED" && activityHrefs[node.versionId] ? <Link href={activityHrefs[node.versionId]}>{node.title ?? t.ACTIVITY}</Link> : node.title ?? t.unavailableTitle}</h3>{node.summary && <p lang={node.locale} className="mt-2 text-sm leading-relaxed text-muted-foreground">{node.summary}</p>}{node.availability !== "PUBLISHED" && <p className="mt-2 text-sm text-warning">{t[node.availability]}</p>}{node.estimatedMinutes !== null && <p className="mt-2 text-sm text-muted-foreground">{node.estimatedMinutes} {t.minutes}</p>}{node.children.length > 0 && <div className="mt-4"><Programme locale={locale} nodes={node.children} activityHrefs={activityHrefs} /></div>}</li>)}</ol>;
}
function firstFreeActivity(nodes: CurriculumNode[], activityHrefs: Record<string, string>): string | undefined {
  for (const node of nodes) {
    if (node.availability !== "PUBLISHED") continue;
    if (node.kind === "ACTIVITY" && node.access === "FREE" && activityHrefs[node.versionId]) return activityHrefs[node.versionId];
    const child = firstFreeActivity(node.children, activityHrefs); if (child) return child;
  }
}
export function PublicCourse({ locale, result, languageLinks, activityHrefs = {}, returnTo, breadcrumbs }: DetailProps) {
  const t = getPublicDictionary(locale);
  const trialHref = result.ok ? firstFreeActivity(result.data.curriculum, activityHrefs) : undefined;
  return <PublicShell locale={locale} languageLinks={languageLinks}><div className="space-y-8 py-8 sm:py-12"><PublicBreadcrumbs trail={breadcrumbs} /><BackToCatalogue locale={locale} returnTo={returnTo} />{!result.ok ? <PublicApiError locale={locale} result={result} standalone /> : result.data.availability !== "PUBLISHED" ? <><AvailabilityNotice locale={locale} resource={result.data} /><TranslationAvailability locale={locale} resource={result.data} languageLinks={languageLinks} /></> : <>
    <DetailHeading locale={locale} resource={result.data} />{trialHref && <Button asChild><Link href={trialHref} className="no-underline">{t.try}</Link></Button>}<TranslationAvailability locale={locale} resource={result.data} languageLinks={languageLinks} />
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="min-w-0 space-y-8">
      <section className="space-y-3"><h2 className="text-2xl font-semibold">{t.expected}</h2><p lang={result.data.expectedResult ? result.data.locale : locale} className="whitespace-pre-wrap leading-relaxed">{result.data.expectedResult || t.missingInfo}</p><h3 className="pt-2 font-semibold">{t.objective}</h3><p lang={result.data.objective ? result.data.locale : locale} className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{result.data.objective || t.missingInfo}</p></section>
      <div className="grid gap-6 sm:grid-cols-2">{[{ title: t.audience, values: result.data.metadata.audience }, { title: t.prerequisites, values: result.data.prerequisites }].map((section) => <section key={section.title} className="space-y-3"><h2 className="text-xl font-semibold">{section.title}</h2>{section.values.length ? <ul lang={result.data.locale} className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{section.values.map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t.missingInfo}</p>}</section>)}</div>
      <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.programme}</h2>{result.data.curriculum.length ? <Programme locale={locale} nodes={result.data.curriculum} activityHrefs={activityHrefs} /> : <p className="text-muted-foreground">{t.noProgramme}</p>}</section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">{t.evaluation}</h2><p lang={result.data.metadata.evaluationDescription ? result.data.locale : locale} className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{result.data.metadata.evaluationDescription || t.missingInfo}</p></section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">{t.tools}</h2>{result.data.metadata.tools.length ? <ul className="space-y-2">{result.data.metadata.tools.map((tool, index) => <li key={index} lang={result.data.locale}>{tool.url ? <Link href={tool.url}>{tool.name}</Link> : tool.name}</li>)}</ul> : <p className="text-muted-foreground">{t.missingInfo}</p>}</section>
      {result.data.metadata.faq.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-semibold">{t.faq}</h2><Accordion items={result.data.metadata.faq.map((item, index) => ({ value: `faq-${index}`, title: <span lang={result.data.locale}>{item.question}</span>, content: <p lang={result.data.locale} className="whitespace-pre-wrap leading-relaxed">{item.answer}</p> }))} /></section>}
    </div><Card><CardHeader><h2 className="text-xl font-semibold">{t.offerTitle}</h2></CardHeader><CardContent className="space-y-4"><CourseMemberAccess locale={locale} course={result.data} activityHrefs={activityHrefs} /><p className="text-sm text-muted-foreground">{result.data.estimatedMinutes === null ? t.durationUnknown : `${result.data.estimatedMinutes} ${t.minutes}`}</p><p className="text-sm text-muted-foreground">{result.data.metadata.level ? t[result.data.metadata.level] : t.levelUnknown}</p>{result.data.access === "PROTECTED" && <StatusMessage>{t.protectedBody}</StatusMessage>}</CardContent></Card></div>
    {result.data.related.length > 0 && <section className="space-y-5"><h2 className="text-2xl font-semibold">{t.related}</h2><ResourceCards locale={locale} resources={result.data.related} returnTo={returnTo} /></section>}
  </>}</div></PublicShell>;
}
