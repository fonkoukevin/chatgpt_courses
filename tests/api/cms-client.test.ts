import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";
import { clearCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { saveContentRevision } from "../../apps/web/src/lib/api/cms-client";
import { decodeCmsResponse } from "../../apps/web/src/lib/api/cms-response";
import { isContentDocument, isContentView, safeContentLink } from "../../apps/web/src/lib/api/cms-validation";
import type { ContentDocument, ContentView } from "../../apps/web/src/lib/api/generated/types.gen";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });
const document: ContentDocument = { objective: "Unit-test objective.", expectedResult: "Unit-test result.", prerequisites: [], blocks: [{ type: "PARAGRAPH", text: "Fictional unit-test text.", url: null }], estimatedMinutes: null, exercise: null, quiz: [], rubric: [], access: "PROTECTED", media: [], relatedResourceIds: [] };
function content(): ContentView {
  const id = randomUUID();
  return { id, resourceId: randomUUID(), kind: "ACTIVITY", versionId: randomUUID(), versionNumber: 1, locale: "fr", slug: "unit-test", state: "DRAFT", revision: 0, currentRevisionId: randomUUID(), publishedRevisionId: null, title: "Unit test", summary: "", objectives: "Unit-test objectives", evaluationDefinition: "Unit-test evaluation", document, childVersionIds: [], sourceTranslationId: null, sourceRevisionId: null, reviewedSourceRevisionId: null, verifiedAt: null, updatedAt: "2026-11-08T00:00:00Z", frozenAt: null, translations: [{ id, locale: "fr", state: "DRAFT", sourceRevisionId: null, reviewedSourceRevisionId: null }], legacyBody: null, metadata: { goalCodes: [], level: null, audience: [], tools: [], sources: [], faq: [], evaluationDescription: null } };
}

test("une ancienne donnée privée garde son texte historique sans être inventée structurée", async () => {
  const legacy = { ...content(), document: null, legacyBody: "Preserved fictional historical text <script>never executed</script>." };
  const result = await decodeCmsResponse(Response.json(legacy, { headers: { ETag: `"content-${legacy.id}-r0"` } }), isContentView);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.data.document, null); assert.equal(result.data.legacyBody, legacy.legacyBody); }
});

test("une réponse de sauvegarde sans ETag cohérent n'est pas un acquittement fiable", async () => {
  const value = content();
  for (const headers of [new Headers(), new Headers({ ETag: '"wrong-version"' })]) {
    const result = await decodeCmsResponse(Response.json(value, { headers }), isContentView);
    assert.deepEqual(result, { ok: false, error: { kind: "invalid-response", status: 200 } });
  }
  assert.equal(isContentView({ ...value, passwordHash: "unexpected-field" }), false);
});

test("les blocs inconnus, liens exécutables et médias prétendument disponibles sont refusés", () => {
  assert.equal(isContentDocument({ ...document, blocks: [{ type: "HTML", text: "<script>not an allowed block</script>", url: null }] }), false);
  for (const url of ["javascript:alert(1)", "https://name:secret@example.invalid", "//other.example.invalid", "/\\other.example.invalid"]) assert.equal(safeContentLink(url), null);
  assert.equal(isContentDocument({ ...document, media: [{ assetId: randomUUID(), kind: "VIDEO", required: true, label: "Unit reference", available: true }] }), false);
  assert.equal(safeContentLink("https://example.invalid/reference"), "https://example.invalid/reference");
});

test("une révision CMS utilise CSRF et If-Match, et un conflit ne déclenche aucun nouvel envoi", async () => {
  const value = content(); const etag = `"content-${value.id}-r0"`; let mutations = 0;
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json({ token: "ephemeral-unit-token", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" });
    mutations++;
    assert.equal(path, `/api/v1/admin/contents/${value.id}/revisions`);
    assert.equal(init?.method, "POST"); assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("If-Match"), etag);
    assert.ok(headers.get("X-CSRF-TOKEN") === "ephemeral-unit-token", "The session CSRF header must be present.");
    return new Response(JSON.stringify({ type: "about:blank", title: "Precondition failed", status: 412, detail: "Safe unit-test conflict.", instance: `/api/v1/admin/contents/${value.id}/revisions`, code: "REVISION_CONFLICT", traceId: randomUUID() }), { status: 412, headers: { "Content-Type": "application/problem+json" } });
  };
  const result = await saveContentRevision(value.id, etag, { title: "Revised unit test", summary: "", document, reason: "Unit-test correction." });
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.status, 412);
  assert.equal(mutations, 1);
});
