import type { Locale } from "./locales";
const fr = {
  title: "Définition de la méthode", help: "Ces champs font partie du document éditorial. Enregistrer crée une révision ; le générateur n’utilise que la publication effectivement revue.",
  add: "Préparer la définition de méthode", remove: "Retirer la définition", removeTitle: "Retirer cette définition du brouillon ?", removeHelp: "Le texte de l’article reste intact. Une méthode sans définition complète ne peut pas être publiée à nouveau.", confirm: "Retirer du brouillon", cancel: "Annuler",
  useCases: "Cas d’usage", requiredInputs: "Données à réunir", steps: "Étapes de la méthode", starterInstruction: "Instruction de départ", example: "Exemple de méthode", checks: "Points de contrôle", limitations: "Limites à annoncer", defaults: "Paramètres proposés au visiteur", lines: "Une entrée par ligne, vingt au maximum et 1 000 caractères par entrée.",
};
const en: typeof fr = {
  title: "Method definition", help: "These fields belong to the editorial document. Saving creates a revision; the generator uses only the publication actually reviewed.",
  add: "Prepare the method definition", remove: "Remove the definition", removeTitle: "Remove this definition from the draft?", removeHelp: "The article text stays intact. A method cannot be published again without a complete definition.", confirm: "Remove from the draft", cancel: "Cancel",
  useCases: "Use cases", requiredInputs: "Information to gather", steps: "Method steps", starterInstruction: "Starting instruction", example: "Method example", checks: "Checks", limitations: "Limitations to explain", defaults: "Suggested visitor parameters", lines: "One entry per line, up to twenty, with 1,000 characters per entry.",
};
export const getMethodEditorialDictionary = (locale: Locale) => locale === "fr" ? fr : en;
