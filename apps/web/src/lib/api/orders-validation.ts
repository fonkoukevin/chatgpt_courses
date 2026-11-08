import type { CoverageResource, OrderPage, OrderSnapshot, OrderSummary, OrderView, PurchaseContext, PurchaseCoverage } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
import { commerceExact as exact, commerceInteger as integer, commerceInstant as instant, commerceLocales as locales, commerceLocale as locale, commerceSlug as slug, commerceString as text, isCommerceMoney, isOfferConditions, isOfferTax, isPublicOffer } from "./offers-validation";
import { commerceCurrencyScale } from "../commerce/format";
import { orderStatuses, paymentStatuses, fulfillmentStatuses } from "./payments-validation";

function statuses(value: Record<string, unknown>) { return typeof value.orderStatus === "string" && orderStatuses.includes(value.orderStatus) && typeof value.paymentStatus === "string" && paymentStatuses.includes(value.paymentStatus) && typeof value.fulfillmentStatus === "string" && fulfillmentStatuses.includes(value.fulfillmentStatus); }
function dates(value: Record<string, unknown>) { return instant(value.createdAt) && instant(value.expiresAt) && Date.parse(value.expiresAt) > Date.parse(value.createdAt); }
export function isOrderSnapshot(value: unknown): value is OrderSnapshot {
  if (!record(value) || !exact(value, ["offerId", "offerRevision", "offerRevisionId", "code", "kind", "locale", "title", "resources", "locales", "total", "tax", "conditions"]) || !isUuid(value.offerId) || !integer(value.offerRevision) || !isUuid(value.offerRevisionId)
    || typeof value.code !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.code) || !["COURSE", "PACK"].includes(value.kind as string) || !locale(value.locale) || !text(value.title, 180, 1)
    || !locales(value.locales) || !value.locales.length || !value.locales.includes(value.locale) || !isCommerceMoney(value.total) || !Object.hasOwn(commerceCurrencyScale, value.total.currency)
    || !isOfferTax(value.tax) || !value.tax.mode || value.tax.mode === "EXCLUSIVE" || !isOfferConditions(value.conditions)) return false;
  const c = value.conditions, tax = value.tax, includedLocales = value.locales;
  if (!c.access?.mode || !c.updates?.mode || !c.versionPolicy || !c.support?.mode || c.humanReviewIncluded || !c.termsVersion || [c.access, c.updates].some((period) => ["FIXED", "PERIOD"].includes(period.mode!) && period.days === null)) return false;
  if (!includedLocales.every((language) => c.terms.some((item) => item.locale === language && item.text.trim()) && tax.notices.some((item) => item.locale === language && item.text.trim()) && (c.support?.mode === "NONE" || c.support?.descriptions.some((item) => item.locale === language && item.text.trim())))) return false;
  return Array.isArray(value.resources) && value.resources.length >= (value.kind === "PACK" ? 2 : 1) && value.resources.length <= 20 && (value.kind !== "COURSE" || value.resources.length === 1) && value.resources.every((item) => record(item) && exact(item, ["id", "resourceId", "versionId", "versionNumber", "title", "slug", "locales"]) && isUuid(item.id) && isUuid(item.resourceId) && isUuid(item.versionId) && integer(item.versionNumber, 1) && text(item.title, 240, 1) && slug(item.slug) && locales(item.locales) && item.locales.length === includedLocales.length && item.locales.every((language) => includedLocales.includes(language))) && new Set(value.resources.map((item) => item.resourceId)).size === value.resources.length && new Set(value.resources.map((item) => item.id)).size === value.resources.length;
}
export function isOrderView(value: unknown): value is OrderView {
  return record(value) && exact(value, ["id", "revision", "orderStatus", "paymentStatus", "fulfillmentStatus", "snapshot", "acceptedTermsVersion", "acceptedAt", "createdAt", "expiresAt"]) && isUuid(value.id) && integer(value.revision) && statuses(value) && dates(value)
    && isOrderSnapshot(value.snapshot) && value.acceptedTermsVersion === value.snapshot.conditions.termsVersion && instant(value.acceptedAt) && value.acceptedAt === value.createdAt;
}
export function isOrderSummary(value: unknown): value is OrderSummary {
  return record(value) && exact(value, ["id", "revision", "offerId", "offerRevision", "locale", "title", "total", "orderStatus", "paymentStatus", "fulfillmentStatus", "createdAt", "expiresAt"]) && isUuid(value.id) && integer(value.revision) && isUuid(value.offerId) && integer(value.offerRevision) && locale(value.locale) && text(value.title, 180, 1) && isCommerceMoney(value.total) && Object.hasOwn(commerceCurrencyScale, value.total.currency) && statuses(value) && dates(value);
}
export function isOrderPage(value: unknown): value is OrderPage {
  return record(value) && exact(value, ["items", "page", "pageSize", "total"]) && integer(value.page, 0, 1_000_000) && integer(value.pageSize, 1, 100) && integer(value.total) && Array.isArray(value.items) && value.items.length <= value.pageSize && value.items.every(isOrderSummary) && new Set(value.items.map((item: OrderSummary) => item.id)).size === value.items.length;
}
function covered(value: unknown): value is CoverageResource {
  if (!record(value) || !exact(value, ["resourceId", "versionId", "coveredLocales", "missingLocales", "alreadyAccessible"]) || !isUuid(value.resourceId) || !isUuid(value.versionId) || !locales(value.coveredLocales) || !locales(value.missingLocales)) return false;
  const missing = value.missingLocales;
  return typeof value.alreadyAccessible === "boolean" && value.alreadyAccessible === (missing.length === 0 && value.coveredLocales.length > 0) && !value.coveredLocales.some((language) => missing.includes(language));
}
function coverage(value: unknown): value is PurchaseCoverage {
  if (!record(value) || !exact(value, ["status", "resources", "alreadyAccessibleCount", "newResourceCount"]) || !Array.isArray(value.resources) || !value.resources.every(covered) || !integer(value.alreadyAccessibleCount) || !integer(value.newResourceCount)) return false;
  return value.alreadyAccessibleCount === value.resources.filter((item: CoverageResource) => item.alreadyAccessible).length && value.newResourceCount + value.alreadyAccessibleCount === value.resources.length
    && value.status === (value.resources.length > 0 && value.newResourceCount === 0 ? "ALL" : value.resources.some((item: CoverageResource) => item.coveredLocales.length > 0) ? "PARTIAL" : "NONE");
}
export function isPurchaseContext(value: unknown): value is PurchaseContext {
  if (!record(value) || !exact(value, ["offer", "coverage", "activeOrder"]) || !isPublicOffer(value.offer) || !coverage(value.coverage) || !(value.activeOrder === null || isOrderSummary(value.activeOrder))) return false;
  const offer = value.offer;
  return value.coverage.resources.length === offer.resources.length && new Set(value.coverage.resources.map((item) => item.resourceId)).size === offer.resources.length && value.coverage.resources.every((item) => offer.resources.some((resource) => resource.resourceId === item.resourceId && resource.versionId === item.versionId) && new Set([...item.coveredLocales, ...item.missingLocales]).size === offer.locales.length && [...item.coveredLocales, ...item.missingLocales].every((language) => offer.locales.includes(language)))
    && (value.activeOrder === null || value.activeOrder.offerId === offer.id && ["PREPARED", "AWAITING_PAYMENT", "CONFIRMED", "NEEDS_REVIEW"].includes(value.activeOrder.orderStatus));
}
export const orderEtag = (value: OrderView) => `"order-${value.id}-r${value.revision}"`;
