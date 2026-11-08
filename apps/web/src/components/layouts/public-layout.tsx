"use client";

import type { ReactNode } from "react";
import NextLink from "next/link";
import { BookOpen, Compass, FileText, UserRound } from "lucide-react";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";
import { Brand, FutureItem, LayoutLanguageSwitch, MobileNavigation } from "./layout-parts";
import { getPublicDictionary } from "@/lib/i18n/public";
import { publicCatalogueHref, type LanguageLinks } from "@/lib/public/routes";
import { offersPath } from "@/lib/commerce/routes";
import { getCommerceDictionary } from "@/lib/i18n/commerce";

export function PublicLayout({ locale, children, product }: { locale: Locale; children: ReactNode; product?: { languageLinks: LanguageLinks } }) {
  if (product) return <ProductPublicLayout locale={locale} languageLinks={product.languageLinks}>{children}</ProductPublicLayout>;
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

function ProductPublicLayout({ locale, languageLinks, children }: { locale: Locale; languageLinks: LanguageLinks; children: ReactNode }) {
  const t = getPublicDictionary(locale);
  const nav = [{ label: t.catalogue, href: publicCatalogueHref(locale) }, { label: t.methods, href: `${publicCatalogueHref(locale)}?type=METHOD_TEMPLATE&locale=${locale}` }, { label: t.guides, href: `${publicCatalogueHref(locale)}?type=GUIDE&locale=${locale}` }, { label: getCommerceDictionary(locale).offers, href: offersPath(locale) }, { label: t.account, href: locale === "fr" ? "/fr/compte" : "/en/account" }];
  const brand = <NextLink href={`/${locale}`} className="inline-flex min-h-11 items-center text-base font-semibold tracking-tight no-underline sm:text-lg">ChatGPT Courses<span aria-hidden="true" className="text-brand">.</span></NextLink>;
  const navigation = <nav aria-label={t.navigation} className="grid gap-1">{nav.map((item) => <NextLink key={item.href} href={item.href} className="flex min-h-11 items-center rounded-input px-3 text-sm font-medium no-underline hover:bg-surface-hover">{item.label}</NextLink>)}</nav>;
  return <div className="bg-background text-foreground">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-[var(--content-max)] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
      {brand}<nav aria-label={t.navigation} className="hidden items-center gap-5 lg:flex">{nav.map((item) => <NextLink key={item.href} href={item.href} className="inline-flex min-h-11 items-center text-sm font-medium no-underline hover:text-brand">{item.label}</NextLink>)}</nav>
      <div className="flex items-center gap-1"><nav aria-label={t.language} className="flex gap-1">{(["fr", "en"] as const).map((language) => <NextLink key={language} href={languageLinks[language].href} lang={language} hrefLang={language} aria-current={locale === language ? "page" : undefined} aria-label={`${language.toUpperCase()}${languageLinks[language].available ? "" : ` · ${t.missingLanguage}`}`} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-input px-2 text-sm font-medium no-underline ${locale === language ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-surface-hover"}`}>{language.toUpperCase()}{!languageLinks[language].available && <span aria-hidden="true">*</span>}</NextLink>)}</nav><MobileNavigation locale={locale} title={t.navigation} description={t.footer}>{navigation}</MobileNavigation></div>
    </div></header>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-[var(--content-max)] px-4 outline-none sm:px-6 lg:px-8">{children}</main>
    <footer className="mt-16 border-t border-border bg-surface-subtle"><div className="mx-auto grid max-w-[var(--content-max)] gap-6 px-4 py-8 sm:px-6 md:grid-cols-2 lg:px-8"><div>{brand}<p className="mt-2 max-w-lg text-sm text-muted-foreground">{t.footer}</p></div><p className="max-w-lg text-sm leading-relaxed text-muted-foreground">{t.footerNote}</p></div></footer>
  </div>;
}
