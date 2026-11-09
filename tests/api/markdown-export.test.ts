import assert from "node:assert/strict";
import { test } from "node:test";
import { methodMarkdown, projectMarkdown } from "../../apps/web/src/lib/files/markdown-export";
import { emptyMethodFields } from "../../apps/web/src/lib/methods/editor-state";
import { emptyProjectFields } from "../../apps/web/src/lib/projects/fields";

test("l’export garde texte, langue et notes personnels en littéral sans inventer une évaluation", () => {
  const fields = { ...emptyMethodFields("fr"), title: "Ma méthode personnelle", text: "<script>exemple littéral</script>\n```\nUn contrôle à vérifier.", notes: "Ma note privée choisie pour cet export." };
  const before = structuredClone(fields), text = methodMarkdown(fields);
  assert.ok(text.includes("````text\n" + fields.text + "\n````"));
  assert.ok(text.includes(fields.notes)); assert.ok(text.includes("Langue du texte personnel\n\n```text\nfr"));
  assert.deepEqual(fields, before);
  assert.equal(text.includes("Score"), false);
});
test("une production exportée ne mélange pas ses sections, sa langue et ses anciennes preuves", () => {
  const fields = { ...emptyProjectFields("en"), title: "Personal BR02", budget: "€1,400 excluding tax before integration.", timeline: "At least ten business days, not five.", externalText: "My separate retained draft." };
  const text = projectMarkdown(fields);
  for (const value of [fields.title, fields.budget, fields.timeline, fields.externalText]) assert.ok(text.includes(value));
  assert.ok(text.includes("## Timeline and starting conditions"));
  assert.equal(/certified|human review|assessment result/i.test(text), false);
});
