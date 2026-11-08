"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button, ConfirmationDialog, FormField, Input, StatusMessage, TextArea } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { DecideRefund, RefundContext, RefundPreview, RefundRequestView } from "@/lib/api/generated/types.gen";
import { decideRefund, getRefundRequest, previewRefund } from "@/lib/api/refunds-client";
import { getRefundsDictionary, getRefundStateDictionary } from "@/lib/i18n/refunds";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { validMethodText } from "@/lib/methods/validation";
import { allocationProposal, initialAllocationDraft } from "@/lib/refunds/allocations";
import { refundIntent, type RefundIntent } from "@/lib/refunds/intent";
import { RefundAllocationEditor } from "./allocation-editor";
import { RefundAllocations, RefundError, RefundTextCopy, refundMoney } from "./parts";

export function RefundDecisionForm({ locale, request, tag, context, account, boundary, allowed, onUpdated }: { locale: Locale; request: RefundRequestView; tag?: string; context: RefundContext; account: LearningAccountState; boundary: LearningAccountBoundary; allowed: boolean; onUpdated: () => void }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale), id = useId(), reasonField = useRef<HTMLTextAreaElement>(null), amountField = useRef<HTMLInputElement>(null), lock = useRef(false), lifetime = useRef(0), sequence = useRef(0), intention = useRef<RefundIntent | null>(null);
  const [amount, setAmount] = useState(""), [draft, setDraft] = useState(() => initialAllocationDraft(context.lines, [], context.currency)), [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ value: RefundPreview; body: string; tag: string } | null>(null), [busy, setBusy] = useState<"preview" | "decision" | "read" | null>(null), [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState<"amount" | "reason" | null>(null), [uncertain, setUncertain] = useState(false), [recorded, setRecorded] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false), [rejectOpen, setRejectOpen] = useState(false);
  useEffect(() => () => { lifetime.current++; sequence.current++; }, []);
  const proposal = allocationProposal(context.lines, draft, amount, context.currency), body = JSON.stringify(proposal), blocked = !allowed || account.status !== "active" || !tag || request.state !== "REQUESTED";
  const currentPreview = preview && preview.tag === tag && preview.body === body && preview.value.orderRevision >= context.orderRevision ? preview.value : null;
  function edited() { sequence.current++; setPreview(null); setInvalid(null); setRecorded(false); }
  async function preparePreview() {
    if (blocked || lock.current || !tag || !account.accountId) return;
    if (!proposal) { setInvalid("amount"); amountField.current?.focus(); return; }
    const scope = boundary.capture(), instance = lifetime.current, read = ++sequence.current; lock.current = true; setBusy("preview"); setError(null);
    try {
      const value = await previewRefund(request.id, tag, proposal, account.accountId);
      if (instance !== lifetime.current || read !== sequence.current || !boundary.isCurrent(scope)) return;
      if (!value.ok) { setError(value.error); boundary.fail(value.error); return; }
      setPreview({ value: value.data, body, tag }); setUncertain(false);
    } finally { lock.current = false; if (instance === lifetime.current) setBusy(null); }
  }
  async function decide(outcome: DecideRefund["outcome"]) {
    if (blocked || lock.current || !tag || !account.accountId || uncertain) return;
    if (!validMethodText(reason, 2000, 1) || !reason.trim()) { setInvalid("reason"); reasonField.current?.focus(); return; }
    if (outcome === "APPROVE" && !currentPreview) { setInvalid("amount"); return; }
    const command: DecideRefund = { outcome, reason, previewFingerprint: outcome === "APPROVE" ? currentPreview!.fingerprint : null, amountMinor: outcome === "APPROVE" ? currentPreview!.amountMinor : null, allocations: outcome === "APPROVE" ? currentPreview!.allocations : [] };
    const attempt = refundIntent(intention.current, `decision:${request.id}`, account.accountId, command, () => crypto.randomUUID()); intention.current = attempt;
    const scope = boundary.capture(), instance = lifetime.current; sequence.current++; lock.current = true; setBusy("decision"); setError(null);
    try {
      const value = await decideRefund(request.id, tag, command, attempt.key, attempt.accountId);
      if (instance !== lifetime.current) return;
      if (!boundary.isCurrent(scope)) { setUncertain(true); return; }
      if (!value.ok) { setError(value.error); boundary.fail(value.error); setPreview(null); setUncertain(value.error.kind === "unavailable" || value.error.kind === "invalid-response"); return; }
      setRecorded(true); setApproveOpen(false); setRejectOpen(false); setPreview(null); onUpdated();
    } finally { lock.current = false; if (instance === lifetime.current) setBusy(null); }
  }
  async function reviewCurrent() {
    if (lock.current || account.status !== "active") return;
    const scope = boundary.capture(), instance = lifetime.current; lock.current = true; setBusy("read");
    try { const value = await getRefundRequest(request.id, true); if (instance !== lifetime.current || !boundary.isCurrent(scope)) return; if (!value.ok) { setError(value.error); boundary.fail(value.error); return; } setUncertain(false); setPreview(null); onUpdated(); }
    finally { lock.current = false; if (instance === lifetime.current) setBusy(null); }
  }
  return <section className="min-w-0 space-y-6 rounded-panel border border-border p-4 sm:p-6" data-refund-decision-state={busy ?? (uncertain ? "uncertain" : recorded ? "recorded" : currentPreview ? "previewed" : "draft")}><h2 className="text-2xl font-semibold">{t.decision}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t.decisionHelp}</p>
    <form className="space-y-5" noValidate onSubmit={event => { event.preventDefault(); void preparePreview(); }}><FormField id={`${id}-amount`} label={account.status === "active" ? `${t.amount} (${context.currency})` : t.amount} hint={t.amountHelp} required error={invalid === "amount" ? s.allocationInvalid : undefined}><Input ref={amountField} inputMode="decimal" value={amount} disabled={blocked || busy === "decision"} onChange={event => { setAmount(event.target.value); edited(); }} /></FormField>{account.status === "active" && <RefundAllocationEditor locale={locale} lines={context.lines} currency={context.currency} value={draft} disabled={blocked || busy === "decision"} onChange={value => { setDraft(value); edited(); }} />}<Button type="submit" variant="secondary" busy={busy === "preview"} loadingLabel={t.previewing} disabled={blocked || busy === "decision"} className="max-w-full whitespace-normal">{t.preview}</Button></form>
    <FormField id={`${id}-reason`} label={t.decisionReason} required error={invalid === "reason" ? t.reasonRequired : undefined}><TextArea ref={reasonField} rows={4} maxLength={2000} readOnly={blocked || busy === "decision"} value={reason} onChange={event => { setReason(event.target.value); setInvalid(null); }} /></FormField>
    {account.status === "active" && currentPreview && <section className="space-y-4 rounded-panel border border-brand/30 bg-brand-soft p-4" data-refund-preview><h3 className="text-xl font-semibold">{t.previewTitle}</h3><p className="text-sm leading-relaxed">{t.previewHelp}</p><p className="text-2xl font-semibold">{refundMoney(locale, currentPreview.amountMinor, currentPreview.currency)}</p>{currentPreview.fullRefund && <StatusMessage tone="warning">{s.fullRefund}</StatusMessage>}<RefundAllocations locale={locale} allocations={currentPreview.allocations} lines={currentPreview.lines} currency={currentPreview.currency} /></section>}
    {!currentPreview && proposal && <p className="text-sm text-muted-foreground">{t.previewRequired}</p>}
    <div className="flex flex-wrap gap-3"><ConfirmationDialog open={approveOpen} onOpenChange={value => { if (!busy) setApproveOpen(value); }} title={t.approveTitle} description={s.effectConfirm} confirmLabel={t.approve} cancelLabel={t.cancel} destructive={false} busy={busy === "decision"} trigger={<Button className="max-w-full whitespace-normal" disabled={blocked || !currentPreview || !reason.trim() || Boolean(busy) || uncertain}>{t.approve}</Button>} onConfirm={event => { event.preventDefault(); void decide("APPROVE"); }}>{account.status === "active" && currentPreview && <div className="space-y-4"><p className="text-xl font-semibold">{refundMoney(locale, currentPreview.amountMinor, currentPreview.currency)}</p><RefundAllocations locale={locale} allocations={currentPreview.allocations} lines={currentPreview.lines} currency={currentPreview.currency} /><p className="whitespace-pre-wrap break-words text-sm">{reason}</p></div>}{error && <RefundError locale={locale} error={error} />}</ConfirmationDialog>
      <ConfirmationDialog open={rejectOpen} onOpenChange={value => { if (!busy) setRejectOpen(value); }} title={t.rejectTitle} description={t.decisionHelp} confirmLabel={t.reject} cancelLabel={t.cancel} busy={busy === "decision"} trigger={<Button variant="secondary" className="max-w-full whitespace-normal" disabled={blocked || !reason.trim() || Boolean(busy) || uncertain}>{t.reject}</Button>} onConfirm={event => { event.preventDefault(); void decide("REJECT"); }}><p className="whitespace-pre-wrap break-words text-sm">{reason}</p>{error && <RefundError locale={locale} error={error} />}</ConfirmationDialog></div>
    {recorded && <StatusMessage tone="success">{s.decisionRecorded}</StatusMessage>}{error && <RefundError locale={locale} error={error} />}{uncertain && <StatusMessage tone="warning">{t.unconfirmed}</StatusMessage>}{(uncertain || error?.status === 412 || error?.status === 409) && <Button variant="secondary" disabled={Boolean(busy) || account.status !== "active"} onClick={() => void reviewCurrent()}>{s.reload}</Button>}{reason && <RefundTextCopy locale={locale} value={reason} />}
  </section>;
}
