import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link, StatusMessage } from "@/components/ui";
import { readCurrentUser, readPreferences } from "@/lib/api/server-read";
import { authHref, safeReturnTo, type AuthScreen } from "@/lib/auth/routes";
import { getAuthDictionary } from "@/lib/i18n/auth";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { AccountActions } from "./account-actions";
import { AuthForm } from "./auth-form";
import { AuthFrame } from "./auth-frame";
import { ResumeContext } from "./resume-context";

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

export function accountPage(expected: Locale) {
  return async function Page({ params }: PageProps) {
    const { locale } = await params;
    if (!isLocale(locale) || locale !== expected) notFound();
    const text = getAuthDictionary(locale);
    const user = await readCurrentUser();
    if (!user.ok && user.error.kind === "http" && user.error.status === 401) redirect(authHref(locale, "sign-in", undefined, "required"));
    if (!user.ok) return <AuthFrame locale={locale} screen="account" title={text.account} description={text.accountIntro}><StatusMessage tone="danger"><p>{text.accountUnavailable}</p><Link prefetch={false} href={authHref(locale, "account")}>{text.retry}</Link></StatusMessage></AuthFrame>;
    const preferences = await readPreferences();
    return <AuthFrame locale={locale} screen="account" title={text.account} description={text.accountIntro}>
      <section aria-labelledby="account-identity" className="rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 id="account-identity" className="text-lg font-semibold">{text.identity}</h2>
        <dl className="mt-4 space-y-4"><div><dt className="text-sm text-muted-foreground">{text.email}</dt><dd className="mt-1 break-words">{user.data.email}</dd></div>{user.data.displayName && <div><dt className="text-sm text-muted-foreground">{text.displayName}</dt><dd className="mt-1 break-words">{user.data.displayName}</dd></div>}</dl>
      </section>
      <ResumeContext locale={locale} /><AccountActions locale={locale} initialPreferences={preferences} />
      <p className="text-sm leading-relaxed text-muted-foreground">{text.nextPhase}</p>
    </AuthFrame>;
  };
}
