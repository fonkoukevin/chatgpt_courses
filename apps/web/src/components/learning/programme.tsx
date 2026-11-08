"use client";

import { useState } from "react";
import { ListTree } from "lucide-react";
import { Badge, Button, Link, Sheet } from "@/components/ui";
import type { CurriculumNode, ResourceDetail } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getLearningDictionary } from "@/lib/i18n/learning";
import { getPublicDictionary } from "@/lib/i18n/public";
import { programmeActivities } from "@/lib/learning/programme";

export type ActivityProgrammeContext = { course: ResourceDetail; activityHrefs: Record<string, string> };

function ProgrammeTree({ locale, nodes, currentVersionId, activityHrefs, onNavigate }: {
  locale: Locale; nodes: CurriculumNode[]; currentVersionId: string;
  activityHrefs: Record<string, string>; onNavigate?: () => void;
}) {
  const t = getLearningDictionary(locale), publicCopy = getPublicDictionary(locale);
  return <ol className="space-y-3">{nodes.map((node, index) => {
    const current = node.kind === "ACTIVITY" && node.versionId === currentVersionId;
    const href = node.availability === "PUBLISHED" ? activityHrefs[node.versionId] : undefined;
    return <li key={`${node.versionId}-${index}`} className="min-w-0">
      <div className={`space-y-2 rounded-input border p-3 ${current ? "border-brand/30 bg-brand-soft" : "border-border bg-surface"}`}>
        <p className="flex flex-wrap gap-2 text-[0.8125rem] text-muted-foreground"><span>{publicCopy[node.kind]}</span><span>{publicCopy.version} {node.versionNumber}</span></p>
        {href ? <Link href={href} prefetch={false} aria-current={current ? "page" : undefined} onClick={onNavigate} className="inline-flex min-h-11 max-w-full items-center break-words text-sm font-medium">{node.title ?? publicCopy.ACTIVITY}</Link>
          : <p className="break-words text-sm font-medium">{node.title ?? publicCopy.unavailableTitle}</p>}
        {current && <Badge tone="brand">{t.currentActivity}</Badge>}
        {node.availability !== "PUBLISHED" && <p className="text-sm text-warning">{publicCopy[node.availability]}</p>}
        {node.access === "PROTECTED" && <p className="text-sm text-muted-foreground">{t.protected}</p>}
      </div>
      {node.children.length > 0 && <div className="mt-3 border-l border-border pl-3"><ProgrammeTree locale={locale} nodes={node.children} currentVersionId={currentVersionId} activityHrefs={activityHrefs} onNavigate={onNavigate} /></div>}
    </li>;
  })}</ol>;
}

export function ActivityProgramme({ locale, programme, currentVersionId }: { locale: Locale; programme: ActivityProgrammeContext; currentVersionId: string }) {
  const t = getLearningDictionary(locale), [open, setOpen] = useState(false);
  const tree = <ProgrammeTree locale={locale} nodes={programme.course.curriculum} currentVersionId={currentVersionId} activityHrefs={programme.activityHrefs} onNavigate={() => setOpen(false)} />;
  return <>
    <div className="lg:hidden"><Sheet open={open} onOpenChange={setOpen} title={t.programme} description={t.programmeDescription} closeLabel={t.close} trigger={<Button variant="secondary" className="max-w-full whitespace-normal"><ListTree size={18} aria-hidden="true" />{t.openProgramme}</Button>}>
      <nav aria-label={t.programme} className="space-y-4"><p className="break-words font-medium">{programme.course.title}</p>{tree}</nav>
    </Sheet></div>
    <aside className="hidden min-w-0 space-y-5 lg:block"><div className="space-y-2"><h2 className="text-lg font-semibold">{t.programme}</h2><p className="break-words text-sm text-muted-foreground">{programme.course.title}</p></div><nav aria-label={t.programme}>{tree}</nav></aside>
  </>;
}

export function ActivityNavigation({ locale, programme, currentVersionId }: { locale: Locale; programme: ActivityProgrammeContext; currentVersionId: string }) {
  const t = getLearningDictionary(locale), activities = programmeActivities(programme.course.curriculum);
  const index = activities.findIndex(({ node }) => node.versionId === currentVersionId);
  if (index < 0) return null;
  const current = activities[index], siblings = activities.filter(({ module }) => module?.versionId === current.module?.versionId);
  const position = siblings.findIndex(({ node }) => node.versionId === currentVersionId) + 1;
  return <div className="space-y-4 border-t border-border pt-5"><p className="text-sm text-muted-foreground">{current.module?.title && <span className="break-words">{current.module.title} · </span>}{t.activityPosition} {position} {t.of} {siblings.length}</p><nav aria-label={t.programme} className="flex flex-wrap justify-between gap-4">{[
    { value: activities[index - 1], label: t.previous }, { value: activities[index + 1], label: t.next },
  ].map(({ value, label }) => value && <div key={label} className="min-w-0 max-w-full space-y-1">{value.node.availability === "PUBLISHED" && programme.activityHrefs[value.node.versionId] ? <Link href={programme.activityHrefs[value.node.versionId]} prefetch={false} className="inline-flex min-h-11 items-center text-sm font-medium">{label}</Link> : <p className="text-sm text-muted-foreground">{label} · {t.contentUnavailable}</p>}<p className="max-w-xs break-words text-sm text-muted-foreground">{value.node.title}</p></div>)}</nav></div>;
}
