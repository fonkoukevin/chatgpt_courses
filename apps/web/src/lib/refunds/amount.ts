import { commerceCurrencyScale } from "../commerce/format";

/** The form proposes an exact amount; the server alone calculates what is refundable. */
export function parseRefundAmount(value: string, currency: string, allowZero = false): number | null {
  if (!Object.hasOwn(commerceCurrencyScale, currency)) return null;
  const scale = commerceCurrencyScale[currency as keyof typeof commerceCurrencyScale], match = /^(0|[1-9][0-9]*)(?:[.,]([0-9]+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > scale || match[1].length > 16) return null;
  const minor = BigInt(match[1]) * 10n ** BigInt(scale) + BigInt((match[2] ?? "").padEnd(scale, "0") || "0");
  return minor >= (allowZero ? 0n : 1n) && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}
export function refundAmountInput(amountMinor: number, currency: string): string | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Object.hasOwn(commerceCurrencyScale, currency)) return null;
  const scale = commerceCurrencyScale[currency as keyof typeof commerceCurrencyScale], base = 10n ** BigInt(scale), value = BigInt(amountMinor);
  return `${value / base}${scale ? `.${(value % base).toString().padStart(scale, "0")}` : ""}`;
}
