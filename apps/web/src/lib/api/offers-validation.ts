import type { CommerceIssue, LocalizedText, Money, OfferConditions, OfferPage, OfferReadiness, OfferResource, OfferSummary, OfferTax, PublicOffer } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { commerceCurrencyScale } from "../commerce/format";

export const commerceExact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
export const commerceInteger = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
export const commerceString = (value: unknown, max: number, min = 0): value is string => typeof value === "string" && Array.from(value).length >= min && Array.from(value).length <= max;
export const commerceLocale = (value: unknown): value is "fr" | "en" => value === "fr" || value === "en";
export const commerceLocales = (value: unknown): value is Array<"fr" | "en"> => Array.isArray(value) && value.length <= 2 && value.every(commerceLocale) && new Set(value).size === value.length;
export const commerceInstant = (value: unknown): value is string => typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
export const commerceSlug = (value: unknown): value is string => typeof value === "string" && value.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const commerceCode = (value: unknown): value is string => typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value);
export function isCommerceMoney(value: unknown): value is Money { return record(value) && commerceExact(value, ["amountMinor", "currency"]) && commerceInteger(value.amountMinor) && typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency); }
function localized(value: unknown, max: number): value is LocalizedText[] {
  return Array.isArray(value) && value.length <= 2 && value.every((item) => record(item) && commerceExact(item, ["locale", "text"]) && commerceLocale(item.locale) && commerceString(item.text, max)) && new Set(value.map((item: LocalizedText) => item.locale)).size === value.length;
}
export function isOfferTax(value: unknown): value is OfferTax { return record(value) && commerceExact(value, ["mode", "notices"]) && (value.mode === null || ["INCLUSIVE", "EXEMPT", "EXCLUSIVE"].includes(value.mode as string)) && localized(value.notices, 2000); }
export function isOfferConditions(value: unknown): value is OfferConditions {
  if (!record(value) || !commerceExact(value, ["access", "updates", "versionPolicy", "support", "humanReviewIncluded", "termsVersion", "terms"]) || typeof value.humanReviewIncluded !== "boolean" || !localized(value.terms, 8000)) return false;
  for (const [key, modes] of [["access", ["FIXED", "UNLIMITED"]], ["updates", ["NONE", "PERIOD"]]] as const) {
    const period = value[key]; if (period === null) continue;
    if (!record(period) || !commerceExact(period, ["mode", "days"]) || period.mode !== null && !(modes as readonly unknown[]).includes(period.mode) || (period.days !== null && (!commerceInteger(period.days, 1, 36500) || !["FIXED", "PERIOD"].includes(period.mode as string)))) return false;
  }
  return (value.versionPolicy === null || value.versionPolicy === "PINNED" || value.versionPolicy === "UPDATES_DURING_PERIOD")
    && (value.termsVersion === null || commerceString(value.termsVersion, 100))
    && (value.support === null || record(value.support) && commerceExact(value.support, ["mode", "descriptions"]) && (value.support.mode === null || ["NONE", "ASYNC"].includes(value.support.mode as string)) && localized(value.support.descriptions, 2000));
}
function issue(value: unknown): value is CommerceIssue { return record(value) && commerceExact(value, ["code", "field", "resourceId", "locale"]) && commerceCode(value.code) && (value.field === null || commerceString(value.field, 200, 1)) && (value.resourceId === null || isUuid(value.resourceId)) && (value.locale === null || commerceLocale(value.locale)); }
export function isOfferReadiness(value: unknown): value is OfferReadiness {
  return record(value) && commerceExact(value, ["offerId", "checkedRevision", "summaryReady", "checkoutAvailable", "blockingIssues", "warnings", "checkoutUnavailableReason"])
    && isUuid(value.offerId) && commerceInteger(value.checkedRevision) && typeof value.summaryReady === "boolean" && typeof value.checkoutAvailable === "boolean"
    && Array.isArray(value.blockingIssues) && value.blockingIssues.length <= 1000 && value.blockingIssues.every(issue) && Array.isArray(value.warnings) && value.warnings.length <= 1000 && value.warnings.every(issue)
    && value.summaryReady === (value.blockingIssues.length === 0) && (value.checkoutAvailable ? value.summaryReady && value.checkoutUnavailableReason === null : commerceCode(value.checkoutUnavailableReason));
}
function resource(value: unknown): value is OfferResource {
  return record(value) && commerceExact(value, ["resourceId", "versionId", "versionNumber", "locale", "title", "slug", "availability", "access"])
    && isUuid(value.resourceId) && isUuid(value.versionId) && commerceInteger(value.versionNumber, 1) && commerceLocale(value.locale) && (value.title === null || commerceString(value.title, 240, 1)) && (value.slug === null || commerceSlug(value.slug))
    && ["PUBLISHED", "STALE", "UNAVAILABLE", "TRANSLATION_MISSING", "ARCHIVED", "WITHDRAWN"].includes(value.availability as string) && (value.access === null || value.access === "FREE" || value.access === "PROTECTED")
    && (value.availability !== "PUBLISHED" || value.title !== null && value.slug !== null && value.access !== null);
}
export function isOfferSummary(value: unknown): value is OfferSummary {
  return record(value) && commerceExact(value, ["id", "revision", "code", "kind", "state", "locale", "translationAvailable", "title", "summary", "price"])
    && isUuid(value.id) && commerceInteger(value.revision) && typeof value.code === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value.code) && (value.kind === "COURSE" || value.kind === "PACK")
    && (value.state === "ACTIVE" || value.state === "INACTIVE") && commerceLocale(value.locale) && typeof value.translationAvailable === "boolean"
    && (value.translationAvailable ? commerceString(value.title, 180) && commerceString(value.summary, 2000) : value.title === null && value.summary === null) && (value.price === null || isCommerceMoney(value.price));
}
export function isOfferPage(value: unknown): value is OfferPage {
  return record(value) && commerceExact(value, ["items", "page", "pageSize", "total"]) && commerceInteger(value.page, 0, 1_000_000) && commerceInteger(value.pageSize, 1, 100) && commerceInteger(value.total)
    && Array.isArray(value.items) && value.items.length <= value.pageSize && value.items.every(isOfferSummary) && new Set(value.items.map((item: OfferSummary) => item.id)).size === value.items.length;
}
export function isPublicOffer(value: unknown): value is PublicOffer {
  if (!record(value) || !commerceExact(value, ["id", "productId", "revision", "code", "kind", "state", "locale", "translationAvailable", "title", "summary", "resources", "locales", "price", "tax", "conditions", "readiness"])) return false;
  const { productId, resources, locales, tax, conditions, readiness, ...summary } = value;
  if (!isOfferSummary(summary) || !isUuid(productId) || !Array.isArray(resources) || resources.length > 20 || !resources.every(resource) || resources.some((item) => item.locale !== summary.locale)
    || new Set(resources.map((item) => item.resourceId)).size !== resources.length || !commerceLocales(locales) || !(tax === null || isOfferTax(tax)) || !(conditions === null || isOfferConditions(conditions))
    || !isOfferReadiness(readiness) || readiness.offerId !== summary.id || readiness.checkedRevision !== summary.revision) return false;
  if (!readiness.summaryReady) return true;
  return summary.price !== null && Object.hasOwn(commerceCurrencyScale, summary.price.currency) && locales.length > 0
    && resources.length >= (summary.kind === "PACK" ? 2 : 1) && (summary.kind !== "COURSE" || resources.length === 1) && (!locales.includes(summary.locale) || summary.translationAvailable && resources.every((item) => item.availability === "PUBLISHED"))
    && tax !== null && Boolean(tax.mode) && tax.mode !== "EXCLUSIVE" && conditions !== null && Boolean(conditions.access?.mode) && Boolean(conditions.updates?.mode) && conditions.versionPolicy !== null && Boolean(conditions.support?.mode) && !conditions.humanReviewIncluded && Boolean(conditions.termsVersion?.trim()) && locales.every((locale) => conditions.terms.some((item) => item.locale === locale && item.text.trim()) && tax.notices.some((item) => item.locale === locale && item.text.trim()) && (conditions.support!.mode === "NONE" || conditions.support!.descriptions.some((item) => item.locale === locale && item.text.trim())));
}
