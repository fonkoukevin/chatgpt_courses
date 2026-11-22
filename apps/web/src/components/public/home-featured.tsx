import { ArrowRight, Check, FileText } from "lucide-react";
import { Accordion, Button, Link } from "@/components/ui";
import type { MetadataFaq } from "@/lib/api/generated/types.gen";
import type { Locale } from "@/lib/i18n/locales";
import { getHomeDictionary } from "@/lib/i18n/home";
import type { HomeCourse } from "@/lib/public/home-course";

export function FeaturedCourseHome({ locale, course, editorialPreview, faq }: { locale: Locale; course: HomeCourse; editorialPreview: boolean; faq: MetadataFaq[] }) {
  const t = getHomeDictionary(locale);
  return <div data-home-single-course>
    <section className={`grid gap-10 py-9 sm:py-14 lg:items-center lg:gap-14 ${editorialPreview || course.expectedResult ? "lg:grid-cols-[1.1fr_1fr]" : "max-w-3xl"}`}>
      <div className="min-w-0 space-y-5">
        {editorialPreview && <p data-home-editorial-preview className="inline-flex rounded-input border border-border bg-surface-subtle px-3 py-1 text-[0.8125rem] font-medium text-muted-foreground">{t.preview}</p>}
        <p className="text-sm font-medium text-brand">{t.eyebrow}</p>
        <h1 className="max-w-2xl break-words text-[2rem] font-semibold leading-[1.12] tracking-tight sm:text-5xl">{course.title}</h1>
        {(course.objective || course.summary) && <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{course.objective || course.summary}</p>}
        {course.audience.length > 0 && <p className="max-w-xl text-sm leading-relaxed"><span className="font-medium">{t.audience} </span>{course.audience.join(" ")}</p>}
        <div className="flex flex-wrap gap-3 pt-1">
          {course.trial && <Button asChild><Link data-home-primary href={course.trial.href} className="no-underline">{t.trial}<ArrowRight size={18} aria-hidden="true" /></Link></Button>}
          <Button variant={course.trial ? "secondary" : "primary"} asChild><Link data-home-course href={course.href} className="no-underline">{t.course}</Link></Button>
        </div>
        {course.trial && <p className="text-sm text-muted-foreground">{t.anonymous}</p>}
      </div>
      {editorialPreview ? <article data-home-demo className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface-subtle">
        <div className="space-y-2 border-b border-border px-5 py-5 sm:px-7"><p className="text-[0.8125rem] font-medium text-brand">{t.demoLabel}</p><h2 className="text-xl font-semibold tracking-tight">{t.demoTitle}</h2></div>
        <div className="space-y-5 p-5 sm:p-7">
          <div className="space-y-2"><p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">{t.briefLabel}</p><p className="text-sm leading-relaxed">{t.brief}</p></div>
          <div className="space-y-3 rounded-input border border-border bg-surface p-4"><p className="flex items-center gap-2 text-[0.8125rem] font-medium text-brand"><FileText size={16} aria-hidden="true" />{t.outputLabel}</p><p className="text-base leading-relaxed">{t.output}</p></div>
          <div className="flex items-start gap-3"><Check className="mt-1 shrink-0 text-brand" size={18} aria-hidden="true" /><div className="space-y-1"><h3 className="text-sm font-semibold">{t.checkLabel}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t.check}</p></div></div>
          <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{t.demoNote}</p>
        </div>
      </article> : course.expectedResult && <section className="space-y-4 rounded-panel border border-border bg-surface-subtle p-6 sm:p-8"><FileText className="text-brand" size={24} aria-hidden="true" /><h2 className="text-2xl font-semibold">{t.result}</h2><p className="leading-relaxed">{course.expectedResult}</p></section>}
    </section>
    <ol className="grid gap-4 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4">{t.steps.map((step, index) => <li key={step} className="flex items-center gap-3 text-sm"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">{index + 1}</span><span>{step}</span></li>)}</ol>
    {course.modules.length > 0 && <section className="grid gap-8 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div className="space-y-5"><h2 className="max-w-sm text-3xl font-semibold tracking-tight">{t.programme}</h2><p className="max-w-md leading-relaxed text-muted-foreground">{course.expectedResult || t.programmeLead}</p>{course.prerequisites.length > 0 && <div className="space-y-2 pt-3"><h3 className="font-semibold">{t.prerequisites}</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">{course.prerequisites.map(item => <li key={item}>{item}</li>)}</ul></div>}<Link href={course.href} className="inline-flex min-h-11 items-center gap-2 font-medium">{t.course}<ArrowRight size={17} aria-hidden="true" /></Link></div>
      <ol className="divide-y divide-border border-y border-border">{course.modules.map((module, index) => <li key={`${index}-${module.title}`} className="flex gap-4 py-5"><span className="pt-1 text-sm font-medium text-brand">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 space-y-2"><h3 className="text-lg font-semibold leading-snug">{module.title}</h3>{module.summary && <p className="text-sm leading-relaxed text-muted-foreground">{module.summary}</p>}</div></li>)}</ol>
    </section>}
    {faq.length > 0 && <section className="max-w-3xl space-y-5 border-t border-border py-10"><h2 className="text-2xl font-semibold tracking-tight">{t.faq}</h2><Accordion items={faq.map((item, index) => ({ value: `home-course-faq-${index}`, title: item.question, content: <p className="whitespace-pre-wrap leading-relaxed">{item.answer}</p> }))} /></section>}
  </div>;
}
