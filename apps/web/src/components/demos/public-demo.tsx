import { ArrowRight, ClipboardCheck, FileText, Check } from "lucide-react";
import { PublicLayout } from "@/components/layouts";
import { Accordion, Link } from "@/components/ui";
import { CourseCard } from "@/components/domain";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { proposalFixture } from "./fixtures";

export function PublicDemo({ locale }: { locale: Locale }) {
  const { common, public: text } = getShowcaseDictionary(locale);
  const fixture = proposalFixture[locale];
  return <div data-showcase-fixture="public"><PublicLayout locale={locale}>
    <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
      <div>
        <p className="mb-5 text-sm font-medium text-brand">{text.eyebrow}</p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">{text.title}</h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{text.intro}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3"><Link href={`/${locale}/dev/learning#workshop`} variant="button" className="w-full max-w-full gap-2 text-left sm:w-auto">{text.primary}<ArrowRight size={18} className="shrink-0" aria-hidden="true" /></Link><Link href="#approach" className="inline-flex min-h-11 items-center px-2 text-sm">{text.secondary}</Link></div>
        <p className="mt-4 max-w-md text-[0.8125rem] text-muted-foreground">{text.noAccount}</p>
      </div>
      <div className="min-w-0 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3 text-sm text-muted-foreground"><FileText size={19} className="text-brand" aria-hidden="true" /><span>{text.previewLabel}</span></div>
        <article className="rounded-panel border border-border bg-surface p-5 sm:p-8">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">{text.previewTag}</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{text.previewTitle}</h2>
          <div className="mt-6 space-y-5">
            {[[text.previewObjective, text.previewObjectiveText], [text.previewScope, text.previewScopeText], [text.previewNext, text.previewNextText]].map(([title, body]) => <div key={title}><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p></div>)}
          </div>
          <p className="mt-6 flex items-start gap-2 border-t border-border pt-4 text-[0.8125rem] text-brand"><ClipboardCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{text.previewControl}</p>
        </article>
      </div>
    </section>
    <section id="approach" aria-labelledby="approach-title" className="scroll-mt-6 border-y border-border py-10 sm:py-12">
      <div className="max-w-2xl"><h2 id="approach-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.approachTitle}</h2><p className="mt-3 text-muted-foreground">{text.approachIntro}</p></div>
      <ol className="mt-8 grid gap-7 sm:grid-cols-2 lg:grid-cols-4">{text.steps.map((step, index) => <li key={step.title} className="border-l-2 border-brand pl-4"><span className="text-[0.8125rem] font-medium text-brand">{String(index + 1).padStart(2, "0")}</span><h3 className="mt-2 text-lg font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p></li>)}</ol>
    </section>
    <section aria-labelledby="sample-course-title" className="grid gap-8 py-12 sm:py-16 lg:grid-cols-2 lg:gap-12">
      <div className="space-y-5"><p className="text-[0.8125rem] font-medium text-muted-foreground">{common.demo}</p><h2 id="sample-course-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{text.courseTitle}</h2><p className="max-w-lg text-muted-foreground">{text.courseIntro}</p>
        <div className="rounded-panel bg-surface-subtle p-5 sm:p-6"><h3 className="text-base font-semibold">{text.usefulTitle}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text.usefulBody}</p><ul className="mt-5 space-y-3">{text.usefulItems.map((item) => <li key={item} className="flex items-start gap-2 text-sm"><Check size={17} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />{item}</li>)}</ul></div>
      </div>
      <CourseCard locale={locale} title={fixture.title} description={fixture.description} outcome={text.outcome} category={text.courseCategory} href={`/${locale}/dev/learning#lesson`} access="free" />
    </section>
    <section aria-labelledby="public-faq-title" className="mx-auto max-w-[var(--reading-max)] pb-4"><h2 id="public-faq-title" className="mb-5 text-2xl font-semibold tracking-tight">{text.faqTitle}</h2><Accordion items={text.faqs.map((item) => ({ value: item.value, title: item.title, content: <p>{item.body}</p> }))} /></section>
  </PublicLayout></div>;
}
