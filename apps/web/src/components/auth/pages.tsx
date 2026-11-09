import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeReturnTo, type AuthScreen } from "@/lib/auth/routes";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { AuthForm } from "./auth-form";

type PageProps = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export function authMetadata(locale: Locale, screen: AuthScreen): Metadata {
  const text = getAuthDictionary(locale);
  const title = screen === "sign-in" ? text.signIn : screen === "sign-up" ? text.signUp : screen === "recover" ? text.recover : screen === "reset" ? text.reset : text.account;
  return { title: `${title} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export function authPage(mode: Exclude<AuthScreen, "account">, expected: Locale) {
  return async function Page({ params, searchParams }: PageProps) {
    const { locale } = await params;
    if (!isLocale(locale) || locale !== expected) notFound();
    const query = await searchParams;
    return <AuthForm locale={locale} mode={mode} returnTo={safeReturnTo(query.returnTo, locale)} notice={typeof query.notice === "string" ? query.notice : undefined} />;
  };
}
