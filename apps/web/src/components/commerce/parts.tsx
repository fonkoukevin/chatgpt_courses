"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, Link, StatusMessage } from "@/components/ui";
import { PublicShell } from "@/components/public/parts";
import { LearnerLayout } from "@/components/layouts/learner-layout";
import type { ApiError } from "@/lib/api/client";
import type { OfferConditions, OfferTax } from "@/lib/api/generated/types.gen";
import { commerceText } from "@/lib/commerce/format";
import { offersHref, offersPath, ordersPath, orderStatusPath } from "@/lib/commerce/routes";
import type { CourseOfferFilter } from "@/lib/api/commerce-client";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import { getPaymentDictionary } from "@/lib/i18n/payments";
import type { Locale } from "@/lib/i18n/locales";
import { localeName } from "@/lib/i18n/locales";
import type { LanguageLinks } from "@/lib/public/routes";

export type OfferPresentationStates = Record<Locale, "AVAILABLE" | "MISSING" | "INACTIVE" | "UNAVAILABLE">;
export function CommercePublicShell({ locale, id, course, languageLinks, children }: { locale: Locale; id?: string; course?: CourseOfferFilter; languageLinks?: LanguageLinks; children: ReactNode }) {
  return <PublicShell locale={locale} languageLinks={languageLinks ?? { fr: { href: course ? offersHref("fr", {}, course) : offersPath("fr"), available: !id }, en: { href: course ? offersHref("en", {}, course) : offersPath("en"), available: !id } }}>{children}</PublicShell>;
}
export function OfferPresentationLanguages({ locale, languageLinks, states }: { locale: Locale; languageLinks: LanguageLinks; states: OfferPresentationStates }) {
  const t = getCommerceDictionary(locale);
  return <section className="space-y-3" aria-label={t.presentationLanguages} data-offer-presentation-languages><h2 className="text-lg font-semibold">{t.presentationLanguages}</h2><ul className="space-y-3">{(["fr", "en"] as const).map(language => <li key={language} className="space-y-1 text-sm" data-offer-language={language} data-offer-language-state={states[language]}>
    <span lang={language} className="font-medium">{localeName(language)}</span>{states[language] === "AVAILABLE" ? language === locale ? <span className="ml-3 text-muted-foreground">{t.currentPresentation}</span> : <Link href={languageLinks[language].href} hrefLang={language} className="ml-3 inline-flex min-h-11 items-center">{t.openPresentation}</Link> : <div className="space-y-1"><p className="leading-relaxed text-muted-foreground">{states[language] === "UNAVAILABLE" ? t.presentationCheckUnavailable : states[language] === "INACTIVE" ? t.INACTIVE : t.presentationMissing}</p><Link href={languageLinks[language].href} hrefLang={language} className="inline-flex min-h-11 items-center">{t.browseLanguageOffers} — <span lang={language} className="ml-1">{localeName(language)}</span></Link></div>}
  </li>)}</ul></section>;
}
export function CommercePrivateShell({ locale, id, status = false, children }: { locale: Locale; id?: string; status?: boolean; children: ReactNode }) {
  const t = getCommerceDictionary(locale);
  return <LearnerLayout locale={locale} title={status ? getPaymentDictionary(locale).title : id ? t.order : t.orders} description={status ? getPaymentDictionary(locale).description : t.ordersHelp} product={{ languageLinks: { fr: status && id ? orderStatusPath("fr", id) : ordersPath("fr", id), en: status && id ? orderStatusPath("en", id) : ordersPath("en", id) }, active: "orders" }}>{children}</LearnerLayout>;
}
export function CommerceError({ locale, error, target }: { locale: Locale; error: ApiError; target?: "order" }) {
  const t = getCommerceDictionary(locale);
  return <StatusMessage tone="danger">{error.kind === "unavailable" ? t.unavailable : error.kind === "invalid-response" ? t.invalidResponse : error.status === 404 ? target === "order" ? t.orderUnavailable : t.notFound : t.httpError}</StatusMessage>;
}
export function OrderNotFound({ locale }: { locale: Locale }) { const t = getCommerceDictionary(locale); return <CommercePrivateShell locale={locale}><StatusMessage tone="warning">{t.orderUnavailable}</StatusMessage><Link href={ordersPath(locale)} prefetch={false} className="mt-4 inline-flex min-h-11 items-center">{t.backOrders}</Link></CommercePrivateShell>; }
export function CommerceRefresh({ locale }: { locale: Locale }) {
  const t = getCommerceDictionary(locale), router = useRouter(), [pending, start] = useTransition();
  return <Button variant="secondary" busy={pending} loadingLabel={t.loading} onClick={() => start(() => router.refresh())}>{t.refresh}</Button>;
}
export function OfferTerms({ locale, contentLocale = locale, conditions, tax }: { locale: Locale; contentLocale?: Locale; conditions: OfferConditions | null; tax: OfferTax | null }) {
  const t = getCommerceDictionary(locale), support = conditions?.support, period = (value: OfferConditions["access"]) => !value?.mode ? t.notConfigured : value.mode === "UNLIMITED" ? t.unlimited : value.mode === "NONE" ? t.noUpdates : value.days === null ? t.notConfigured : `${value.days} ${t.days}`;
  const supportText = support?.mode === "ASYNC" ? commerceText(support.descriptions, contentLocale) : null, taxText = tax ? commerceText(tax.notices, contentLocale) : null, termsText = conditions ? commerceText(conditions.terms, contentLocale) : null;
  return <div className="space-y-6"><dl className="grid gap-5 sm:grid-cols-2">{[
    { title: t.accessDuration, value: period(conditions?.access ?? null) }, { title: t.updates, value: period(conditions?.updates ?? null) },
    { title: t.versionPolicy, value: conditions?.versionPolicy === "PINNED" ? t.pinned : conditions?.versionPolicy === "UPDATES_DURING_PERIOD" ? t.duringPeriod : t.notConfigured },
    { title: t.support, value: support?.mode === "NONE" ? t.noSupport : supportText ?? t.notConfigured, lang: supportText ? contentLocale : locale },
    { title: t.humanReview, value: conditions?.humanReviewIncluded === false ? t.noHumanReview : t.notConfigured }, { title: t.tax, value: taxText ?? t.notConfigured, lang: taxText ? contentLocale : locale },
  ].map((item) => <div key={item.title}><dt className="text-sm text-muted-foreground">{item.title}</dt><dd lang={item.lang} className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{item.value}</dd></div>)}</dl>
    <section className="space-y-3 rounded-input border border-border bg-surface-subtle p-4" data-order-terms-version={conditions?.termsVersion ?? ""}><h2 className="text-lg font-semibold">{t.terms}</h2><p className="break-words text-sm">{t.termsVersion} : {conditions?.termsVersion || t.notConfigured}</p><p lang={termsText ? contentLocale : locale} className="whitespace-pre-wrap break-words text-sm leading-relaxed">{termsText ?? t.notConfigured}</p></section>
  </div>;
}
export function CommerceBack({ locale, orders = false }: { locale: Locale; orders?: boolean }) { const t = getCommerceDictionary(locale); return <Link href={orders ? ordersPath(locale) : offersPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">← {orders ? t.backOrders : t.backOffers}</Link>; }
