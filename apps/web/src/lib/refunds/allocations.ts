import type { PreviewRefund, RefundAllocation, RefundLine } from "../api/generated/types.gen";
import { parseRefundAmount, refundAmountInput } from "./amount";

export type AllocationDraft = Record<string, { selected: boolean; amount: string; accessAction: "KEEP" | "REVOKE" | "" }>;
export function initialAllocationDraft(lines: RefundLine[], allocations: RefundAllocation[] = [], currency: string): AllocationDraft {
  return Object.fromEntries(lines.map(line => { const item = allocations.find(value => value.orderResourceId === line.orderResourceId); return [line.orderResourceId, { selected: Boolean(item), amount: item ? refundAmountInput(item.amountMinor, currency) ?? "" : "", accessAction: item?.accessAction ?? "" }]; }));
}
export function allocationProposal(lines: RefundLine[], draft: AllocationDraft, totalInput: string, currency: string): PreviewRefund | null {
  const amountMinor = parseRefundAmount(totalInput, currency);
  if (amountMinor === null || amountMinor > 99_999_999) return null;
  const allocations: RefundAllocation[] = [];
  for (const line of lines) {
    const item = draft[line.orderResourceId]; if (!item?.selected) continue;
    const value = parseRefundAmount(item.amount, currency, true);
    if (value === null || !item.accessAction) return null;
    allocations.push({ orderResourceId: line.orderResourceId, amountMinor: value, accessAction: item.accessAction });
  }
  return allocations.length > 0 && allocations.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n) === BigInt(amountMinor) ? { amountMinor, allocations } : null;
}
