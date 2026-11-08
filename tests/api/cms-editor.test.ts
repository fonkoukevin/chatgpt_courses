import assert from "node:assert/strict";
import { test } from "node:test";
import { beginSave, changeEditSession, confirmSave, createEditSession, rebaseLocalEdit, rejectSave } from "../../apps/web/src/lib/cms/edit-session";

test("une confirmation retardée conserve une saisie plus récente et ne la déclare pas enregistrée", () => {
  const edited = changeEditSession(createEditSession({ title: "Initial" }, '"r0"'), { title: "Sent draft" });
  const pending = beginSave(edited, 1);
  const newer = changeEditSession(pending.state, { title: "Newer local work" });
  const result = confirmSave(newer, pending.attempt, { title: "Sent draft" }, '"r1"');
  assert.equal(result.value.title, "Newer local work");
  assert.equal(result.confirmed.title, "Sent draft");
  assert.equal(result.phase, "modified");
  assert.equal(result.etag, '"r1"');
  const second = beginSave(result, 2);
  assert.equal(second.attempt.value.title, "Newer local work");
  assert.equal(second.attempt.etag, '"r1"');
});

test("un acquittement d'une opération remplacée n'écrase ni une recharge ni sa nouvelle révision", () => {
  const old = beginSave(changeEditSession(createEditSession("Initial", '"r0"'), "Old edit"), 1);
  const reloaded = createEditSession("Explicitly reloaded server", '"r3"');
  assert.deepEqual(confirmSave(reloaded, old.attempt, "Old edit", '"r1"'), reloaded);
  assert.deepEqual(rejectSave(reloaded, old.attempt, true), reloaded);
});

test("un conflit garde le texte et exige une décision explicite avant de reprendre l'ETag serveur", () => {
  const pending = beginSave(changeEditSession(createEditSession("Initial", '"r0"'), "Local work"), 1);
  const conflicted = rejectSave(pending.state, pending.attempt, true);
  assert.equal(conflicted.value, "Local work");
  assert.equal(conflicted.etag, '"r0"');
  assert.equal(conflicted.phase, "conflict");
  const kept = rebaseLocalEdit(conflicted, "Other editor work", '"r1"');
  assert.equal(kept.value, "Local work");
  assert.equal(kept.confirmed, "Other editor work");
  assert.equal(kept.etag, '"r1"');
  assert.equal(kept.phase, "modified");
});
