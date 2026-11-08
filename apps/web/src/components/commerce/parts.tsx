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
import { offersPath, ordersPath, orderStatusPath } from "@/lib/commerce/routes";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import { getPaymentDictionary } from "@/lib/i18n/payments";
import type { Locale } from "@/lib/i18n/locales";

export function CommercePublicShell({ locale, id, children }: { locale: Locale; id?: string; children: ReactNode }) {
  return <PublicShell locale={locale} languageLinks={{ fr: { href: offersPath("fr", id), available: true }, en: { href: offersPath("en", id), available: true } }}>{children}</PublicShell>;
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
  return <div className="space-y-6"><dl className="grid gap-5 sm:grid-cols-2">{[
    { title: t.accessDuration, value: period(conditions?.access ?? null) }, { title: t.updates, value: period(conditions?.updates ?? null) },
    { title: t.versionPolicy, value: conditions?.versionPolicy === "PINNED" ? t.pinned : conditions?.versionPolicy === "UPDATES_DURING_PERIOD" ? t.duringPeriod : t.notConfigured },
    { title: t.support, value: support?.mode === "NONE" ? t.noSupport : support?.mode === "ASYNC" ? commerceText(support.descriptions, contentLocale) ?? t.notConfigured : t.notConfigured },
    { title: t.humanReview, value: conditions?.humanReviewIncluded === false ? t.noHumanReview : t.notConfigured }, { title: t.tax, value: tax ? commerceText(tax.notices, contentLocale) ?? t.notConfigured : t.notConfigured },
  ].map((item) => <div key={item.title}><dt className="text-sm text-muted-foreground">{item.title}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">{item.value}</dd></div>)}</dl>
    <section className="space-y-3 rounded-input border border-border bg-surface-subtle p-4" data-order-terms-version={conditions?.termsVersion ?? ""}><h2 className="text-lg font-semibold">{t.terms}</h2><p className="break-words text-sm">{t.termsVersion} : {conditions?.termsVersion || t.notConfigured}</p><p lang={contentLocale} className="whitespace-pre-wrap break-words text-sm leading-relaxed">{conditions ? commerceText(conditions.terms, contentLocale) ?? t.notConfigured : t.notConfigured}</p></section>
  </div>;
}
export function CommerceBack({ locale, orders = false }: { locale: Locale; orders?: boolean }) { const t = getCommerceDictionary(locale); return <Link href={orders ? ordersPath(locale) : offersPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center text-sm">← {orders ? t.backOrders : t.backOffers}</Link>; }
