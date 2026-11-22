import assert from "node:assert/strict";
import { test } from "node:test";
import { methodMarkdown, practiceMarkdown, projectMarkdown } from "../../apps/web/src/lib/files/markdown-export";
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
test("un essai exporté conserve HTML, liens et clôtures Markdown malveillantes comme texte personnel littéral", () => {
  const payload = '<script>window.synthetic = true</script>\n``````\n## Fausse section\n[exemple](javascript:synthetic())\nTexte final inchangé.';
  const input = { title: "Essai <script>fictif</script>\n```", versionNumber: 3, locale: "fr" as const, text: payload };
  const before = structuredClone(input), exported = practiceMarkdown(input);
  assert.ok(exported.includes("```````text\n" + payload + "\n```````"));
  assert.ok(exported.includes("````text\n" + input.title + "\n````"));
  assert.equal(exported.split(payload).length - 1, 1);
  assert.deepEqual(input, before);
});
test("la langue de rédaction reste indépendante de l’interface et les consignes, corrigés et scores ne sont pas exportés", () => {
  const input = { title: "Mon essai français", versionNumber: 7, locale: "fr" as const, text: "Ma réponse française : périmètre à confirmer.",
    interfaceLocale: "en", exerciseInstructions: "SYNTHETIC_INSTRUCTIONS_EXCLUDED", correction: "SYNTHETIC_CORRECTION_EXCLUDED", score: "SYNTHETIC_SCORE_EXCLUDED" };
  const before = structuredClone(input), exported = practiceMarkdown(input);
  assert.ok(exported.includes("## Langue de rédaction\n\n```text\nfr\n```"));
  assert.ok(exported.includes("## Mon essai") && exported.includes(input.text));
  assert.ok(!exported.includes("## Writing language") && !exported.includes("## My practice draft"));
  for (const excluded of [input.exerciseInstructions, input.correction, input.score]) assert.equal(exported.includes(excluded), false);
  assert.deepEqual(input, before);
});
