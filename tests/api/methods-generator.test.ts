import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleInstruction, emptyParameters, generateInstruction, parametersChanged, validateGenerator, type GeneratorValue } from "../../apps/web/src/lib/methods/generator";
import { emptyMethodFields, invalidMethodField, methodFields } from "../../apps/web/src/lib/methods/editor-state";
import type { MethodView } from "../../apps/web/src/lib/api/generated/types.gen";

function draft(): GeneratorValue {
  return { parameters: { ...emptyParameters(), objective: "Clarifier BR01 avant la proposition.", availableData: "Réécriture de quatre pages existantes en français. Logo et intégration non chiffrés.", format: "Un tableau faits, inconnues, conséquences." }, generatedFrom: null, text: "" };
}
test("le générateur demande des faits et un résultat, sans inventer un contexte manquant", () => {
  assert.deepEqual(validateGenerator(emptyParameters()), { objective: "required", availableData: "required", format: "required" });
  const value = draft(); assert.deepEqual(validateGenerator(value.parameters), {});
  const text = assembleInstruction(value.parameters, "fr");
  assert.ok(text.includes("quatre pages existantes en français"));
  assert.ok(text.includes("Information non renseignée : à préciser si nécessaire."));
  assert.equal(/\d+[\s.,]*€/.test(text), false, "Aucun montant absent des paramètres ne doit être ajouté.");
});
test("BR01 reste un texte déterministe éditable et non une réponse prétendument exécutée", () => {
  const value = draft(), starter = "Utilise uniquement BR01 et TR01. Le logo et l’intégration restent à clarifier.";
  const generated = generateInstruction(value, "en", starter);
  assert.equal(generated.text, assembleInstruction(value.parameters, "en", starter));
  assert.ok(generated.text.startsWith(starter)); assert.ok(generated.text.includes("Available information\n"));
  assert.ok(generated.text.includes("Réécriture de quatre pages existantes en français"), "Changer la langue d’assemblage ne traduit pas les données saisies.");
  assert.deepEqual(value, draft(), "L’assemblage ne modifie pas le brouillon fourni.");
  assert.equal(parametersChanged(generated), false);
});
test("les paramètres et le texte personnel restent indépendants du dernier instantané assemblé", () => {
  const generated = generateInstruction(draft(), "fr");
  const personal = { ...generated, text: "Retouche personnelle conservée.", parameters: { ...generated.parameters, format: "Une liste courte." } };
  assert.equal(parametersChanged(personal), true); assert.equal(personal.text, "Retouche personnelle conservée.");
  assert.equal(personal.generatedFrom?.format, "Un tableau faits, inconnues, conséquences.");
  const rebuilt = generateInstruction(personal, "fr");
  assert.equal(personal.text, "Retouche personnelle conservée.");
  assert.equal(rebuilt.generatedFrom?.format, "Une liste courte."); assert.equal(parametersChanged(rebuilt), false);
});
test("une entrée trop longue ou Unicode invalide ne devient pas une instruction présentée comme prête", () => {
  for (const bad of ["x".repeat(4001), "Texte\u0000invalide", "Texte\ud800invalide"]) {
    const parameters = { ...draft().parameters, context: bad };
    assert.ok(validateGenerator(parameters).context); assert.throws(() => assembleInstruction(parameters, "fr"));
  }
});
test("la préparation de l'éditeur conserve la langue et les notes sans partager d'objets modifiables", () => {
  const saved: MethodView = { ...emptyMethodFields("fr"), title: "Méthode personnelle de test", text: "Mon texte reste français.", notes: "Une note originale française.", id: "74a260a5-6b99-43df-9b0b-a94acb49d5fd", revision: 0, origin: null, createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z" };
  const editable = methodFields(saved); editable.parameters.objective = "Une adaptation locale.";
  assert.equal(saved.parameters.objective, ""); assert.equal(editable.locale, "fr"); assert.equal(editable.notes, saved.notes);
  assert.equal(invalidMethodField(editable), null);
});
test("la limite de sauvegarde compte l'UTF-8 agrégé même lorsque chaque champ respecte sa borne", () => {
  const value = { ...emptyMethodFields("fr"), title: "Test Unicode", text: "Une instruction." };
  for (const key of Object.keys(value.parameters) as Array<keyof typeof value.parameters>) value.parameters[key] = "界".repeat(4000);
  assert.deepEqual(validateGenerator(value.parameters), {}); assert.equal(invalidMethodField(value), "size");
});
