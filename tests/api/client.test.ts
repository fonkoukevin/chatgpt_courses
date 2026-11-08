import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { checkSystemHealth, requestUnknownSystemEndpoint } from "../../apps/web/src/lib/api/client";

const originalFetch = globalThis.fetch;
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
const traceId = "8f39934a-df7f-4d83-986c-d56eb9dbbc76";

beforeEach(() => {
  Object.defineProperty(globalThis, "location", { value: new URL("https://courses.example.test"), configurable: true });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocation) Object.defineProperty(globalThis, "location", originalLocation);
  else Reflect.deleteProperty(globalThis, "location");
});

function problem(status: number, code = "RESOURCE_NOT_FOUND") {
  return {
    type: "about:blank", title: "Request failed", status, detail: "A safe error message.",
    instance: "/api/v1/system/health", code, traceId,
  };
}

function respond(body: unknown, status = 200, type = "application/json") {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });
}

test("le SDK généré appelle la sonde de même origine sans cache ni redirection", async () => {
  let observed: Request | undefined;
  globalThis.fetch = async (input) => {
    assert.ok(input instanceof Request);
    observed = input;
    return Response.json({ status: "UP" });
  };
  assert.deepEqual(await checkSystemHealth(), { ok: true, data: { status: "UP" }, status: 200 });
  assert.equal(observed?.url, "https://courses.example.test/api/v1/system/health");
  assert.equal(observed?.method, "GET");
  assert.equal(observed?.cache, "no-store");
  assert.equal(observed?.credentials, "same-origin");
  assert.equal(observed?.redirect, "error");
  assert.equal(observed?.headers.get("Accept"), "application/json, application/problem+json");
});

test("une réponse 2xx malformée, inattendue ou au mauvais type n'annonce jamais UP", async () => {
  for (const body of [{ status: "DOWN" }, { status: "UP", database: "internal" }, null, ["UP"]]) {
    respond(body);
    assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 200 } });
  }
  respond({ status: "UP" }, 200, "text/html");
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 200 } });
  globalThis.fetch = async () => new Response("{broken", { headers: { "Content-Type": "application/json" } });
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 200 } });
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 204 } });
});

test("le diagnostic de route absente conserve le vrai 404 et le Problem sans créer de route SDK", async () => {
  let path: RequestInfo | URL | undefined;
  const expected = problem(404);
  globalThis.fetch = async (input) => {
    path = input;
    return new Response(JSON.stringify(expected), { status: 404, headers: { "Content-Type": "application/problem+json" } });
  };
  assert.deepEqual(await requestUnknownSystemEndpoint(), { ok: false, error: { kind: "http", status: 404, problem: expected } });
  assert.equal(path, "/api/v1/system/unknown");
});

test("les erreurs serveur structurées préservent statut, trace et erreurs de champ sûres", async () => {
  const expected = { ...problem(400, "VALIDATION_FAILED"), fieldErrors: [{ field: "name", code: "REQUIRED", message: "Required." }] };
  respond(expected, 400, "application/problem+json; charset=utf-8");
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "http", status: 400, problem: expected } });
});

test("une panne réseau ou un Problem d'indisponibilité reste distinct d'une erreur HTTP", async () => {
  globalThis.fetch = async () => { throw new TypeError("Simulated unit-test network failure"); };
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "unavailable" } });
  for (const [status, code] of [[502, "API_UNAVAILABLE"], [503, "SERVICE_UNAVAILABLE"], [504, "API_UNAVAILABLE"]] as const) {
    const expected = problem(status, code);
    respond(expected, status, "application/problem+json");
    assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "unavailable", status, problem: expected } });
  }
});

test("une erreur non conforme ne devient ni un Problem fiable ni une indisponibilité confirmée", async () => {
  for (const body of [
    { ...problem(503), status: 404 }, { ...problem(503), traceId: "not-a-uuid" },
    { ...problem(503), detail: "" }, { ...problem(503), instance: "/api/v1/system/health?private=value" },
    { ...problem(503), fieldErrors: [{ field: "name", code: "REQUIRED", message: "Required.", rejectedValue: "private" }] },
  ]) {
    respond(body, 503, "application/problem+json");
    assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 503 } });
  }
  respond(problem(503), 503, "text/html");
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 503 } });
  globalThis.fetch = async () => new Response("not json", { status: 404, headers: { "Content-Type": "application/problem+json" } });
  assert.deepEqual(await checkSystemHealth(), { ok: false, error: { kind: "invalid-response", status: 404 } });
});

test("annulation avant ou pendant la requête : aucun succès inventé et propagation du signal", async () => {
  const before = new AbortController();
  before.abort();
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("Fetch should not be called"); };
  assert.deepEqual(await checkSystemHealth(before.signal), { ok: false, error: { kind: "unavailable" } });
  assert.equal(called, false);
  const during = new AbortController();
  let requested: Request | undefined;
  globalThis.fetch = async (input) => {
    assert.ok(input instanceof Request);
    requested = input;
    return new Promise((_resolve, reject) => {
      input.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      during.abort();
    });
  };
  assert.deepEqual(await checkSystemHealth(during.signal), { ok: false, error: { kind: "unavailable" } });
  assert.equal(requested?.signal.aborted, true);
});

test("le délai maximal interrompt aussi la lecture du corps après les en-têtes HTTP", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let started: () => void;
  const fetching = new Promise<void>((resolve) => { started = resolve; });
  let requested: Request | undefined;
  globalThis.fetch = async (input) => {
    assert.ok(input instanceof Request);
    requested = input;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        input.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    });
    const response = new Response(body, { headers: { "Content-Type": "application/json" } });
    const json = response.json.bind(response);
    response.json = () => { started(); return json(); };
    return response;
  };
  const request = checkSystemHealth();
  await fetching;
  context.mock.timers.tick(35000);
  const result = await request;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "unavailable");
  assert.equal(requested?.signal.aborted, true);
});
