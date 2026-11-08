"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { createOrder, getPurchaseContext } from "@/lib/api/commerce-client";
import type { PublicOffer, PurchaseContext } from "@/lib/api/generated/types.gen";
import { authHref } from "@/lib/auth/routes";
import { orderAcknowledgesOffer, orderIntent, type OrderIntent } from "@/lib/commerce/preparation";
import { offersPath, ordersPath, orderStatusPath } from "@/lib/commerce/routes";
import { getPaymentDictionary } from "@/lib/i18n/payments";
import { commerceIssueLabel, getCommerceDictionary } from "@/lib/i18n/commerce";
import type { Locale } from "@/lib/i18n/locales";
import { useLearningAccount } from "@/lib/learning/account";
import { resourceHref } from "@/lib/public/routes";
import { CommerceError } from "./parts";

export function OfferPurchase({ locale, offer }: { locale: Locale; offer: PublicOffer }) {
  const t = getCommerceDictionary(locale), p = getPaymentDictionary(locale), id = useId(), router = useRouter(), { state: account, boundary } = useLearningAccount(offersPath(locale, offer.id));
  const [result, setResult] = useState<AuthResult<PurchaseContext> | null>(null), [refresh, setRefresh] = useState(0), [accepted, setAccepted] = useState(false), [invalid, setInvalid] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preparing" | "prepared" | "error" | "uncertain">("idle"), [error, setError] = useState<ApiError | null>(null), [changed, setChanged] = useState(false), [unconfirmed, setUnconfirmed] = useState(false);
  const request = useRef(0), lock = useRef(false), intent = useRef<OrderIntent | null>(null);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const generation = ++request.current, scope = boundary.capture();
    void getPurchaseContext(offer.id, locale).then((value) => { if (!active || generation !== request.current || !boundary.isCurrent(scope)) return; setResult(value); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, locale, offer.id, refresh]);
  const context = result?.ok ? result.data : null, offerChanged = changed || Boolean(context && context.offer.revision !== offer.revision), blocked = account.status !== "active";
  const sameIntention = Boolean(context?.activeOrder && context.activeOrder.offerRevision === offer.revision && context.activeOrder.locale === locale);
  const paymentStarted = Boolean(context?.activeOrder && (context.activeOrder.paymentStatus !== "NOT_STARTED" || context.activeOrder.fulfillmentStatus !== "NOT_STARTED" || context.activeOrder.orderStatus !== "PREPARED"));
  const availableHere = offer.translationAvailable && offer.locales.includes(locale);
  async function prepare() {
    if (blocked || lock.current || !account.accountId || !context || offerChanged || !availableHere || offer.state !== "ACTIVE" || !offer.readiness.summaryReady || context.coverage.status === "ALL" || sameIntention || paymentStarted || !offer.conditions?.termsVersion) return;
    if (!accepted) { setInvalid(true); document.getElementById(`${id}-terms`)?.focus(); return; }
    const attempt = orderIntent(intent.current, { offerId: offer.id, offerRevision: offer.revision, locale, acceptedTermsVersion: offer.conditions.termsVersion }, account.accountId, () => crypto.randomUUID());
    intent.current = attempt; lock.current = true; request.current++; const scope = boundary.capture(); setPhase("preparing"); setError(null); setUnconfirmed(false);
    try {
      const value = await createOrder(attempt.body, attempt.key, attempt.accountId);
      if (!boundary.isCurrent(scope)) { setPhase("uncertain"); setUnconfirmed(true); return; }
      if (!value.ok) {
        setError(value.error); boundary.fail(value.error); const code = "problem" in value.error ? value.error.problem?.code : undefined;
        if (code === "OFFER_CHANGED" || code === "TERMS_CHANGED") { setChanged(true); setAccepted(false); setPhase("error"); }
        else if (code === "ALREADY_ACCESSIBLE") { setRefresh((value) => value + 1); setPhase("error"); }
        else setPhase(value.error.kind === "unavailable" || value.error.kind === "invalid-response" ? "uncertain" : "error");
        return;
      }
      if (!orderAcknowledgesOffer(value.data, offer)) { setError({ kind: "invalid-response", status: value.status }); setPhase("uncertain"); return; }
      setPhase("prepared"); router.push(ordersPath(locale, value.data.id));
    } finally { lock.current = false; }
  }
  function reloadOffer() { if (lock.current) return; setAccepted(false); setChanged(false); setResult(null); setRefresh((value) => value + 1); router.refresh(); }
  return <section className="space-y-5" data-order-create-state={phase}>
    {!offer.readiness.summaryReady && <StatusMessage tone="warning" title={t.notReady}>{t.configurationIncomplete}</StatusMessage>}
    {offer.readiness.blockingIssues.length > 0 && <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{offer.readiness.blockingIssues.map((issue, index) => <li key={`${issue.code}:${index}`} data-commerce-issue={issue.code}>{commerceIssueLabel(locale, issue.code)}{issue.locale ? ` (${issue.locale.toUpperCase()})` : ""}</li>)}</ul>}
    {!availableHere && <div className="space-y-3"><StatusMessage tone="warning">{t.languageNotIncluded}</StatusMessage><div className="flex flex-wrap gap-3">{offer.locales.filter((language) => language !== locale).map((language) => <Link key={language} href={offersPath(language, offer.id)} hrefLang={language}>{language.toUpperCase()} · {t.offerDetails}</Link>)}</div></div>}
    {!offer.readiness.checkoutAvailable && <StatusMessage>{t.checkoutUnavailable}</StatusMessage>}
    {account.status === "loading" ? <p role="status">{t.loadingAccount}</p> : account.status === "anonymous" ? <Link href={authHref(locale, "sign-in", offersPath(locale, offer.id))} prefetch={false} className="inline-flex min-h-11 items-center font-medium">{t.signIn}</Link> : blocked ? <div className="space-y-3"><StatusMessage tone="warning">{account.status === "changed" ? t.accountChanged : account.status === "expired" ? t.expiredSession : t.unavailable}</StatusMessage><Link href={authHref(locale, "sign-in", offersPath(locale, offer.id))} prefetch={false}>{t.signIn}</Link><Button variant="secondary" onClick={() => void boundary.refresh()}>{t.checkAccount}</Button></div> : !result ? <p role="status">{t.loading}</p> : !result.ok ? <div className="space-y-3"><CommerceError locale={locale} error={result.error} /><Button variant="secondary" onClick={() => setRefresh((value) => value + 1)}>{t.retry}</Button></div> : <>
      {offerChanged ? <div className="space-y-3"><StatusMessage tone="warning">{t.offerChanged}</StatusMessage><Button variant="secondary" className="max-w-full whitespace-normal" onClick={reloadOffer}>{t.reloadOffer}</Button></div> : <>
        {context?.activeOrder && <StatusMessage><p>{paymentStarted ? p.orderStates[context.activeOrder.orderStatus] : sameIntention ? t.activeOrder : t.otherOrder}</p><Link href={paymentStarted ? orderStatusPath(locale, context.activeOrder.id) : ordersPath(locale, context.activeOrder.id)} prefetch={false}>{paymentStarted ? p.follow : t.openExisting}</Link></StatusMessage>}
        {context && context.coverage.status !== "NONE" && <section className="space-y-3"><StatusMessage>{context.coverage.status === "ALL" ? t.alreadyAccessible : t.partiallyAccessible}</StatusMessage><ul className="space-y-3">{context.coverage.resources.map((item) => { const resource = offer.resources.find((value) => value.resourceId === item.resourceId); return <li key={item.resourceId} className="space-y-1 text-sm"><p className="break-words font-medium">{resource?.title || t.notConfigured}</p><p>{item.alreadyAccessible ? t.acquired : t.newInclusion}{item.coveredLocales.length > 0 ? ` · ${item.coveredLocales.map((language) => language.toUpperCase()).join(" / ")}` : ""}</p>{item.alreadyAccessible && resource?.slug && resource.availability === "PUBLISHED" && <Link href={resourceHref({ ...resource, kind: "COURSE", slug: resource.slug })} className="inline-flex min-h-11 items-center">{t.resume}</Link>}</li>; })}</ul></section>}
        {!sameIntention && !paymentStarted && context?.coverage.status !== "ALL" && <form noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); void prepare(); }}><Checkbox id={`${id}-terms`} label={t.acceptTerms} checked={accepted} disabled={blocked || phase === "preparing" || !availableHere || !offer.readiness.summaryReady || offer.state !== "ACTIVE"} aria-invalid={invalid} aria-describedby={invalid ? `${id}-terms-error` : undefined} onCheckedChange={(value) => { setAccepted(value); setInvalid(false); }} />{invalid && <p id={`${id}-terms-error`} role="alert" className="text-sm text-danger">{t.acceptRequired}</p>}<p className="break-words text-sm">{t.termsVersion} : {offer.conditions?.termsVersion || t.notConfigured}</p><Button type="submit" className="max-w-full whitespace-normal" disabled={blocked || !availableHere || !offer.readiness.summaryReady || offer.state !== "ACTIVE"} busy={phase === "preparing"} loadingLabel={t.preparing}>{phase === "uncertain" ? t.retry : t.prepare}</Button><p className="text-sm leading-relaxed text-muted-foreground">{t.prepareHelp}</p></form>}
      </>}
    </>}
    {error && !offerChanged && <CommerceError locale={locale} error={error} />}{phase === "uncertain" && <StatusMessage tone="warning"><p>{t.creationUncertain}</p><Link href={ordersPath(locale)} prefetch={false}>{t.orders}</Link></StatusMessage>}{unconfirmed && <StatusMessage tone="warning">{t.scopeChanged}</StatusMessage>}
  </section>;
}
