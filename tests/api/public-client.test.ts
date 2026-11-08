import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";
import { searchCatalogue, resourceSlugPath } from "../../apps/web/src/lib/api/public-client";
import { decodePublicResponse } from "../../apps/web/src/lib/api/public-response";
import { isCataloguePage, isPublicDocument, isResourceDetail } from "../../apps/web/src/lib/api/public-validation";
import type { PublicDocument, ResourceCard, ResourceDetail } from "../../apps/web/src/lib/api/generated/types.gen";
import { courseActivityHref, resourceHref } from "../../apps/web/src/lib/public/routes";
import { parseCatalogueQuery, safeCatalogueReturnTo } from "../../apps/web/src/lib/public/query";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const metadata = { goalCodes: [], level: null, audience: [], tools: [], sources: [], faq: [], evaluationDescription: null };
const document: PublicDocument = { objective: "Fictional unit-test objective", expectedResult: "Fictional unit-test result", prerequisites: [], blocks: [{ type: "PARAGRAPH", text: "A safe unit-test paragraph.", url: null }], estimatedMinutes: null, quiz: [{ key: "q1", prompt: "A test question", options: ["Option A", "Option B"], points: 1 }], rubric: [], access: "FREE", media: [], relatedResourceIds: [], exerciseInstructions: "A fictional exercise.", methodDefinition: null };
function resource(): ResourceDetail {
  return { resourceId: randomUUID(), kind: "ACTIVITY", versionId: randomUUID(), versionNumber: 1, locale: "en", slug: "unit-test", availability: "PUBLISHED", revisionId: randomUUID(), title: "Unit test", summary: "Fictional test data", access: "FREE", document, metadata, reviewedAt: "2026-11-08T00:00:00Z", languages: [{ locale: "en", status: "PUBLISHED", slug: "unit-test" }, { locale: "fr", status: "MISSING_TRANSLATION", slug: null }], curriculum: [], related: [], objective: document.objective, expectedResult: document.expectedResult, prerequisites: [], estimatedMinutes: null };
}
test("une projection publique refuse les réponses de quiz et tout corps protégé", () => {
  const value = resource();
  assert.equal(isResourceDetail(value), true);
  assert.equal(isPublicDocument({ ...document, quiz: [{ ...document.quiz[0], correctOption: 0 }] }), false);
  assert.equal(isPublicDocument({ ...document, exercise: { instructions: "Test", correction: "Private correction" } }), false);
  assert.equal(isResourceDetail({ ...value, access: "PROTECTED" }), false);
  assert.equal(isResourceDetail({ ...value, availability: "STALE" }), false);
  assert.equal(isResourceDetail({ ...value, access: "PROTECTED", document: null }), true);
  assert.equal(isResourceDetail({ ...value, ownerEmail: "unexpected-private-field@example.invalid" }), false);
});
test("le catalogue vide est une réponse valide distincte d'une erreur ou d'une forme inattendue", async () => {
  const empty = { items: [], page: 0, pageSize: 20, total: 0 };
  assert.deepEqual(await decodePublicResponse(Response.json(empty), isCataloguePage), { ok: true, data: empty, status: 200 });
  assert.deepEqual(await decodePublicResponse(Response.json({ ...empty, demoFallback: true }), isCataloguePage), { ok: false, error: { kind: "invalid-response", status: 200 } });
  const problem = { type: "about:blank", title: "Unavailable", status: 503, detail: "Safe unit-test failure", instance: "/api/v1/catalog", code: "DATABASE_UNAVAILABLE", traceId: randomUUID() };
  const result = await decodePublicResponse(Response.json(problem, { status: 503, headers: { "Content-Type": "application/problem+json" } }), isCataloguePage);
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, "unavailable");
});
test("les lectures publiques utilisent tous les filtres sans cookie ni cache partagé implicite", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "https://example.invalid");
    assert.equal(url.pathname, "/api/v1/catalog"); assert.equal(url.searchParams.get("q"), "brief & résultat"); assert.equal(url.searchParams.get("locale"), "en"); assert.equal(url.searchParams.get("goal"), "check-output"); assert.equal(url.searchParams.get("page"), "2");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "omit"); assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return Response.json({ items: [], page: 2, pageSize: 1, total: 2 });
  };
  assert.equal((await searchCatalogue({ locale: "en", q: "brief & résultat", goal: "check-output", page: 2, pageSize: 1 })).ok, true);
});
test("les liens gardent la langue du contenu et les versions exactes du programme", () => {
  const value = resource(); const card: ResourceCard = { ...value, kind: "ACTIVITY", slug: "unit-test", title: "Unit test", summary: "Test", revisionId: value.revisionId!, objective: "Test", expectedResult: "Test", access: "FREE", goalCodes: [], level: null };
  const discovery = new URL(resourceHref(card, "/fr/catalogue?locale=en"), "https://example.invalid");
  assert.equal(discovery.pathname, "/en/catalog"); assert.equal(discovery.searchParams.get("activity"), value.resourceId); assert.equal(discovery.searchParams.get("returnTo"), "/fr/catalogue?locale=en");
  const parentVersion = randomUUID();
  const course = new URL(courseActivityHref("en", "actual-course", "actual-activity", value.resourceId, value.versionId, parentVersion, "/fr/catalogue?locale=en&q=brief%20%26%20scope"), "https://example.invalid");
  assert.equal(course.pathname, "/en/learn/actual-course/actual-activity"); assert.equal(course.searchParams.get("version"), value.versionId); assert.equal(course.searchParams.get("courseVersion"), parentVersion);
  assert.equal(course.searchParams.get("returnTo"), "/fr/catalogue?locale=en&q=brief%20%26%20scope");
  assert.equal(resourceSlugPath("GUIDE", "a".repeat(180), "en").includes("a".repeat(180)), true);
  const guide = new URL(resourceHref({ ...card, kind: "GUIDE" }), "https://example.invalid");
  assert.equal(guide.searchParams.get("version"), value.versionId);
  assert.throws(() => resourceSlugPath("MODULE", "not-an-independent-page", "en"));
});

test("le retour de catalogue conserve les filtres valides et refuse redirection ou filtres ambigus", () => {
  const filtered = "/fr/catalogue?locale=en&type=ACTIVITY&goal=understand-brief&page=2&pageSize=1";
  assert.equal(safeCatalogueReturnTo(filtered, "en"), filtered);
  for (const unsafe of ["https://example.invalid/fr/catalogue", "//example.invalid/fr/catalogue", "/fr/catalogue?type=GUIDE&type=COURSE", "/fr/catalogue?returnTo=https://example.invalid", "/fr/catalogue#secret", "/fr/catalogue?locale=de", "/fr/catalogue?q=%0Aprivate", "/fr/catalogue?page=1000001"]) {
    assert.equal(safeCatalogueReturnTo(unsafe, "en"), "/en/catalog");
  }
  assert.equal(parseCatalogueQuery("fr", { locale: "en", type: "ACTIVITY", level: "BEGINNER", access: "FREE" })?.locale, "en");
  assert.equal(parseCatalogueQuery("fr", { type: ["GUIDE", "COURSE"] }), null);
});
