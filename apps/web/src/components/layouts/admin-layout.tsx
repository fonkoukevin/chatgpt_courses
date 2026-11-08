"use client";

import NextLink from "next/link";
import type { ReactNode } from "react";
import { BookOpen, CircleHelp, ClipboardList, Languages, Layers, Settings, UserRound } from "lucide-react";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { Brand, Breadcrumb, FutureItem, LayoutLanguageSwitch, MobileNavigation } from "./layout-parts";

export function AdminLayout({ locale, children, title, description }: { locale: Locale; children: ReactNode; title?: string; description?: string }) {
  const { common, admin } = getShowcaseDictionary(locale);
  const navigation = <div className="flex h-full flex-col gap-6 py-4">
    <div className="px-3"><Brand locale={locale} /><p className="mt-2 text-[0.8125rem] text-muted-foreground">{common.administration}</p></div>
    <nav aria-label={common.adminNavigation} className="space-y-1">
      <NextLink href={`/${locale}/dev/admin`} aria-current="page" className="flex min-h-12 items-center gap-3 rounded-input bg-brand-soft px-3 py-3 text-sm font-medium text-brand no-underline"><BookOpen size={19} aria-hidden="true" />{common.content}</NextLink>
      <FutureItem locale={locale} label={common.translations} icon={<Languages size={19} aria-hidden="true" />} />
      <FutureItem locale={locale} label={common.offers} icon={<Layers size={19} aria-hidden="true" />} />
      <FutureItem locale={locale} label={common.operations} icon={<ClipboardList size={19} aria-hidden="true" />} />
      <FutureItem locale={locale} label={common.overview} icon={<Settings size={19} aria-hidden="true" />} />
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
        <div className="flex min-w-0 items-center gap-2"><MobileNavigation locale={locale} title={common.administration}>{navigation}</MobileNavigation><Breadcrumb locale={locale} parent={common.administration} current={common.content} /></div>
        <LayoutLanguageSwitch locale={locale} space="admin" />
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[var(--content-max)] px-4 py-8 outline-none sm:px-6 lg:px-8">
        <div className="mb-6 space-y-3"><p className="text-sm font-medium text-brand">{common.administration}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title ?? admin.title}</h1><p className="max-w-3xl text-muted-foreground">{description ?? admin.description}</p></div>
        {children}
      </main>
    </div>
  </div>;
}
