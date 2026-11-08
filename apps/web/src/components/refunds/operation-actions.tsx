"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button, ConfirmationDialog, FormField, StatusMessage, TextArea } from "@/components/ui";
import type { ApiError } from "@/lib/api/client";
import type { RefundContext, RefundOperationView, ResolveExternalRefund } from "@/lib/api/generated/types.gen";
import { cancelRefund, decideExternalRefundAccess, executeRefund, getRefundOperation, reconcileRefund } from "@/lib/api/refunds-client";
import { getRefundsDictionary, getRefundStateDictionary } from "@/lib/i18n/refunds";
import type { Locale } from "@/lib/i18n/locales";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";
import { validMethodText } from "@/lib/methods/validation";
import { allocationProposal, initialAllocationDraft } from "@/lib/refunds/allocations";
import { refundAmountInput } from "@/lib/refunds/amount";
import { refundIntent, type RefundIntent } from "@/lib/refunds/intent";
import { RefundAllocationEditor } from "./allocation-editor";
import { RefundAllocations, RefundError, RefundTextCopy, refundMoney } from "./parts";

type Action = "execute" | "cancel" | "reconcile" | "access";
export function RefundOperationActions({ locale, operation, tag, context, account, boundary, permissions, allowed, onUpdated }: { locale: Locale; operation: RefundOperationView; tag?: string; context: RefundContext; account: LearningAccountState; boundary: LearningAccountBoundary; permissions: string[]; allowed: boolean; onUpdated: () => void }) {
  const t = getRefundsDictionary(locale), s = getRefundStateDictionary(locale), id = useId(), reasonField = useRef<HTMLTextAreaElement>(null), lock = useRef(false), lifetime = useRef(0), intention = useRef<RefundIntent | null>(null);
  const [reason, setReason] = useState(""), [draft, setDraft] = useState(() => initialAllocationDraft(context.lines, operation.allocations, operation.currency)), [open, setOpen] = useState<Action | null>(null), [busy, setBusy] = useState<Action | "read" | null>(null), [error, setError] = useState<ApiError | null>(null), [invalid, setInvalid] = useState(false), [uncertain, setUncertain] = useState(false), [reviewRequired, setReviewRequired] = useState(false), [updated, setUpdated] = useState(false);
  useEffect(() => () => { lifetime.current++; }, []);
  const blocked = !allowed || account.status !== "active" || !tag || Boolean(busy) || uncertain || reviewRequired;
  const can = { execute: operation.canExecute && permissions.includes("refunds.execute"), cancel: operation.canCancel && permissions.includes("refunds.execute"), reconcile: operation.canReconcile && permissions.includes("refunds.reconcile"), access: operation.canDecideAccess && permissions.includes("refunds.decide") };
  const allocation = allocationProposal(context.lines, draft, refundAmountInput(operation.amountMinor, operation.currency) ?? "", operation.currency);
  const full = context.paidAmountMinor > 0 && context.confirmedRefundedMinor >= context.paidAmountMinor;
  const validAccess = allocation && (!full || (allocation.allocations.length === context.lines.length && allocation.allocations.every(value => value.accessAction === "REVOKE")));
  const labels = { execute: t.execute, cancel: s.cancelExecution, reconcile: t.reconcile, access: s.externalAccess };
  const titles = { execute: t.executeTitle, cancel: s.cancelExecution, reconcile: s.reconcileTitle, access: s.externalAccess };
  const descriptions = { execute: t.executeHelp, cancel: s.cancelExecutionHelp, reconcile: s.reconcileHelp, access: s.externalAccessHelp };
  async function perform(action: Action) {
    if (blocked || lock.current || !tag || !account.accountId || !can[action]) return;
    if (!reason.trim() || !validMethodText(reason, 2000, 1)) { setInvalid(true); reasonField.current?.focus(); return; }
    if (action === "access" && !validAccess) { setInvalid(true); return; }
    const command = action === "access" ? { reason, allocations: allocation!.allocations } : { reason };
    const attempt = refundIntent(intention.current, `${action}:${operation.id}`, account.accountId, command, () => crypto.randomUUID()); intention.current = attempt;
    const scope = boundary.capture(), instance = lifetime.current; lock.current = true; setBusy(action); setError(null); setUpdated(false);
    try {
      const value = action === "access" ? await decideExternalRefundAccess(operation.id, tag, command as ResolveExternalRefund, attempt.key, attempt.accountId) : await ({ execute: executeRefund, cancel: cancelRefund, reconcile: reconcileRefund }[action])(operation.id, tag, { reason }, attempt.key, attempt.accountId);
      if (instance !== lifetime.current) return;
      if (!boundary.isCurrent(scope)) { setUncertain(true); return; }
      if (!value.ok) { setError(value.error); boundary.fail(value.error); setUncertain(value.error.kind === "unavailable" || value.error.kind === "invalid-response"); setReviewRequired(value.error.status === 409 || value.error.status === 412); return; }
      setUpdated(true); setOpen(null); onUpdated();
    } finally { lock.current = false; if (instance === lifetime.current) setBusy(null); }
  }
  async function review() {
    if (lock.current || account.status !== "active") return;
    const scope = boundary.capture(), instance = lifetime.current; lock.current = true; setBusy("read");
    try { const value = await getRefundOperation(operation.id, true); if (instance !== lifetime.current || !boundary.isCurrent(scope)) return; if (!value.ok) { setError(value.error); boundary.fail(value.error); return; } setUncertain(false); setReviewRequired(false); setOpen(null); setError(null); onUpdated(); }
    finally { lock.current = false; if (instance === lifetime.current) setBusy(null); }
  }
  return <section className="min-w-0 space-y-5 rounded-panel border border-border p-4 sm:p-6" data-refund-action-state={busy ?? (uncertain ? "uncertain" : reviewRequired ? "review-required" : updated ? "updated" : "idle")}><h2 className="text-2xl font-semibold">{t.execution}</h2>
    <p className="text-sm leading-relaxed text-muted-foreground">{t.effectHelp}</p>
    {account.status === "active" && operation.canDecideAccess && <div className="space-y-4"><StatusMessage tone="warning">{s.externalReview}</StatusMessage>{full && <StatusMessage tone="warning">{s.fullRefund}</StatusMessage>}<RefundAllocationEditor locale={locale} lines={context.lines} currency={operation.currency} value={draft} disabled={blocked} onChange={value => { setDraft(value); setInvalid(false); }} />{invalid && !validAccess && <StatusMessage tone="danger">{s.allocationInvalid}</StatusMessage>}</div>}
    {Object.values(can).some(Boolean) && <FormField id={`${id}-reason`} label={s.actionReason} required hint={t.reasonHelp} error={invalid && !reason.trim() ? t.reasonRequired : undefined}><TextArea ref={reasonField} rows={4} value={reason} readOnly={blocked} maxLength={2000} onChange={event => { setReason(event.target.value); setInvalid(false); }} /></FormField>}
    <div className="flex flex-wrap gap-3">{(["execute", "cancel", "reconcile", "access"] as const).filter(action => can[action]).map(action => <ConfirmationDialog key={action} open={open === action} onOpenChange={value => { if (!busy) setOpen(value ? action : null); }} title={titles[action]} description={descriptions[action]} confirmLabel={labels[action]} cancelLabel={t.cancel} busy={busy === action} destructive={action !== "reconcile"} trigger={<Button variant={action === "execute" ? "destructive" : "secondary"} className="max-w-full whitespace-normal" disabled={blocked || !reason.trim() || (action === "access" && !validAccess)}>{labels[action]}</Button>} onConfirm={event => { event.preventDefault(); void perform(action); }}><div className="space-y-4">{account.status === "active" && <><p className="text-xl font-semibold">{refundMoney(locale, operation.amountMinor, operation.currency)}</p><RefundAllocations locale={locale} allocations={action === "access" ? allocation?.allocations ?? [] : operation.allocations} lines={context.lines} currency={operation.currency} /></>}<p className="whitespace-pre-wrap break-words text-sm">{reason}</p>{error && <RefundError locale={locale} error={error} />}{uncertain && <StatusMessage tone="warning">{t.unconfirmed}</StatusMessage>}{(uncertain || reviewRequired) && <Button variant="secondary" disabled={Boolean(busy) || account.status !== "active"} onClick={() => void review()}>{s.reload}</Button>}</div></ConfirmationDialog>)}</div>
    {updated && <StatusMessage>{s.operationUpdated}</StatusMessage>}{error && <RefundError locale={locale} error={error} />}{uncertain && <StatusMessage tone="warning">{t.unconfirmed}</StatusMessage>}{(uncertain || reviewRequired) && <Button variant="secondary" disabled={Boolean(busy) || account.status !== "active"} onClick={() => void review()}>{s.reload}</Button>}{reason && <RefundTextCopy locale={locale} value={reason} />}
  </section>;
}
