import "server-only";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { readOffer, readOffers, readOrder, readOrders } from "@/lib/api/commerce-server";
import { readCurrentUser } from "@/lib/api/server-read";
import { isUuid } from "@/lib/api/cms-validation";
import { authHref } from "@/lib/auth/routes";
import { offersPath, ordersHref, ordersPath, safeCommerceDestination, type CommercePagination } from "@/lib/commerce/routes";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import type { Locale } from "@/lib/i18n/locales";
import { PublicOfferDetails, PublicOffers } from "./offers";
import { PersonalOrders, PersonalOrderSummary } from "./orders";
import { CommerceError, CommercePrivateShell, CommerceRefresh } from "./parts";

type Props = { params: Promise<{ locale: string; offerId?: string; orderId?: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
async function route(props: Props, locale: Locale) { const params = await props.params; if (params.locale !== locale) notFound(); return params; }
async function pagination(props: Props, locale: Locale, personal: boolean): Promise<CommercePagination> {
  const query = await props.searchParams; if (Object.values(query).some((value) => Array.isArray(value))) notFound();
  const params = new URLSearchParams(query as Record<string, string>), path = personal ? ordersPath(locale) : offersPath(locale);
  if (!safeCommerceDestination(path + (params.size ? `?${params}` : ""), locale)) notFound();
  return { page: Number(query.page ?? 0), pageSize: Number(query.pageSize ?? 20) };
}
async function user(locale: Locale, destination: string) { const result = await readCurrentUser(); if (!result.ok && result.error.kind === "http" && result.error.status === 401) redirect(authHref(locale, "sign-in", destination, "required")); return result; }
export function commerceMetadata(locale: Locale, personal = false): Metadata { return { title: `${personal ? getCommerceDictionary(locale).orders : getCommerceDictionary(locale).offers} | ChatGPT Courses`, robots: { index: false, follow: false }, referrer: "no-referrer" }; }
export function offersPage(locale: Locale) { return async function Page(props: Props) { await route(props, locale); const query = await pagination(props, locale, false); return <PublicOffers locale={locale} result={await readOffers(locale, query.page, query.pageSize)} />; }; }
export function offerPage(locale: Locale) { return async function Page(props: Props) { const params = await route(props, locale); if (!isUuid(params.offerId)) notFound(); const result = await readOffer(params.offerId, locale); if (!result.ok && result.error.kind === "http" && result.error.status === 404) notFound(); return <PublicOfferDetails key={`${params.offerId}:${result.ok ? result.data.revision : "error"}`} locale={locale} id={params.offerId} result={result} />; }; }
export function ordersPage(locale: Locale) { return async function Page(props: Props) {
  await route(props, locale); const query = await pagination(props, locale, true), current = await user(locale, ordersHref(locale, query));
  if (!current.ok) return <CommercePrivateShell locale={locale}><div className="space-y-4"><CommerceError locale={locale} error={current.error} /><CommerceRefresh locale={locale} /></div></CommercePrivateShell>;
  return <PersonalOrders key={current.data.id} locale={locale} initial={await readOrders(query.page, query.pageSize)} query={query} expectedAccountId={current.data.id} />;
}; }
export function orderSummaryPage(locale: Locale) { return async function Page(props: Props) {
  const params = await route(props, locale); if (!isUuid(params.orderId)) notFound(); const current = await user(locale, ordersPath(locale, params.orderId));
  if (!current.ok) return <CommercePrivateShell locale={locale} id={params.orderId}><div className="space-y-4"><CommerceError locale={locale} error={current.error} /><CommerceRefresh locale={locale} /></div></CommercePrivateShell>;
  const result = await readOrder(params.orderId); if (!result.ok && result.error.kind === "http" && result.error.status === 404) notFound();
  return <PersonalOrderSummary key={`${current.data.id}:${params.orderId}`} locale={locale} initial={result} id={params.orderId} expectedAccountId={current.data.id} />;
}; }
