"use client";
import { OrderCommercialDocuments } from "@/components/account/commercial-documents";
import { helpHref } from "@/lib/account/routes";
import { getAccountDictionary } from "@/lib/i18n/account";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Link, Pagination, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import { getOrder, listOrders } from "@/lib/api/commerce-client";
import type { OrderPage, OrderView } from "@/lib/api/generated/types.gen";
import { authHref } from "@/lib/auth/routes";
import { commerceMoney } from "@/lib/commerce/format";
import { offersPath, ordersHref, ordersPath, type CommercePagination } from "@/lib/commerce/routes";
import { getPaymentDictionary } from "@/lib/i18n/payments";
import { CheckoutAction } from "./checkout";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount, type LearningAccountBoundary, type LearningAccountState } from "@/lib/learning/account";
import { projectDate } from "@/components/projects/parts";
import { resourceHref } from "@/lib/public/routes";
import { CommerceBack, CommerceError, CommercePrivateShell, OfferTerms } from "./parts";
import { entitlementsPath, orderRefundsPath } from "@/lib/refunds/routes";
import { getRefundStateDictionary } from "@/lib/i18n/refunds";

function AccountNotice({ locale, destination, account, boundary }: { locale: Locale; destination: string; account: LearningAccountState; boundary: LearningAccountBoundary }) {
  const t = getCommerceDictionary(locale);
  return account.status === "loading" ? <p role="status">{t.loadingAccount}</p> : <div className="space-y-4"><StatusMessage tone="warning">{account.status === "changed" ? t.accountChanged : account.status === "expired" || account.status === "anonymous" ? t.expiredSession : t.unavailable}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "sign-in", destination)} prefetch={false}>{t.signIn}</Link><Button variant="secondary" onClick={() => void boundary.refresh()}>{t.checkAccount}</Button></div></div>;
}
export function OrderStates({ locale, value }: { locale: Locale; value: Pick<OrderView, "orderStatus" | "paymentStatus" | "fulfillmentStatus"> }) {
  const t = getCommerceDictionary(locale), p = getPaymentDictionary(locale);
  return <dl className="grid gap-4 text-sm sm:grid-cols-3">{[{ label: t.orderStatus, value: p.orderStates[value.orderStatus] }, { label: t.paymentStatus, value: p.paymentStates[value.paymentStatus] }, { label: t.fulfillmentStatus, value: p.fulfillmentStates[value.fulfillmentStatus] }].map((item) => <div key={item.label}><dt className="text-muted-foreground">{item.label}</dt><dd className="mt-1 font-medium">{item.value}</dd></div>)}</dl>;
}
export function PersonalOrders({ locale, initial, query, expectedAccountId }: { locale: Locale; initial: AuthResult<OrderPage>; query: CommercePagination; expectedAccountId: string }) {
  const t = getCommerceDictionary(locale), destination = ordersHref(locale, query), { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const [result, setResult] = useState(initial), [refresh, setRefresh] = useState(0), [pending, setPending] = useState(false), request = useRef(0);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const sequence = ++request.current, scope = boundary.capture();
    void listOrders(query.page ?? 0, query.pageSize ?? 20).then((value) => { if (!active || sequence !== request.current || !boundary.isCurrent(scope)) return; setResult(value); setPending(false); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, query.page, query.pageSize, refresh]);
  return <CommercePrivateShell locale={locale}>{account.status !== "active" ? <AccountNotice locale={locale} destination={destination} account={account} boundary={boundary} /> : <div className="space-y-6"><div className="flex flex-wrap gap-3"><Link href={offersPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{t.offers}</Link><Button variant="secondary" busy={pending} loadingLabel={t.loading} onClick={() => { setPending(true); setRefresh((value) => value + 1); }}>{t.refresh}</Button></div>{!result.ok ? <CommerceError locale={locale} error={result.error} target="order" /> : !result.data.items.length ? <StatusMessage>{t.emptyOrders}</StatusMessage> : <><ul className="grid gap-5 xl:grid-cols-2">{result.data.items.map((item) => <li key={`order:${item.id}`} data-order-id={item.id} className="min-w-0 space-y-4 rounded-panel border border-border bg-surface p-4 sm:p-6"><h2 lang={item.locale} className="break-words text-xl font-semibold">{item.title}</h2><p className="text-xl font-semibold">{commerceMoney(item.total, locale)}</p><OrderStates locale={locale} value={item} /><p className="text-sm text-muted-foreground">{t.orderCreated} : {projectDate(item.createdAt, locale)}</p><Link href={ordersPath(locale, item.id)} prefetch={false} className="inline-flex min-h-11 items-center font-medium">{t.openOrder}</Link></li>)}</ul>{result.data.total > result.data.pageSize && <Pagination label={t.pagination} page={result.data.page + 1} totalPages={Math.ceil(result.data.total / result.data.pageSize)} previousLabel={t.previous} nextLabel={t.next} pageLabel={t.page} hrefForPage={(page) => ordersHref(locale, { page: page - 1, pageSize: result.data.pageSize })} />}</>}</div>}</CommercePrivateShell>;
}
export function PersonalOrderSummary({ locale, initial, id, expectedAccountId }: { locale: Locale; initial: AuthResult<OrderView>; id: string; expectedAccountId: string }) {
  const t = getCommerceDictionary(locale), destination = ordersPath(locale, id), { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const [result, setResult] = useState(initial), [refresh, setRefresh] = useState(0), [pending, setPending] = useState(false), request = useRef(0);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const sequence = ++request.current, scope = boundary.capture();
    void getOrder(id).then((value) => { if (!active || sequence !== request.current || !boundary.isCurrent(scope)) return; setPending(false); setResult((current) => value.ok && current.ok && value.data.revision < current.data.revision ? current : value); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, id, refresh]);
  const order = result.ok ? result.data : null;
  return <CommercePrivateShell locale={locale} id={id}>{account.status !== "active" ? <AccountNotice locale={locale} destination={destination} account={account} boundary={boundary} /> : <div className="space-y-8"><div className="flex flex-wrap gap-3"><CommerceBack locale={locale} orders /><Link href={helpHref(locale, { orderId: id })} prefetch={false} className="inline-flex min-h-11 items-center">{getAccountDictionary(locale).help}</Link><Link href={orderRefundsPath(locale, id)} prefetch={false} className="inline-flex min-h-11 items-center">{getRefundStateDictionary(locale).refundHistory}</Link><Link href={entitlementsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{getRefundStateDictionary(locale).entitlementsTitle}</Link><Button variant="secondary" busy={pending} loadingLabel={t.loading} onClick={() => { setPending(true); setRefresh((value) => value + 1); }}>{t.refresh}</Button></div>{!result.ok ? <CommerceError locale={locale} error={result.error} target="order" /> : order && <article className="space-y-8" data-order-id={order.id}><header className="space-y-4"><Badge>{order.snapshot.locale.toUpperCase()}</Badge><h2 lang={order.snapshot.locale} className="break-words text-2xl font-semibold">{order.snapshot.title}</h2><p className="break-all text-sm"><span className="text-muted-foreground">{t.orderReference} : </span>{order.id}</p>{order.paymentStatus !== "PAID" && <StatusMessage>{t.notPayment}</StatusMessage>}</header><OrderStates locale={locale} value={order} /><div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]"><div className="min-w-0 space-y-6"><p className="text-sm leading-relaxed text-muted-foreground">{t.snapshotHelp}</p><section className="space-y-4"><h3 className="text-xl font-semibold">{t.resources}</h3><ul className="space-y-3">{order.snapshot.resources.map((resource) => <li key={resource.id} className="space-y-2 rounded-input border border-border p-4"><p lang={order.snapshot.locale} className="break-words font-medium">{resource.title}</p><p className="text-sm text-muted-foreground">{t.learningVersion} {resource.versionNumber} · {resource.locales.map((language) => language.toUpperCase()).join(" / ")}</p><Link href={resourceHref({ ...resource, locale: order.snapshot.locale, kind: "COURSE" })} className="inline-flex min-h-11 items-center text-sm">{t.catalogue}</Link></li>)}</ul></section><OfferTerms locale={locale} contentLocale={order.snapshot.locale} conditions={order.snapshot.conditions} tax={order.snapshot.tax} /><OrderCommercialDocuments locale={locale} orderId={id} account={account} boundary={boundary} /></div><aside className="space-y-5 rounded-panel border border-border bg-surface-subtle p-4 sm:p-6"><h3 className="text-lg font-semibold">{t.price}</h3><p className="break-words text-3xl font-semibold">{commerceMoney(order.snapshot.total, locale)}</p><dl className="space-y-4 text-sm">{[{ title: t.orderCreated, value: projectDate(order.createdAt, locale) }, { title: t.orderExpires, value: projectDate(order.expiresAt, locale) }, { title: t.acceptedTerms, value: order.acceptedTermsVersion }, { title: t.acceptedAt, value: projectDate(order.acceptedAt, locale) }].map((item) => <div key={item.title}><dt className="text-muted-foreground">{item.title}</dt><dd className="mt-1 break-words font-medium">{item.value}</dd></div>)}</dl>{order.orderStatus === "EXPIRED" && <StatusMessage tone="warning">{t.orderExpired}</StatusMessage>}<CheckoutAction locale={locale} order={order} account={account} boundary={boundary} /></aside></div></article>}</div>}</CommercePrivateShell>;
}
