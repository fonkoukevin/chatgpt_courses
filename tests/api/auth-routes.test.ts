import assert from "node:assert/strict";
import { test } from "node:test";
import { authHref, safeReturnTo, translateReturnTo } from "../../apps/web/src/lib/auth/routes";
import { anonymousDraftTtlMs, parseAnonymousDraft } from "../../apps/web/src/lib/auth/anonymous-draft";

test("le retour n'accepte que les destinations internes connues de la langue courante", () => {
  for (const value of ["//other.test", "https://other.test/fr/compte", "javascript:alert(1)", "/fr\\compte", "/fr/%63ompte", "/fr/%2563ompte", "/fr/../fr/compte", "/fr/compte?next=//other.test", "/fr/compte#private", "/en/account", "/fr/connexion", ["/fr/dev/learning"]]) {
    assert.equal(safeReturnTo(value, "fr"), "/fr/compte");
  }
  assert.equal(safeReturnTo("/fr/dev/learning", "fr"), "/fr/dev/learning");
  assert.equal(translateReturnTo("/fr/dev/learning", "en"), "/en/dev/learning");
  assert.equal(authHref("en", "sign-in", "/en/dev/learning"), "/en/sign-in?returnTo=%2Fen%2Fdev%2Flearning");
});

test("une copie temporaire expire après deux heures et ne reçoit jamais un propriétaire", () => {
  const now = 1_000_000;
  const draft = { version: 1, activityId: "p02-proposal-demo", locale: "fr", body: "Fictional non-sensitive trial.", brief: "Fictional brief.", expiresAt: now + anonymousDraftTtlMs };
  assert.deepEqual(parseAnonymousDraft(JSON.stringify(draft), now), draft);
  assert.equal(parseAnonymousDraft(JSON.stringify(draft), now + anonymousDraftTtlMs), null);
  assert.equal(parseAnonymousDraft(JSON.stringify({ ...draft, userId: "untrusted-owner" }), now), null);
  assert.equal(parseAnonymousDraft(JSON.stringify({ ...draft, expiresAt: now + anonymousDraftTtlMs + 1 }), now), null);
  assert.equal(parseAnonymousDraft(JSON.stringify({ ...draft, body: "x".repeat(20001) }), now), null);
});
