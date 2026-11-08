"use client";

import NextLink from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BookOpen, CircleHelp, FileText, FolderOpen, NotebookPen, UserRound } from "lucide-react";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { Brand, Breadcrumb, FutureItem, LayoutLanguageSwitch, MobileNavigation } from "./layout-parts";

export function LearnerLayout({ locale, children, title, description }: { locale: Locale; children: ReactNode; title?: string; description?: string }) {
  const { common, learning } = getShowcaseDictionary(locale);
  const navigation = <div className="flex h-full flex-col gap-6 py-4">
    <div className="px-3"><Brand locale={locale} /><p className="mt-2 text-[0.8125rem] text-muted-foreground">{common.currentSpace}</p></div>
    <nav aria-label={common.learningNavigation} className="space-y-1">
      <FutureItem locale={locale} label={common.learning} icon={<BookOpen size={19} aria-hidden="true" />} />
      <FutureItem locale={locale} label={common.projects} icon={<FolderOpen size={19} aria-hidden="true" />} />
      <FutureItem locale={locale} label={common.personalMethods} icon={<NotebookPen size={19} aria-hidden="true" />} />
    </nav>
    <nav aria-label={learning.program} className="space-y-2 border-t border-border px-3 pt-5">
      <p className="mb-3 text-[0.8125rem] font-semibold text-muted-foreground">{learning.program}</p>
      <NextLink href={`/${locale}/dev/learning#lesson`} className="flex min-h-11 items-center gap-3 rounded-input bg-brand-soft px-3 py-2 text-sm font-medium text-brand no-underline"><BookOpen size={18} aria-hidden="true" />{learning.lesson}</NextLink>
      <NextLink href={`/${locale}/dev/learning#workshop`} className="flex min-h-11 items-center gap-3 rounded-input px-3 py-2 text-sm text-foreground no-underline hover:bg-surface-hover"><FileText size={18} aria-hidden="true" />{learning.workshop}</NextLink>
    </nav>
    <nav aria-label={common.account} className="mt-auto space-y-1 border-t border-border pt-4">
      <FutureItem locale={locale} label={common.account} icon={<UserRound size={19} aria-hidden="true" />} />
      <FutureItem locale={locale} label={common.help} icon={<CircleHelp size={19} aria-hidden="true" />} />
    </nav>
  </div>;
  return <div className="grid bg-background lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
    <aside className="hidden border-r border-border bg-surface-subtle px-3 lg:block">{navigation}</aside>
    <div className="min-w-0">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2"><MobileNavigation locale={locale} title={common.currentSpace}>{navigation}</MobileNavigation><Breadcrumb locale={locale} parent={common.course} current={learning.breadcrumb} /></div>
        <LayoutLanguageSwitch locale={locale} space="learning" />
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[var(--content-max)] px-4 py-8 outline-none sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3"><p className="text-sm font-medium text-brand">{common.localWorkspace}</p><h1 className="max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">{title ?? learning.title}</h1><p className="max-w-3xl text-muted-foreground">{description ?? learning.description}</p></div>
        {children}
        <div className="mt-10 border-t border-border pt-5"><NextLink href={`/${locale}/dev/public`} className="inline-flex min-h-11 items-center gap-2 text-sm text-link"><ArrowLeft size={17} aria-hidden="true" />{common.backPublic}</NextLink></div>
      </main>
    </div>
  </div>;
}
