import type { LocalizedText, Money } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";

// These currencies have two minor-unit decimals. Adding another currency requires
// its explicit exponent here as well as the server's sales allowlist.
export const commerceCurrencyScale: Readonly<Record<string, number>> = { EUR: 2, USD: 2, GBP: 2 };
export function commerceMoney(value: Money | null, locale: Locale): string | null {
  if (!value || !Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0 || !Object.hasOwn(commerceCurrencyScale, value.currency)) return null;
  const amount = BigInt(value.amountMinor), whole = amount / 100n, fraction = String(amount % 100n).padStart(2, "0");
  const parts = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: value.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(whole);
  return parts.map((part) => part.type === "fraction" ? fraction : part.value).join("");
}
export const commerceText = (values: LocalizedText[], locale: Locale) => values.find((value) => value.locale === locale)?.text || null;
