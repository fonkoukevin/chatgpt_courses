import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { listOffers, offerListPath, type CourseOfferFilter } from "../../apps/web/src/lib/api/commerce-client";
import type { OfferSummary, PublicOffer } from "../../apps/web/src/lib/api/generated/types.gen";
import { matchesCourseOffer } from "../../apps/web/src/lib/commerce/course-offers";
import { offersHref, safeCommerceDestination, translateCommerceDestination } from "../../apps/web/src/lib/commerce/routes";

const originalFetch = globalThis.fetch;
const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const course: CourseOfferFilter = { resourceId: uuid(1), versionId: uuid(2) };
const texts = (text: string) => [{ locale: "fr" as const, text }, { locale: "en" as const, text }];
function offer(): PublicOffer {
  return { id: uuid(3), productId: uuid(4), revision: 6, code: "synthetic-course-offer", kind: "COURSE", state: "ACTIVE", locale: "fr", translationAvailable: true,
    title: "Synthetic offer", summary: "Transport verification only", resources: [{ ...course, versionNumber: 2, locale: "fr", title: "Synthetic course", slug: "synthetic-course", availability: "PUBLISHED", access: "PROTECTED" }],
    locales: ["fr", "en"], price: { amountMinor: 1234, currency: "EUR" }, tax: { mode: "EXEMPT", notices: texts("Synthetic notice") },
    conditions: { access: { mode: "FIXED", days: 30 }, updates: { mode: "NONE", days: null }, versionPolicy: "PINNED", support: { mode: "NONE", descriptions: [] }, humanReviewIncluded: false, termsVersion: "synthetic-v1", terms: texts("Synthetic terms") },
    readiness: { offerId: uuid(3), checkedRevision: 6, summaryReady: true, checkoutAvailable: false, blockingIssues: [], warnings: [], checkoutUnavailableReason: "PAYMENT_NOT_CONFIGURED" } };
}
function summary(value: PublicOffer): OfferSummary {
  const { productId: _productId, resources: _resources, locales: _locales, tax: _tax, conditions: _conditions, readiness: _readiness, ...result } = value;
  return result;
}
afterEach(() => { globalThis.fetch = originalFetch; });

test("le lien parcours exige les mêmes offre et révision sélectionnées, avec cours/version/langue publiés exacts", () => {
  const value = offer(), selected = summary(value);
  assert.equal(matchesCourseOffer(value, selected, course, "fr"), true);
  const pack = { ...value, kind: "PACK" as const, resources: [{ ...value.resources[0], resourceId: uuid(10), versionId: uuid(11) }, value.resources[0]] };
  assert.equal(matchesCourseOffer(pack, { ...selected, kind: "PACK" }, course, "fr"), true);
  for (const changed of [{ ...value, id: uuid(20) }, { ...value, revision: 7 }, { ...value, state: "INACTIVE" as const },
    { ...value, locale: "en" as const }, { ...value, translationAvailable: false }, { ...value, locales: ["en" as const] },
    { ...value, resources: [{ ...value.resources[0], resourceId: uuid(21) }] }, { ...value, resources: [{ ...value.resources[0], versionId: uuid(22) }] },
    { ...value, resources: [{ ...value.resources[0], locale: "en" as const }] }]) {
    assert.equal(matchesCourseOffer(changed, selected, course, "fr"), false);
  }
  for (const availability of ["STALE", "UNAVAILABLE", "TRANSLATION_MISSING", "ARCHIVED", "WITHDRAWN"] as const) {
    assert.equal(matchesCourseOffer({ ...value, resources: [{ ...value.resources[0], availability }] }, selected, course, "fr"), false);
  }
});

test("le filtre API conserve les deux identifiants et sa pagination sans transmettre la session", async () => {
  const value = offer(), expected = `/offers?locale=fr&page=2&pageSize=7&resourceId=${course.resourceId}&versionId=${course.versionId}`;
  assert.equal(offerListPath("fr", 2, 7, course), expected);
  let reads = 0;
  globalThis.fetch = async (path, init) => {
    reads++; assert.equal(path, `/api/v1${expected}`); assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error"); assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return Response.json({ items: [summary(value)], page: 2, pageSize: 7, total: 15 });
  };
  assert.equal((await listOffers("fr", 2, 7, course)).ok, true); assert.equal(reads, 1);
});

test("les identifiants incomplets et les paginations hors limites sont rejetés avant toute requête", () => {
  for (const filter of [{ resourceId: course.resourceId }, { versionId: course.versionId }, { ...course, resourceId: "../offers" }, { ...course, versionId: "" }]) {
    assert.throws(() => offerListPath("fr", 0, 3, filter as CourseOfferFilter));
  }
  for (const [page, pageSize] of [[-1, 3], [1.5, 3], [1_000_001, 3], [0, 0], [0, 101]]) assert.throws(() => offerListPath("fr", page, pageSize, course));
});

test("une réponse de liste incohérente ou une panne reste une erreur, jamais une liste vide confirmée", async () => {
  const value = offer();
  for (const response of [{ items: [summary(value)], page: 1, pageSize: 3, total: 1 }, { items: [summary(value)], page: 0, pageSize: 20, total: 1 },
    { items: [{ ...summary(value), locale: "en" }], page: 0, pageSize: 3, total: 1 }]) {
    globalThis.fetch = async () => Response.json(response);
    const result = await listOffers("fr", 0, 3, course);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, "invalid-response");
  }
  globalThis.fetch = async () => Response.json({}, { status: 503 });
  assert.equal((await listOffers("fr", 0, 3, course)).ok, false);
  globalThis.fetch = async () => { throw new TypeError("Synthetic unavailable service"); };
  const unavailable = await listOffers("fr", 0, 3, course);
  assert.equal(unavailable.ok, false); if (!unavailable.ok) assert.equal(unavailable.error.kind, "unavailable");
});

test("les retours et changements de langue conservent le filtre pairé et la pagination", () => {
  for (const locale of ["fr", "en"] as const) {
    const destination = offersHref(locale, { page: 2, pageSize: 7 }, course), parsed = new URL(destination, "https://courses.invalid");
    assert.equal(parsed.searchParams.get("resourceId"), course.resourceId); assert.equal(parsed.searchParams.get("versionId"), course.versionId);
    assert.equal(safeCommerceDestination(destination, locale), destination);
    const other = locale === "fr" ? "en" : "fr", translated = translateCommerceDestination(destination, other);
    assert.equal(translated, offersHref(other, { page: 2, pageSize: 7 }, course));
    assert.equal(translateCommerceDestination(translated, locale), destination);
  }
});

test("les filtres orphelins, dupliqués ou détournés ne deviennent jamais une destination de retour", () => {
  const base = offersHref("fr", {}, course);
  for (const destination of [`/fr/offres?resourceId=${course.resourceId}`, `/fr/offres?versionId=${course.versionId}`, `${base}&resourceId=${course.resourceId}`,
    `${base}&versionId=${uuid(9)}`, base.replace(course.versionId, "invalid"), `${base}&page=1&page=2`, `${base}&pageSize=101`, `${base}&page=1000001`,
    `${base}&returnTo=https://example.invalid`, base.replace("/fr/offres", "/fr/commandes"), `https://example.invalid${base}`, `/${base}`, `${base}#fragment`, `${base}%26page=1`]) {
    assert.equal(safeCommerceDestination(destination, "fr"), null);
    assert.equal(translateCommerceDestination(destination, "en"), null);
  }
});
