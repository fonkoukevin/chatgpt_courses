import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken, getCsrfToken } from "../../apps/web/src/lib/api/auth-client";
import { createMethod, updateMethod } from "../../apps/web/src/lib/api/methods-client";
import { decodeMethodsResponse } from "../../apps/web/src/lib/api/methods-response";
import { isMethodFields, isMethodSourceUpdate, isMethodTemplate, isMethodView } from "../../apps/web/src/lib/api/methods-validation";
import type { MethodDefinition, MethodFields, MethodOrigin, MethodView } from "../../apps/web/src/lib/api/generated/types.gen";
import { keepAnonymousMethodDraft, methodDraftPrefix, methodDraftTtlMs, parseMethodDraft, readMethodDraft } from "../../apps/web/src/lib/auth/method-draft";
import { purgePersonalBrowserCaches } from "../../apps/web/src/lib/auth/anonymous-draft";
import { authHref, safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import { methodsNewHref, methodsPath, safeMethodsDestination, translateMethodsDestination } from "../../apps/web/src/lib/methods/routes";

// Transport responses and browser storage below are unit doubles, not a Spring/browser integration.
const originalFetch = globalThis.fetch;
const descriptors = new Map(["window", "sessionStorage", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const accountId = randomUUID(), methodId = randomUUID();
function fields(): MethodFields {
  const parameters = { objective: "Clarifier le dossier fictif BR01", context: "", availableData: "Quatre pages existantes, tarifs TR01", recipient: "Client R", format: "Tableau faits/inconnues", constraints: "Aucun fait inventé", clarifications: "Logo et intégration à confirmer" };
  return { title: "Méthode fictive de test", locale: "fr", text: "Mon instruction française indépendante.", parameters, generatedFrom: { ...parameters }, notes: "Une note personnelle fictive.", category: "Proposition" };
}
function view(revision = 0): MethodView { return { ...fields(), id: methodId, revision, origin: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:01:00Z" }; }
const etag = (value: MethodView) => `"personal-method-${value.id}-r${value.revision}"`;
const token = (generation = 1) => ({ token: `unit-only-csrf-${generation}`, headerName: "X-CSRF-TOKEN", parameterName: "_csrf" });
function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ type: "about:blank", title: "Request failed", status, detail: "Safe unit-test error.", instance: "/api/v1/me/methods", code, traceId: randomUUID(), ...extra }), { status, headers: { "Content-Type": "application/problem+json" } });
}
function origin(): MethodOrigin { return { resourceId: randomUUID(), versionId: randomUUID(), translationId: randomUUID(), revisionId: randomUUID(), locale: "fr", title: "Modèle fictif", slug: "modele-fictif" }; }
function definition(): MethodDefinition { return { useCases: ["Clarifier un brief"], requiredInputs: ["BR01"], steps: ["Séparer faits et inconnues"], starterInstruction: "Utilise seulement les faits fournis.", example: "Logo sans tarif : question à clarifier.", checks: ["Vérifier chaque fait"], limitations: ["Aucun résultat commercial promis"], defaults: fields().parameters }; }
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(String(key), String(value)); }
}
beforeEach(() => clearCsrfToken());
afterEach(() => {
  globalThis.fetch = originalFetch; clearCsrfToken();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("le décodage refuse une révision non confirmée et tout champ privé/propriétaire inattendu", async () => {
  const saved = view();
  const confirmed = await decodeMethodsResponse(Response.json(saved, { headers: { ETag: etag(saved) } }), isMethodView);
  assert.equal(confirmed.ok, true);
  for (const invalidTag of [undefined, `W/${etag(saved)}`, `"personal-method-${randomUUID()}-r0"`, `"personal-method-${methodId}-r1"`]) {
    const result = await decodeMethodsResponse(Response.json(saved, { headers: invalidTag ? { ETag: invalidTag } : {} }), isMethodView);
    assert.deepEqual(result, { ok: false, error: { kind: "invalid-response", status: 200 } });
  }
  for (const unwanted of ["ownerId", "userId", "passwordHash"]) {
    assert.equal(isMethodFields({ ...fields(), [unwanted]: "forged-unit-data" }), false);
    const result = await decodeMethodsResponse(Response.json({ ...saved, [unwanted]: "unexpected-unit-data" }, { headers: { ETag: etag(saved) } }), isMethodView);
    assert.deepEqual(result, { ok: false, error: { kind: "invalid-response", status: 200 } });
  }
  const invalidProblem = await decodeMethodsResponse(problem(412, "REVISION_CONFLICT", { passwordHash: "unexpected-unit-data" }), isMethodView);
  assert.deepEqual(invalidProblem, { ok: false, error: { kind: "invalid-response", status: 412 } });
});

test("la projection et la notice source ne peuvent contredire leur accès ou leur révision", () => {
  const source = origin(), newer = { ...source, revisionId: randomUUID() };
  assert.equal(isMethodSourceUpdate({ status: "CURRENT", source, candidate: source }), true);
  assert.equal(isMethodSourceUpdate({ status: "CURRENT", source, candidate: newer }), false);
  for (const changed of [{ ...source, versionId: randomUUID() }, { ...source, translationId: randomUUID() }]) {
    assert.equal(isMethodSourceUpdate({ status: "CURRENT", source, candidate: changed }), false);
  }
  assert.equal(isMethodSourceUpdate({ status: "UPDATE_AVAILABLE", source, candidate: source }), false);
  assert.equal(isMethodSourceUpdate({ status: "UPDATE_AVAILABLE", source, candidate: newer }), true);
  assert.equal(isMethodSourceUpdate({ status: "UPDATE_AVAILABLE", source, candidate: { ...newer, resourceId: randomUUID() } }), false);
  assert.equal(isMethodSourceUpdate({ status: "UPDATE_AVAILABLE", source, candidate: { ...newer, locale: "en" } }), false);
  assert.equal(isMethodSourceUpdate({ status: "UNAVAILABLE", source, candidate: null }), true);
  const template = { resourceId: source.resourceId, versionId: source.versionId, revisionId: source.revisionId, locale: "fr", title: source.title, slug: source.slug, availability: "PUBLISHED", definition: definition() };
  assert.equal(isMethodTemplate(template), true);
  assert.equal(isMethodTemplate({ ...template, title: null }), false);
  assert.equal(isMethodTemplate({ ...template, slug: "https://outside.invalid" }), false);
  for (const availability of ["PROTECTED", "STALE", "WITHDRAWN", "MISSING_DEFINITION"]) {
    assert.equal(isMethodTemplate({ ...template, availability }), false, "Un état indisponible ne doit pas livrer sa définition.");
    assert.equal(isMethodTemplate({ ...template, availability, definition: null }), true);
  }
});

test("deux actions explicites partagent CSRF en mémoire et transmettent compte attendu et If-Match", async () => {
  let tokenReads = 0; const requests: Array<{ path: string; init: RequestInit }> = [];
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") { tokenReads++; return Response.json(token()); }
    requests.push({ path: String(path), init: init ?? {} });
    const result = view(init?.method === "PATCH" ? 1 : 0);
    return Response.json(result, { status: init?.method === "POST" ? 201 : 200, headers: { ETag: etag(result) } });
  };
  const input = fields(), snapshot = structuredClone(input), previousTag = etag(view());
  const results = await Promise.all([createMethod(input, accountId), updateMethod(methodId, previousTag, input, accountId)]);
  assert.equal(results.every((result) => result.ok), true); assert.equal(tokenReads, 1); assert.equal(requests.length, 2);
  for (const request of requests) {
    const headers = new Headers(request.init.headers);
    assert.equal(headers.get("X-CSRF-TOKEN"), token().token); assert.equal(headers.get("X-Account-Context"), accountId);
    assert.equal(headers.get("Authorization"), null); assert.equal(request.init.credentials, "same-origin"); assert.equal(request.init.cache, "no-store");
    assert.deepEqual(JSON.parse(String(request.init.body)), { fields: snapshot });
    assert.equal(headers.get("If-Match"), request.init.method === "PATCH" ? previousTag : null);
  }
  await getCsrfToken(); assert.equal(tokenReads, 1); assert.deepEqual(input, snapshot);
  await assert.rejects(() => createMethod(input, "not-a-uuid")); assert.equal(requests.length, 2);
});

test("409 et 412 gardent le refus sans retry POST ; un CSRF403 est renouvelé pour une action ultérieure", async () => {
  for (const [status, code] of [[409, "ACCOUNT_CONTEXT_CHANGED"], [412, "REVISION_CONFLICT"], [403, "CSRF_INVALID"]] as const) {
    clearCsrfToken(); let tokenReads = 0, posts = 0;
    globalThis.fetch = async (path, init) => {
      if (path === "/api/v1/auth/csrf") return Response.json(token(++tokenReads));
      assert.equal(init?.method, "POST"); posts++; return problem(status, code);
    };
    const input = fields(), snapshot = structuredClone(input), result = await createMethod(input, accountId);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "http"); assert.equal(result.error.status, status);
      assert.ok("problem" in result.error); assert.equal(result.error.problem?.code, code);
    }
    assert.equal(posts, 1); assert.equal(tokenReads, status === 403 ? 2 : 1); assert.deepEqual(input, snapshot);
    await getCsrfToken(); assert.equal(tokenReads, status === 403 ? 2 : 1);
  }
});

test("le brouillon est conservé seulement par action explicite, expire après deux heures et ne porte aucun propriétaire", async (t) => {
  const now = Date.parse("2026-11-08T00:00:00Z"); t.mock.method(Date, "now", () => now);
  const session = new MemoryStorage(), local = new MemoryStorage();
  Object.defineProperties(globalThis, { sessionStorage: { value: session, configurable: true }, localStorage: { value: local, configurable: true }, window: { value: new EventTarget(), configurable: true } });
  const input = fields(); assert.equal(session.length, 0);
  const id = keepAnonymousMethodDraft(input, null); assert.ok(id); assert.equal(session.length, 1);
  const raw = session.getItem(methodDraftPrefix + id); const draft = parseMethodDraft(raw, now); assert.ok(draft);
  assert.equal(draft.expiresAt, now + 2 * 60 * 60 * 1000); assert.equal(methodDraftTtlMs, 2 * 60 * 60 * 1000);
  input.text = "Une retouche après conservation"; assert.notEqual(readMethodDraft(id)?.fields.text, input.text);
  assert.ok(parseMethodDraft(raw, draft.expiresAt - 1)); assert.equal(parseMethodDraft(raw, draft.expiresAt), null);
  assert.equal(parseMethodDraft(JSON.stringify({ ...draft, expiresAt: now + methodDraftTtlMs + 1 }), now), null);
  assert.equal(parseMethodDraft(JSON.stringify({ ...draft, ownerId: accountId }), now), null);
  assert.equal(parseMethodDraft(JSON.stringify({ ...draft, fields: { ...draft.fields, ownerId: accountId } }), now), null);
  assert.equal(parseMethodDraft(JSON.stringify({ ...draft, source: { sourceResourceId: randomUUID(), sourceVersionId: randomUUID(), sourceRevisionId: randomUUID(), sourceLocale: "fr", ownerId: accountId } }), now), null);
  session.setItem("unrelated-app", "preserved"); local.setItem("unrelated-app", "preserved");
  local.setItem("chatgpt-courses:personal:old-test-copy", "fictional-private-text");
  await purgePersonalBrowserCaches();
  assert.equal(readMethodDraft(id), null); assert.equal(local.getItem("chatgpt-courses:personal:old-test-copy"), null);
  assert.equal(session.getItem("unrelated-app"), "preserved"); assert.equal(local.getItem("unrelated-app"), "preserved");
});

test("le retour d’identification traduit les seules routes méthodes autorisées sans redirection ouverte", () => {
  const draftId = randomUUID(), destination = methodsNewHref("fr", draftId);
  assert.equal(safeReturnTo(destination, "fr"), destination);
  const href = new URL(authHref("fr", "sign-in", destination), "https://courses.invalid");
  assert.equal(href.pathname, "/fr/connexion"); assert.equal(href.searchParams.get("returnTo"), destination);
  assert.equal(translateReturnTo(destination, "en"), methodsNewHref("en", draftId));
  const search = "/fr/espace/methodes?q=BR01+%26+TR01&category=Proposition&page=2&pageSize=10";
  assert.equal(safeMethodsDestination(search, "fr"), search);
  assert.equal(translateMethodsDestination(search, "en"), search.replace("/fr/espace/methodes", "/en/my/methods"));
  assert.equal(translateReturnTo(methodsPath("fr", methodId), "en"), methodsPath("en", methodId));
  for (const invalid of ["https://evil.invalid", "//evil.invalid/fr/espace/methodes", "/\\evil.invalid", "/fr/espace/methodes/../compte", "/fr/espace/methodes/%2e%2e/compte", "/fr/espace/methodes?returnTo=https://evil.invalid", "/fr/espace/methodes?page=1&page=2", "/fr/espace/methodes?pageSize=101", "/fr/espace/methodes?page=-1", "/fr/espace/methodes?q=%0a", "/fr/espace/methodes?userId=" + accountId, "/fr/espace/methodes/nouvelle?draft=" + draftId + "&ownerId=" + accountId, "/fr/espace/methodes#fragment"]) {
    assert.equal(safeMethodsDestination(invalid, "fr"), null, invalid);
    assert.equal(safeReturnTo(invalid, "fr"), "/fr/compte", invalid);
  }
  assert.equal(safeMethodsDestination("/en/my/methods", "fr"), null);
  assert.equal(safeReturnTo("/en/my/methods", "fr"), "/fr/compte");
});
