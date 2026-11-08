"use client";

import { useState } from "react";
import { BookOpen, FileText, HelpCircle, PenLine } from "lucide-react";
import { LearnerLayout } from "@/components/layouts";
import { MethodBuilder, ProgressSummary, RubricChecklist, SaveStatus } from "@/components/domain";
import { Button, ConfirmationDialog, FormField, Sheet, Tabs, TextArea } from "@/components/ui";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { proposalFixture } from "./fixtures";

export function LearningDemo({ locale }: { locale: Locale }) {
  const { common, learning: text } = getShowcaseDictionary(locale);
  const fixture = proposalFixture[locale];
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  return <div data-showcase-fixture="learning"><LearnerLayout locale={locale}>
    <div className="mb-8 rounded-panel border border-border bg-surface-subtle p-5 sm:p-6"><ProgressSummary locale={locale} label={text.progressLabel} state={{ kind: "ready", completed: 1, total: 6 }} /><p className="mt-3 text-[0.8125rem] text-muted-foreground">{text.progressNote}</p></div>
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <section id="lesson" aria-labelledby="lesson-title" className="scroll-mt-6">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-brand"><BookOpen size={18} aria-hidden="true" />{text.lesson}</p>
          <h2 id="lesson-title" className="text-2xl font-semibold tracking-tight">{text.goalTitle}</h2>
          <p className="mt-4 max-w-[var(--reading-max)] text-muted-foreground">{text.goalBody}</p>
          <p className="mt-5 flex items-start gap-2 rounded-input bg-surface-subtle p-4 text-sm text-muted-foreground"><FileText size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{text.mediaNote}</p>
          <div className="mt-5 xl:hidden"><Sheet title={text.reference} description={text.source} closeLabel={common.close}
            trigger={<Button variant="secondary"><FileText size={18} aria-hidden="true" />{text.reference}</Button>}>
            <div className="space-y-5"><div><h3 className="text-sm font-semibold">{text.provided}</h3><ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted-foreground">{fixture.provided.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3 className="text-sm font-semibold">{text.missing}</h3><ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted-foreground">{fixture.missing.map((item) => <li key={item}>{item}</li>)}</ul></div><p className="text-[0.8125rem] text-muted-foreground">{text.referenceNote}</p></div>
          </Sheet></div>
        </section>
        <section id="workshop" aria-label={text.workshop} className="mt-8 scroll-mt-6 rounded-panel border border-border bg-surface p-4 sm:p-6">
          <p className="mb-5 text-[0.8125rem] text-muted-foreground">{common.fixture}</p>
          <Tabs label={text.tabsLabel} keepMounted items={[
            { value: "brief", label: text.brief, content: <div className="space-y-5"><h2 className="text-xl font-semibold">{text.briefTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{text.briefIntro}</p>
              <dl className="space-y-5">{fixture.facts.map((item) => <div key={item.fact} className="rounded-input bg-surface-subtle p-4"><dt className="text-[0.8125rem] font-medium text-muted-foreground">{text.factLabel}</dt><dd className="mt-1 text-sm font-medium">{item.fact}</dd><dt className="mt-3 text-[0.8125rem] font-medium text-muted-foreground">{text.consequenceLabel}</dt><dd className="mt-1 text-sm">{item.consequence}</dd></div>)}</dl>
              <p className="text-[0.8125rem] text-muted-foreground">{text.source}</p><div className="border-l-2 border-brand pl-4"><h3 className="text-sm font-semibold">{text.questionTitle}</h3><p className="mt-2 text-sm">{text.question}</p></div></div> },
            { value: "write", label: text.write, content: <div className="space-y-5"><h2 className="flex items-center gap-2 text-xl font-semibold"><PenLine size={20} aria-hidden="true" />{text.writeTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{text.writeIntro}</p>
              <FormField id="proposal-draft" label={text.draftLabel} hint={text.draftHint}><TextArea id="proposal-draft" rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.draftPlaceholder} /></FormField>
              <SaveStatus locale={locale} state={{ kind: "local" }} />
              <ConfirmationDialog trigger={<Button variant="ghost" disabled={!draft}>{text.reset}</Button>} title={text.resetTitle} description={text.resetBody} confirmLabel={text.resetConfirm} cancelLabel={text.cancel} onConfirm={() => setDraft("")} destructive />
              <div className="border-t border-border pt-6"><h3 className="mb-4 text-lg font-semibold">{text.methodTitle}</h3><MethodBuilder locale={locale} initialValues={fixture.method} /></div></div> },
            { value: "check", label: text.check, content: <div className="space-y-5"><h2 className="text-xl font-semibold">{text.checkTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{text.checkIntro}</p><RubricChecklist locale={locale} items={fixture.rubric} /></div> },
            { value: "answer", label: text.answer, content: <div className="space-y-5"><h2 className="text-xl font-semibold">{text.answerTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{text.answerIntro}</p>{revealed ? <div className="rounded-input bg-surface-subtle p-5"><p className="mb-3 text-[0.8125rem] font-medium text-muted-foreground">{text.answerLabel}</p><p className="text-sm leading-relaxed">{fixture.answer}</p><p role="status" className="mt-4 text-[0.8125rem] text-muted-foreground">{text.revealed}</p></div> : <Button variant="secondary" onClick={() => setRevealed(true)}>{text.reveal}</Button>}</div> },
          ]} />
        </section>
      </div>
      <aside aria-labelledby="brief-reference-title" className="hidden min-w-0 space-y-6 xl:block">
        <div className="rounded-panel border border-border bg-surface-subtle p-5"><h2 id="brief-reference-title" className="flex items-center gap-2 text-base font-semibold"><FileText size={19} aria-hidden="true" />{text.reference}</h2><h3 className="mt-5 text-sm font-semibold">{text.provided}</h3><ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted-foreground">{fixture.provided.map((item) => <li key={item}>{item}</li>)}</ul><h3 className="mt-5 text-sm font-semibold">{text.missing}</h3><ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted-foreground">{fixture.missing.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="px-1"><h2 className="flex items-center gap-2 text-base font-semibold"><HelpCircle size={19} aria-hidden="true" />{text.reuse}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text.reuseBody}</p><p className="mt-5 text-[0.8125rem] text-muted-foreground">{text.referenceNote}</p></div>
      </aside>
    </div>
  </LearnerLayout></div>;
}
