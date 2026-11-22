import type { OfferSummary, PublicOffer } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";
import type { CourseOfferFilter } from "../api/commerce-client";

export type CourseOfferSelection = { items: PublicOffer[]; total: number; moreHref: string };

// The selected public list proves curation; the detail must still describe that
// same revision and include the exact course, version and language being read.
export function matchesCourseOffer(offer: PublicOffer, summary: OfferSummary, course: CourseOfferFilter, locale: Locale): boolean {
  return offer.id === summary.id && offer.revision === summary.revision && offer.state === summary.state
    && offer.locale === locale && offer.translationAvailable && offer.locales.includes(locale)
    && offer.resources.some(resource => resource.resourceId === course.resourceId && resource.versionId === course.versionId
      && resource.locale === locale && resource.availability === "PUBLISHED");
}
