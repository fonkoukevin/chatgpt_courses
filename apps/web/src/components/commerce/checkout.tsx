"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Checkbox, Link, StatusMessage } from "@/components/ui";
import type { AuthResult } from "@/lib/api/auth-client";
import type { ApiError } from "@/lib/api/client";
import { getOrder } from "@/lib/api/commerce-client";
import type { OrderPaymentStatus, OrderView } from "@/lib/api/generated/types.gen";
import { createCheckout, getOrderPaymentStatus } from "@/lib/api/payments-client";
import { checkoutIntent, paymentOutcome, type CheckoutIntent } from "@/lib/commerce/payment-state";
import { offersPath, ordersPath, orderStatusPath } from "@/lib/commerce/routes";
import { getCommerceDictionary } from "@/lib/i18n/commerce";
import { getPaymentDictionary } from "@/lib/i18n/payments";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { CommerceError } from "./parts";

export function CheckoutAction({ locale, order, account, boundary, initial }: { locale: Locale; order: OrderView; account: LearningAccountState; boundary: LearningAccountBoundary; initial?: AuthResult<OrderPaymentStatus> }) {
  const t = getPaymentDictionary(locale), c = getCommerceDictionary(locale), id = useId(), lock = useRef(false), intent = useRef<CheckoutIntent | null>(null), lifetime = useRef(0);
  const [status, setStatus] = useState<AuthResult<OrderPaymentStatus> | null>(initial ?? null), [accepted, setAccepted] = useState(false), [invalid, setInvalid] = useState(false);
  const [phase, setPhase] = useState<"idle" | "opening" | "pending" | "uncertain" | "expired" | "changed" | "review">("idle"), [error, setError] = useState<ApiError | null>(null);
  useEffect(() => () => { lifetime.current++; }, []);
  useEffect(() => {
    if (account.status !== "active") return;
    let active = true; const scope = boundary.capture();
    void getOrderPaymentStatus(order.id).then((value) => { if (active && boundary.isCurrent(scope)) { setStatus(value); if (!value.ok) boundary.fail(value.error); } });
    return () => { active = false; };
  }, [account.status, boundary, order.id]);
  async function open() {
    if (lock.current || account.status !== "active" || !account.accountId || !status?.ok || !status.data.checkoutAvailable) return;
    if (!accepted) { setInvalid(true); document.getElementById(`${id}-terms`)?.focus(); return; }
    lock.current = true; const scope = boundary.capture(), instance = lifetime.current, attempt = checkoutIntent(intent.current, order.id, account.accountId, order.acceptedTermsVersion, () => crypto.randomUUID());
    intent.current = attempt; setPhase("opening"); setError(null);
    try {
      // Polling or reconciliation may advance the row. Re-read its real ETag;
      // the idempotency intention stays tied to the accepted order, not the tag.
      const latest = await getOrder(order.id);
      if (instance !== lifetime.current) return;
      if (!boundary.isCurrent(scope)) { setPhase("changed"); return; }
      if (!latest.ok) { setError(latest.error); boundary.fail(latest.error); setPhase("uncertain"); return; }
      if (latest.data.acceptedTermsVersion !== attempt.terms || !latest.etag) { setAccepted(false); setPhase("review"); return; }
      const value = await createCheckout(order.id, latest.etag, { acceptedTermsVersion: attempt.terms }, attempt.key, attempt.accountId);
      if (instance !== lifetime.current) return;
      if (!boundary.isCurrent(scope)) { setPhase("changed"); return; }
      if (!value.ok) {
        setError(value.error); boundary.fail(value.error);
        const code = "problem" in value.error ? value.error.problem?.code : undefined;
        if (value.error.status === 412 || code === "OFFER_CHANGED" || code === "TERMS_CHANGED") { setAccepted(false); setPhase("review"); }
        else setPhase(value.error.kind === "unavailable" || value.error.kind === "invalid-response" ? "uncertain" : "idle");
        return;
      }
      if (value.data.url && value.data.state === "OPEN") {
        if (!value.data.expiresAt || Date.parse(value.data.expiresAt) <= Date.now()) { setPhase("expired"); return; }
        window.location.assign(value.data.url); return;
      }
      setPhase(value.data.state === "EXPIRED" ? "expired" : "pending");
    } finally { lock.current = false; }
  }
  const available = account.status === "active" && status?.ok && status.data.checkoutAvailable;
  const outcome = status?.ok ? paymentOutcome(status.data) : null;
  return <section className="space-y-4" data-checkout-state={phase}>
    {!status ? <p role="status">{t.checking}</p> : !status.ok ? <CommerceError locale={locale} error={status.error} target="order" /> : !available && <StatusMessage>{outcome === "ready" ? t.readyHelp : outcome === "activation" ? t.activationHelp : outcome === "review" ? t.reviewHelp : outcome === "processing" ? t.processingHelp : t.unavailable}</StatusMessage>}
    {available && !["pending", "uncertain", "changed", "review"].includes(phase) && <form noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); void open(); }}>
      <Checkbox id={`${id}-terms`} label={t.terms} checked={accepted} disabled={phase === "opening"} aria-invalid={invalid} aria-describedby={invalid ? `${id}-terms-error` : undefined} onCheckedChange={(value) => { setAccepted(value); setInvalid(false); }} />
      <p className="break-words text-sm" data-checkout-terms-version>{order.acceptedTermsVersion}</p>{invalid && <p role="alert" id={`${id}-terms-error`} className="text-sm text-danger">{t.termsRequired}</p>}
      <Button type="submit" busy={phase === "opening"} loadingLabel={t.opening} className="max-w-full whitespace-normal">{status?.ok && status.data.checkoutState !== "NONE" ? t.resumeCheckout : t.openCheckout}</Button><p className="text-sm leading-relaxed text-muted-foreground">{t.externalCheckout}</p>
    </form>}
    {error && <CommerceError locale={locale} error={error} target="order" />}
    {["pending", "uncertain", "expired", "changed"].includes(phase) && <StatusMessage tone="warning">{phase === "pending" ? t.operationPending : phase === "expired" ? t.operationExpired : phase === "changed" ? t.accountChanged : t.operationUncertain}</StatusMessage>}
    {phase === "review" && <div className="space-y-3"><StatusMessage tone="warning">{t.orderChanged}</StatusMessage><div className="flex flex-wrap gap-3"><Link href={offersPath(locale, order.snapshot.offerId)} prefetch={false} className="inline-flex min-h-11 items-center">{c.offerDetails}</Link><Link href={ordersPath(locale, order.id)} prefetch={false} className="inline-flex min-h-11 items-center">{t.backSummary}</Link></div></div>}
    <Link href={orderStatusPath(locale, order.id)} prefetch={false} className="inline-flex min-h-11 items-center font-medium">{t.follow}</Link>
  </section>;
}
