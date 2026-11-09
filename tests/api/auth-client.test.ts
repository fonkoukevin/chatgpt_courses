import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { clearCsrfToken, getCsrfToken, registerAccount, signIn, updatePreferences } from "../../apps/web/src/lib/api/auth-client";
import { validNewPassword } from "../../apps/web/src/lib/api/auth-validation";

const originalFetch = globalThis.fetch;
const user = { id: randomUUID(), email: "unit@example.test", displayName: null, locale: "fr" as const, roles: ["LEARNER"], permissions: [] };
const securityToken = (generation = 1) => ({ token: `ephemeral-unit-csrf-${generation}`, headerName: "X-CSRF-TOKEN", parameterName: "_csrf" });
const failure = (status: number, code: string) => new Response(JSON.stringify({ type: "about:blank", title: "Request failed", status, detail: "Safe unit-test error.", instance: "/api/v1/auth/login", code, traceId: randomUUID() }), { status, headers: { "Content-Type": "application/problem+json" } });
beforeEach(() => clearCsrfToken());
afterEach(() => { globalThis.fetch = originalFetch; clearCsrfToken(); });

test("deux acquisitions CSRF concurrentes partagent une seule lecture et restent en mémoire", async () => {
  let calls = 0;
  globalThis.fetch = async (path, init) => {
    assert.equal(path, "/api/v1/auth/csrf");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
    calls++;
    return Response.json(securityToken());
  };
  const [first, second] = await Promise.all([getCsrfToken(), getCsrfToken()]);
  assert.deepEqual(first, second);
  await getCsrfToken();
  assert.equal(calls, 1);
});

test("le login est form-urlencoded, reprend le header reçu et renouvelle CSRF après succès", async () => {
  const password = randomUUID();
  let tokenReads = 0;
  let mutations = 0;
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(securityToken(++tokenReads));
    assert.equal(path, "/api/v1/auth/login"); mutations++;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");
    assert.ok(headers.get("X-CSRF-TOKEN") === "ephemeral-unit-csrf-1", "The announced CSRF header must be used.");
    assert.ok(new URLSearchParams(String(init?.body)).get("password") === password, "The password must retain its form encoding.");
    assert.equal(new URLSearchParams(String(init?.body)).get("email"), user.email);
    return Response.json(user);
  };
  const result = await signIn(user.email, password);
  assert.equal(result.ok, true);
  assert.equal(mutations, 1); assert.equal(tokenReads, 2);
});

test("une inscription confirmée ne connecte pas le navigateur artificiellement", async () => {
  const seen: string[] = [];
  globalThis.fetch = async (path) => {
    seen.push(String(path));
    return path === "/api/v1/auth/csrf" ? Response.json(securityToken()) : Response.json(user, { status: 201 });
  };
  const result = await registerAccount({ email: user.email, password: randomUUID(), locale: "fr" });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, ["/api/v1/auth/csrf", "/api/v1/auth/register"]);
});

test("un CSRF rejeté renouvelle le jeton sans rejouer la mutation", async () => {
  let reads = 0; let posts = 0;
  globalThis.fetch = async (path) => {
    if (path === "/api/v1/auth/csrf") return Response.json(securityToken(++reads));
    posts++; return failure(403, "CSRF_INVALID");
  };
  const result = await signIn(user.email, randomUUID());
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.error.kind, "http"); assert.equal(result.error.status, 403); }
  assert.equal(posts, 1); assert.equal(reads, 2);
});

test("même un 403 malformé déclenche une nouvelle lecture CSRF sans faux succès ni retry POST", async () => {
  let reads = 0; let posts = 0;
  globalThis.fetch = async (path) => {
    if (path === "/api/v1/auth/csrf") return Response.json(securityToken(++reads));
    posts++; return new Response("invalid problem", { status: 403 });
  };
  const result = await signIn(user.email, randomUUID());
  assert.deepEqual(result, { ok: false, error: { kind: "invalid-response", status: 403 } });
  assert.equal(posts, 1); assert.equal(reads, 2);
});

test("un CSRF indisponible bloque le POST et une panne ambiguë ne le répète pas", async () => {
  let posts = 0;
  globalThis.fetch = async (path) => {
    if (path !== "/api/v1/auth/csrf") posts++;
    throw new TypeError("Simulated unit-test transport failure");
  };
  assert.deepEqual(await signIn(user.email, randomUUID()), { ok: false, error: { kind: "unavailable" } });
  assert.equal(posts, 0);
  globalThis.fetch = async (path) => {
    if (path === "/api/v1/auth/csrf") return Response.json(securityToken());
    posts++; throw new TypeError("Simulated unit-test ambiguous mutation");
  };
  await signIn(user.email, randomUUID());
  assert.equal(posts, 1);
});

test("une préférence exige l'ETag confirmé et conserve un conflit sans répétition", async () => {
  const etag = `"preferences-${user.id}-r0"`;
  let patches = 0;
  globalThis.fetch = async (path, init) => {
    if (path === "/api/v1/auth/csrf") return Response.json(securityToken());
    assert.equal(init?.method, "PATCH");
    assert.equal(new Headers(init?.headers).get("If-Match"), etag);
    assert.equal(new Headers(init?.headers).get("X-Account-Context"), user.id);
    patches++; return failure(412, "REVISION_CONFLICT");
  };
  const result = await updatePreferences("en", etag, user.id);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.status, 412);
  assert.equal(patches, 1);
});

test("le mot de passe est borné en points Unicode et octets, sans compter les paires UTF-16 deux fois", () => {
  assert.equal(validNewPassword("😀".repeat(12)), true);
  assert.equal(validNewPassword("😀".repeat(128)), true);
  assert.equal(validNewPassword("😀".repeat(129)), false);
  assert.equal(validNewPassword("short"), false);
});

test("une préférence confirme son identité propre et la langue demandée, avec no-op ou unique incrément", async () => {
  const preferenceId = randomUUID(), tag = `"preferences-${preferenceId}-r7"`;
  let writes = 0;
  for (const value of [{ id: randomUUID(), locale: "en", revision: 8 }, { id: preferenceId, locale: "fr", revision: 8 }, { id: preferenceId, locale: "en", revision: 6 }, { id: preferenceId, locale: "en", revision: 9 }]) {
    clearCsrfToken(); globalThis.fetch = async (path, init) => { if (path === "/api/v1/auth/csrf") return Response.json(securityToken()); writes++; assert.equal(new Headers(init?.headers).get("X-Account-Context"), user.id); return Response.json(value, { headers: { ETag: `"preferences-${value.id}-r${value.revision}"` } }); };
    const result = await updatePreferences("en", tag, user.id); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.kind, "invalid-response");
  }
  for (const revision of [7, 8]) { globalThis.fetch = async () => Response.json({ id: preferenceId, locale: "en", revision }, { headers: { ETag: `"preferences-${preferenceId}-r${revision}"` } }); assert.equal((await updatePreferences("en", tag, user.id)).ok, true); }
  const previous = writes; globalThis.fetch = async () => { writes++; throw new Error("Invalid input must not reach HTTP"); };
  for (const invalid of ["*", `W/${tag}`, `${tag},${tag}`, `"preferences-${preferenceId}-r9007199254740992"`, `"preferences-bad-r7"`]) assert.throws(() => updatePreferences("en", invalid, user.id));
  assert.equal(writes, previous);
});
