"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import type { OrderPaymentStatus, OrderView, RefundContext } from "@/lib/api/generated/types.gen";
import { getOrderPaymentStatus } from "@/lib/api/payments-client";
import { getRefundContext } from "@/lib/api/refunds-client";
import { authHref, authPath } from "@/lib/auth/routes";
import { paymentOutcome } from "@/lib/commerce/payment-state";
import { commerceMoney } from "@/lib/commerce/format";
import { ordersPath, orderStatusPath } from "@/lib/commerce/routes";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import { getPaymentDictionary } from "@/lib/i18n/payments";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { resourceHref } from "@/lib/public/routes";
import { projectDate } from "@/components/projects/parts";
import { CheckoutAction } from "./checkout";
import { CommerceError, CommercePrivateShell } from "./parts";
import { OrderStates } from "./orders";
import { entitlementsPath, orderRefundsPath } from "@/lib/refunds/routes";
import { getRefundsDictionary, getRefundStateDictionary } from "@/lib/i18n/refunds";

const MAX_CHECKS = 12;
export function PersonalOrderPaymentStatus({ locale, order, initial, expectedAccountId, returned }: { locale: Locale; order: OrderView; initial: AuthResult<OrderPaymentStatus>; expectedAccountId: string; returned?: "success" | "cancel" }) {
  const t = getPaymentDictionary(locale), c = getCommerceDictionary(locale), r = getRefundsDictionary(locale), rs = getRefundStateDictionary(locale), destination = orderStatusPath(locale, order.id, returned), { state: account, boundary } = useLearningAccount(destination, expectedAccountId);
  const [result, setResult] = useState(initial), [error, setError] = useState<ApiError | null>(null), [cycle, setCycle] = useState(0), [paused, setPaused] = useState(false), [checking, setChecking] = useState(false);
  const [refundRead, setRefundRead] = useState<{ scope: number; cycle: number; result: AuthResult<RefundContext> } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (account.status !== "active") return;
    const request = ++sequence.current, scope = boundary.capture(); let active = true, count = 0, timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      setChecking(true);
      const [value, refunds] = await Promise.all([getOrderPaymentStatus(order.id), getRefundContext(order.id)]);
      if (!active || request !== sequence.current || !boundary.isCurrent(scope)) return;
      setChecking(false); count++;
      setRefundRead({ scope, cycle, result: refunds });
      if (!value.ok) { setError(value.error); boundary.fail(value.error); setPaused(true); return; }
      setError(null); setResult((current) => current.ok && current.data.orderRevision > value.data.orderRevision ? current : value);
      if (!refunds.ok) { boundary.fail(refunds.error); setPaused(true); return; }
      const outcome = paymentOutcome(value.data), coherent = refunds.data.orderRevision >= value.data.orderRevision, settled = coherent && (["ready", "review", "failed"].includes(outcome) || value.data.checkoutState === "NONE" && !value.data.checkoutAvailable);
      if (settled || count >= MAX_CHECKS) { setPaused(true); return; }
      timer = setTimeout(() => void check(), 2000);
    }
    void check();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [account.status, boundary, cycle, order.id]);
  const status = result.ok ? result.data : null, outcome = status ? paymentOutcome(status) : null;
  const paymentError = error ?? (!result.ok ? result.error : null);
  const refunds = refundRead?.scope === boundary.capture() && refundRead.cycle === cycle ? refundRead.result : null;
  const currentRefund = !paymentError && refunds?.ok && status && refunds.data.orderRevision >= status.orderRevision ? refunds.data : null;
  const refundChanged = Boolean(currentRefund && (currentRefund.confirmedRefundedMinor > 0 || currentRefund.lines.some(line => line.originRevoked))), refundReview = currentRefund?.reconciliationState === "NEEDS_REVIEW";
  const refundState = paymentError || refunds && !refunds.ok ? "unavailable" : !currentRefund ? "checking" : refundChanged || refundReview || currentRefund.reservedMinor > 0 ? "updated" : "current";
  const resumable = currentRefund && !refundReview ? order.snapshot.resources.filter(resource => currentRefund.lines.some(line => line.orderResourceId === resource.id && !line.originRevoked)) : [];
  const accessReady = outcome === "ready" && Boolean(currentRefund) && !refundChanged && !refundReview;
  const notice = outcome === "ready" ? !currentRefund ? { title: t.accessCheckingTitle, text: paymentError || refunds && !refunds.ok ? t.refundUnavailableHelp : t.accessCheckingHelp } : refundReview ? { title: t.refundReviewTitle, text: t.refundReviewHelp } : refundChanged ? { title: t.refundChangedTitle, text: t.refundChangedHelp } : { title: t.readyTitle, text: t.readyHelp } : outcome === "activation" ? { title: t.activationTitle, text: t.activationHelp } : outcome === "review" ? { title: t.reviewTitle, text: t.reviewHelp } : outcome === "processing" ? { title: t.processingTitle, text: t.processingHelp } : outcome === "failed" ? { title: t.failedTitle, text: t.failedHelp } : { title: t.awaitingTitle, text: t.awaitingHelp };
  return <CommercePrivateShell locale={locale} id={order.id} status>{account.status !== "active" ? <div className="space-y-4"><StatusMessage tone="warning">{account.status === "loading" ? c.loadingAccount : account.status === "changed" ? t.accountChanged : c.expiredSession}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={authHref(locale, "sign-in", destination)} prefetch={false}>{c.signIn}</Link><Button variant="secondary" onClick={() => void boundary.refresh()}>{c.checkAccount}</Button></div></div> : <div className="space-y-7" data-order-payment-status={outcome ?? "unavailable"}>
    {returned && <StatusMessage>{returned === "success" ? t.returnSuccess : t.returnCancel}</StatusMessage>}
    <h2 lang={order.snapshot.locale} className="break-words text-2xl font-semibold">{order.snapshot.title}</h2>
    <p className="break-all text-sm text-muted-foreground">{c.orderReference} : {order.id}</p>
    {paymentError && <CommerceError locale={locale} error={paymentError} target="order" />}{result.ok && status && <>
      <StatusMessage tone={accessReady ? "success" : "warning"} title={notice.title}>{notice.text}</StatusMessage><OrderStates locale={locale} value={status} />
      {status.checkoutState === "OPEN" && status.sessionExpiresAt && <p className="text-sm">{t.sessionExpires} {projectDate(status.sessionExpiresAt, locale)}</p>}
      {status.notificationStatus !== "NONE" && <section className="space-y-3" data-order-notification-status={status.notificationStatus}><h3 className="text-lg font-semibold">{t.notification}</h3><StatusMessage tone={status.notificationStatus === "ISSUE" ? "warning" : "info"}>{status.notificationStatus === "ISSUE" ? t.notificationIssue : status.notificationStatus === "SENT" ? t.notificationSent : t.notificationPending}</StatusMessage></section>}
      {outcome === "ready" && currentRefund && resumable.length > 0 && <section className="space-y-4"><h3 className="text-xl font-semibold">{c.resources}</h3><p className="text-sm text-muted-foreground">{refundChanged ? t.refundAccessHelp : t.accessHelp}</p><ul className="space-y-3">{resumable.map((resource) => <li key={resource.id} className="rounded-panel border border-border p-4"><Link href={resourceHref({ ...resource, locale: order.snapshot.locale, kind: "COURSE" })} prefetch={false} className="inline-flex min-h-11 items-center break-words font-medium">{resource.title} · {c.resume}</Link></li>)}</ul></section>}
      {status.checkoutAvailable && <CheckoutAction key={`checkout:${order.id}:${cycle}`} locale={locale} order={order} initial={result} account={account} boundary={boundary} />}
    </>}
    <section className="space-y-4 rounded-panel border border-border p-4 sm:p-6" data-order-refund-status={refundState}><h3 className="text-xl font-semibold">{t.refundTitle}</h3>{refunds && !refunds.ok && !paymentError ? <CommerceError locale={locale} error={refunds.error} target="order" /> : !currentRefund ? <p role="status" className="text-sm text-muted-foreground">{paymentError ? t.refundUnavailableHelp : t.accessCheckingHelp}</p> : <><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{r.refundedAmount}</dt><dd className="mt-1 font-semibold">{commerceMoney({ amountMinor: currentRefund.confirmedRefundedMinor, currency: currentRefund.currency }, locale)}</dd></div><div><dt className="text-muted-foreground">{r.reservedAmount}</dt><dd className="mt-1 font-semibold">{commerceMoney({ amountMinor: currentRefund.reservedMinor, currency: currentRefund.currency }, locale)}</dd></div></dl>{currentRefund.reservedMinor > 0 && <StatusMessage>{t.refundReservedHelp}</StatusMessage>}{refundChanged && <p className="text-sm leading-relaxed text-muted-foreground">{t.refundChangedHelp}</p>}</>}<div className="flex flex-wrap gap-3"><Link href={orderRefundsPath(locale, order.id)} prefetch={false} className="inline-flex min-h-11 items-center">{rs.refundHistory}</Link><Link href={entitlementsPath(locale)} prefetch={false} className="inline-flex min-h-11 items-center">{rs.entitlementsTitle}</Link></div></section>
    <div aria-live="polite" className="text-sm text-muted-foreground">{checking ? t.checking : paused ? t.pollingPaused : null}</div>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" busy={checking} loadingLabel={t.checking} onClick={() => { setPaused(false); setCycle((value) => value + 1); }}>{t.refresh}</Button><Link href={ordersPath(locale, order.id)} prefetch={false} className="inline-flex min-h-11 items-center">{t.backSummary}</Link><Link href={authPath(locale, "account")} prefetch={false} className="inline-flex min-h-11 items-center">{t.backAccount}</Link></div>
  </div>}</CommercePrivateShell>;
}
