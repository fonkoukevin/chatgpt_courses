import type { Locale } from "../i18n/locales";
import { decimalCount, decimalSigned } from "../api/operations-validation";
export function operationsCount(value: string, locale: Locale): string { if (!decimalCount(value)) throw new Error("Invalid exact count."); return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(BigInt(value)); }
export function operationsMoney(value: string, currency: string, locale: Locale): string {
  if (!decimalSigned(value) || !["EUR","USD","GBP"].includes(currency)) throw new Error("Invalid exact monetary aggregate.");
  const amount=BigInt(value),negative=amount<0n,absolute=negative?-amount:amount,whole=absolute/100n,fraction=String(absolute%100n).padStart(2,"0");
  return new Intl.NumberFormat(locale==="fr"?"fr-FR":"en-GB",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).formatToParts(negative?(whole===0n?-0:-whole):whole).map(part=>part.type==="fraction"?fraction:part.value).join("");
}
