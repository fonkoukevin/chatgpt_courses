"use client";

import NextLink from "next/link";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Sheet } from "@/components/ui";
import { getShowcaseDictionary } from "@/lib/i18n/showcase";
import type { Locale } from "@/lib/i18n/locales";

export type DemoSpace = "public" | "learning" | "admin";

export function Brand({ locale }: { locale: Locale }) {
  return <NextLink href={`/${locale}/dev/public`} className="inline-flex min-h-11 items-center text-base font-semibold tracking-tight text-foreground no-underline sm:text-lg">ChatGPT Courses<span className="text-brand" aria-hidden="true">.</span></NextLink>;
}

export function LayoutLanguageSwitch({ locale, space }: { locale: Locale; space: DemoSpace }) {
  const text = getShowcaseDictionary(locale).common;
  return <nav aria-label={text.language} className="flex shrink-0 items-center gap-1 text-sm">
    {(["fr", "en"] as const).map((language) => <NextLink key={language} href={`/${language}/dev/${space}`} hrefLang={language} lang={language}
      aria-current={locale === language ? "page" : undefined}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-input px-2 font-medium no-underline ${locale === language ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-surface-hover"}`}>
      {language.toUpperCase()}
    </NextLink>)}
  </nav>;
}

export function FutureItem({ label, locale, icon }: { label: string; locale: Locale; icon?: ReactNode }) {
  return <span className="flex min-h-11 items-center gap-3 rounded-input px-3 py-2 text-sm text-muted-foreground">
    {icon}<span className="min-w-0 flex-1"><span className="block">{label}</span><span className="block text-[0.8125rem]">{getShowcaseDictionary(locale).common.development}</span></span>
  </span>;
}

export function MobileNavigation({ locale, children, title, description }: { locale: Locale; children: ReactNode; title?: string; description?: string }) {
  const [open, setOpen] = useState(false);
  const text = getShowcaseDictionary(locale).common;
  return <div className="lg:hidden">
    <Sheet open={open} onOpenChange={setOpen} title={title ?? text.navigation} description={description ?? text.navigationDescription} closeLabel={text.close}
      trigger={<Button variant="ghost" size="icon" aria-label={text.openMenu}><Menu size={20} aria-hidden="true" /></Button>}>
      <div onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>
        {children}
      </div>
    </Sheet>
  </div>;
}

export function Breadcrumb({ locale, parent, current }: { locale: Locale; parent: string; current: string }) {
  return <nav aria-label={getShowcaseDictionary(locale).common.breadcrumb} className="min-w-0 text-[0.8125rem] text-muted-foreground">
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1"><li>{parent}</li><li aria-hidden="true">/</li><li aria-current="page" className="break-words text-foreground">{current}</li></ol>
  </nav>;
}
