"use client";

import { AdminLayout } from "@/components/layouts";
import { Badge, FormField, Link, StatusMessage, TextArea } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ContentDocument, ContentView } from "@/lib/api/generated/types.gen";
import { safeContentLink } from "@/lib/api/cms-validation";
import { cmsPath } from "@/lib/cms/routes";
import { getCmsDictionary } from "@/lib/i18n/cms";
import type { Locale } from "@/lib/i18n/locales";
import { CmsError, cmsNavigation, formatCmsInstant } from "./parts";

export function DocumentPreview({ value, locale }: { value: ContentDocument; locale: Locale }) {
  const text = getCmsDictionary(locale);
  return <article className="max-w-[var(--reading-max)] space-y-7 break-words">
    <section className="space-y-3"><h2 className="text-xl font-semibold">{text.objective}</h2><p className="whitespace-pre-wrap">{value.objective}</p><h2 className="text-xl font-semibold">{text.expectedResult}</h2><p className="whitespace-pre-wrap">{value.expectedResult}</p></section>
    {value.prerequisites.length > 0 && <section><h2 className="text-xl font-semibold">{text.prerequisites}</h2><ul className="mt-3 list-disc space-y-2 pl-5">{value.prerequisites.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
    <div className="space-y-5">{value.blocks.map((block, index) => {
      if (block.type === "HEADING") return <h2 key={index} className="text-2xl font-semibold">{block.text}</h2>;
      if (block.type === "LIST") return <ul key={index} className="list-disc space-y-2 pl-5">{block.text.split("\n").map((item, position) => <li key={position}>{item}</li>)}</ul>;
      if (block.type === "CODE") return <pre key={index} className="whitespace-pre-wrap break-words rounded-input bg-surface-subtle p-4 text-sm"><code>{block.text}</code></pre>;
      if (block.type === "CALLOUT") return <aside key={index} className="whitespace-pre-wrap rounded-input border-l-2 border-brand bg-brand-soft p-4">{block.text}</aside>;
      if (block.type === "LINK") { const href = safeContentLink(block.url); return <p key={index}>{href ? <a href={href} rel="noreferrer" className="rounded-input text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{block.text}</a> : block.text}</p>; }
      return <p key={index} className="whitespace-pre-wrap leading-relaxed">{block.text}</p>;
    })}</div>
    {value.blocks.length === 0 && <p className="text-muted-foreground">{text.noContent}</p>}
    {value.exercise && <section className="space-y-3"><h2 className="text-xl font-semibold">{text.instructions}</h2><p className="whitespace-pre-wrap">{value.exercise.instructions}</p><h2 className="text-xl font-semibold">{text.correction}</h2><p className="whitespace-pre-wrap">{value.exercise.correction}</p></section>}
    {value.quiz.length > 0 && <section className="space-y-5"><h2 className="text-xl font-semibold">{text.quiz}</h2>{value.quiz.map((question) => <div key={question.key} className="space-y-3 rounded-panel border border-border p-4"><h3 className="font-semibold">{question.prompt}</h3><ol className="list-decimal space-y-2 pl-5">{question.options.map((item, index) => <li key={index}>{item}</li>)}</ol><p className="text-sm font-medium">{text.correctOption}: {question.correctOption + 1}</p><p className="whitespace-pre-wrap text-sm">{question.explanation}</p><p className="text-sm">{text.points}: {question.points}</p></div>)}</section>}
    {value.rubric.length > 0 && <section className="space-y-3"><h2 className="text-xl font-semibold">{text.rubric}</h2><p className="text-sm text-muted-foreground">{text.declared}</p><ul className="space-y-3">{value.rubric.map((criterion) => <li key={criterion.key} className="rounded-input border border-border p-4">{criterion.label}<p className="mt-2 text-sm">{text.points}: {criterion.points}{criterion.blocking ? ` · ${text.blocking}` : ""}</p></li>)}</ul></section>}
    {value.media.length > 0 && <section className="space-y-3"><h2 className="text-xl font-semibold">{text.media}</h2><StatusMessage tone="warning">{text.mediaUnavailable}</StatusMessage><ul className="space-y-3">{value.media.map((media, index) => <li key={index} className="rounded-input border border-border p-4"><p>{media.label}</p><p className="mt-1 text-sm">{text.mediaKind[media.kind]} · {media.assetId}</p></li>)}</ul></section>}
  </article>;
}

export function ContentPreview({ locale, initial, permissions }: { locale: Locale; initial: AuthResult<ContentView>; permissions: string[] }) {
  const text = getCmsDictionary(locale);
  const content = initial.ok ? initial.data : null;
  return <AdminLayout locale={locale} title={content?.title ?? text.preview} description={text.previewHelp} product={cmsNavigation(locale, content?.id, "preview")}>
    {!initial.ok ? <CmsError error={initial.error} locale={locale} returnTo={cmsPath(locale)} /> : <div className="space-y-7">
      <div className="flex flex-wrap gap-3"><Badge>{text.state[initial.data.state]}</Badge><Badge>{initial.data.locale.toUpperCase()}</Badge><span className="text-sm text-muted-foreground">{text.version} {initial.data.versionNumber}</span></div>
      <p className="max-w-[var(--reading-max)] whitespace-pre-wrap text-muted-foreground">{initial.data.summary}</p>
      <div className="flex flex-wrap gap-4">{permissions.includes("content.write") && <Link prefetch={false} href={cmsPath(locale, initial.data.id)}>{text.edit}</Link>}<Link prefetch={false} href={cmsPath(locale)}>{text.back}</Link></div>
      <p className="text-sm text-muted-foreground">{text.lastReview}: {formatCmsInstant(initial.data.verifiedAt, locale)}</p>
      {initial.data.document ? <DocumentPreview value={initial.data.document} locale={locale} /> : <div className="space-y-4"><StatusMessage tone="warning">{text.legacyHelp}</StatusMessage>{initial.data.legacyBody && <FormField id="cms-legacy-preview" label={text.legacy}><TextArea readOnly value={initial.data.legacyBody} rows={12} /></FormField>}</div>}
    </div>}
  </AdminLayout>;
}
