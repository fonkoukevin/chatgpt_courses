import { strict as assert } from "node:assert";
import { test } from "node:test";
import { remainingQuizAttempts, validActivityNote } from "../../apps/web/src/lib/learning/state";
import { programmeActivities } from "../../apps/web/src/lib/learning/programme";

test("un ancien accusé de quiz ne rouvre pas un quota épuisé dans une autre session", () => {
  assert.equal(remainingQuizAttempts({ passPercent: 100, maxAttempts: 2 }, 0, 1), 0);
  assert.equal(remainingQuizAttempts({ passPercent: 100, maxAttempts: 2 }, 2, 1), 1);
  assert.equal(remainingQuizAttempts({ passPercent: 100, maxAttempts: 2 }, 1, 2), 0);
  assert.equal(remainingQuizAttempts({ passPercent: 100, maxAttempts: null }, null, 4), null);
  assert.equal(remainingQuizAttempts({ passPercent: 100, maxAttempts: 2 }, undefined), undefined);
});

test("une note vide est volontairement sauvable, les bornes Unicode et JSON restent applicables", () => {
  assert.equal(validActivityNote(""), true);
  assert.equal(validActivityNote("a".repeat(16000)), true);
  assert.equal(validActivityNote("a".repeat(16001)), false);
  assert.equal(validActivityNote("\u0000"), false);
  assert.equal(validActivityNote("\ud800"), false);
});

test("la navigation ne reboucle pas sur une version réutilisée et conserve deux versions d’une même activité", () => {
  type Node = { resourceId: string; versionId: string; kind: "MODULE" | "ACTIVITY"; children: Node[] };
  const activity = (resourceId: string, versionId: string): Node => ({ resourceId, versionId, kind: "ACTIVITY", children: [] });
  const first: Node = { resourceId: "module-a", versionId: "module-a-v1", kind: "MODULE", children: [activity("brief", "brief-v1"), activity("scope", "scope-v1")] };
  const second: Node = { resourceId: "module-b", versionId: "module-b-v1", kind: "MODULE", children: [activity("brief", "brief-v1"), activity("brief", "brief-v2")] };
  const navigation = programmeActivities([first, second]);
  assert.deepEqual(navigation.map(({ node }) => node.versionId), ["brief-v1", "scope-v1", "brief-v2"]);
  assert.equal(navigation[0].module, first);
  assert.equal(navigation[2].module, second);
});
