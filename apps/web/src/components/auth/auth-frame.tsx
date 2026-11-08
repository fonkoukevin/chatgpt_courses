import NextLink from "next/link";
import type { ReactNode } from "react";
import { getAuthDictionary } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/locales";
import { authHref, translateReturnTo, type AuthScreen } from "@/lib/auth/routes";

export function AuthFrame({ locale, screen, title, description, returnTo, resetToken, children }: {
  locale: Locale; screen: AuthScreen; title: string; description: string; returnTo?: string; resetToken?: string; children: ReactNode;
}) {
  const text = getAuthDictionary(locale);
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex min-h-18 max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <NextLink href={`/${locale}`} prefetch={false} className="inline-flex min-h-11 items-center rounded-input font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">ChatGPT Courses<span aria-hidden="true" className="text-brand">.</span></NextLink>
      <nav aria-label={text.languageNavigation} className="flex gap-1 text-sm">{(["fr", "en"] as const).map((language) => <NextLink key={language} lang={language} hrefLang={language} prefetch={false}
        href={`${authHref(language, screen, translateReturnTo(returnTo, language))}${screen === "reset" && resetToken && language !== locale ? `#token=${resetToken}` : ""}`}
        aria-current={locale === language ? "page" : undefined} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-input px-3 text-link aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{language === "fr" ? "Français" : "English"}</NextLink>)}</nav>
    </div></header>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl px-4 py-10 outline-none sm:px-6 sm:py-14">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-7 space-y-6">{children}</div>
    </main>
    <footer className="mx-auto max-w-xl border-t border-border px-4 py-6 text-sm leading-relaxed text-muted-foreground sm:px-6">{text.footer}</footer>
  </div>;
}
