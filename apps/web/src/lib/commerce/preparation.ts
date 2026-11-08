import type { CreateOrder, OrderView, PublicOffer } from "../api/generated/types.gen";

export type OrderIntent = { key: string; accountId: string; body: CreateOrder };
export function orderIntent(previous: OrderIntent | null, body: CreateOrder, accountId: string, newKey: () => string): OrderIntent {
  const command = { offerId: body.offerId, offerRevision: body.offerRevision, locale: body.locale, acceptedTermsVersion: body.acceptedTermsVersion };
  return previous?.accountId === accountId && Object.entries(command).every(([key, value]) => previous.body[key as keyof CreateOrder] === value) ? previous : { key: newKey(), accountId, body: command };
}
export function orderAcknowledgesOffer(value: OrderView, offer: PublicOffer): boolean {
  return value.snapshot.offerId === offer.id && value.snapshot.offerRevision === offer.revision && value.snapshot.locale === offer.locale && value.acceptedTermsVersion === offer.conditions?.termsVersion
    && value.snapshot.total.amountMinor === offer.price?.amountMinor && value.snapshot.total.currency === offer.price.currency
    && value.snapshot.resources.length === offer.resources.length && value.snapshot.resources.every((item) => offer.resources.some((resource) => resource.resourceId === item.resourceId && resource.versionId === item.versionId));
}
