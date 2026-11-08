"use client";

import type { ReactNode } from "react";
import { BookOpen, Compass, FileText, UserRound } from "lucide-react";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { Brand, FutureItem, LayoutLanguageSwitch, MobileNavigation } from "./layout-parts";

export function PublicLayout({ locale, children }: { locale: Locale; children: ReactNode }) {
  const text = getShowcaseDictionary(locale).common;
  const navigation = <nav aria-label={text.publicNavigation} className="space-y-1">
    <FutureItem locale={locale} label={text.catalogue} icon={<Compass size={19} aria-hidden="true" />} />
    <FutureItem locale={locale} label={text.methods} icon={<BookOpen size={19} aria-hidden="true" />} />
    <FutureItem locale={locale} label={text.guides} icon={<FileText size={19} aria-hidden="true" />} />
    <FutureItem locale={locale} label={text.account} icon={<UserRound size={19} aria-hidden="true" />} />
  </nav>;
  return <div className="bg-background text-foreground">
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-18 max-w-[var(--content-max)] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6 lg:px-8">
        <Brand locale={locale} />
        <nav aria-label={text.publicNavigation} className="hidden items-center gap-5 lg:flex">
          {[text.catalogue, text.methods, text.guides].map((label) => <span key={label} className="text-sm text-muted-foreground"><span className="block">{label}</span><span className="block text-[0.8125rem]">{text.development}</span></span>)}
        </nav>
        <div className="flex items-center gap-1"><LayoutLanguageSwitch locale={locale} space="public" /><MobileNavigation locale={locale}>{navigation}</MobileNavigation></div>
        <div className="hidden lg:block"><FutureItem label={text.account} locale={locale} icon={<UserRound size={18} aria-hidden="true" />} /></div>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-[var(--content-max)] px-4 outline-none sm:px-6 lg:px-8">{children}</main>
    <footer className="mt-16 border-t border-border bg-surface-subtle">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:justify-between lg:px-8">
        <div className="space-y-2"><Brand locale={locale} /><p className="text-sm text-muted-foreground">{text.footer}</p></div>
        <p className="max-w-md text-[0.8125rem] text-muted-foreground">{text.footerNote}</p>
      </div>
    </footer>
  </div>;
}
