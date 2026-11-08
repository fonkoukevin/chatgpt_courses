import type { Locale } from "./locales";
const fr = {
  title: "Atelier de projet et grille", help: "Préparez une grille explicite avant la revue éditoriale. Les exemples sont fictifs ; appliquer une référence ne publie pas ce contenu.",
  reference: "Cas de référence à préparer", load: "Consulter la grille de référence", loading: "Lecture de la grille…", preview: "Voir les vingt contrôles", apply: "Appliquer cette grille au brouillon",
  replaceTitle: "Remplacer la grille et les règles de cet atelier ?", replaceHelp: "Les vingt contrôles et les règles d’autoévaluation sont remplacés par la référence choisie. Le brief, les consignes, le corrigé et les autres textes restent intacts et doivent être adaptés puis revus.",
  threshold: "Seuil de points déclarés, sur 20", reveal: "Accès volontaire au corrigé", explicit: "Sur demande explicite", afterAssessment: "Après une autoévaluation enregistrée", blocking: "Erreurs bloquantes à déclarer", issue: "Libellé de l’erreur",
  configured: "Atelier configuré pour le cas", unavailable: "La grille de référence n’a pas pu être chargée. Le brouillon reste intact.",
  remove: "Retirer les règles de l’atelier", removeTitle: "Retirer cette configuration du brouillon ?", removeHelp: "Le contenu et les contrôles restent présents. L’atelier ne sera plus configuré sans ces règles.", confirm: "Confirmer", cancel: "Annuler",
  policyActivityOnly: "Configurer l’atelier sur une activité, pas sur un parcours, module ou guide.",
  rubricRequired: "Préparer les vingt critères à un point, les quatre erreurs et le corrigé adaptés au cas avant publication.",
};
const en: typeof fr = {
  title: "Project workshop and rubric", help: "Prepare an explicit rubric before editorial review. Examples are fictional; applying a reference does not publish this content.",
  reference: "Reference case to prepare", load: "View the reference rubric", loading: "Reading the rubric…", preview: "View the twenty checks", apply: "Apply this rubric to the draft",
  replaceTitle: "Replace this workshop’s rubric and rules?", replaceHelp: "The twenty checks and assessment rules are replaced with the selected reference. The brief, instructions, correction and other text stay intact and need to be adapted and reviewed.",
  threshold: "Self-reported points threshold, out of 20", reveal: "Voluntary access to the correction", explicit: "On explicit request", afterAssessment: "After a saved self-assessment", blocking: "Blocking issues to declare", issue: "Issue label",
  configured: "Workshop configured for case", unavailable: "The reference rubric could not be loaded. The draft has been kept intact.",
  remove: "Remove the workshop rules", removeTitle: "Remove this draft configuration?", removeHelp: "The content and checks stay present. Without these rules, the workshop will no longer be configured.", confirm: "Confirm", cancel: "Cancel",
  policyActivityOnly: "Configure the workshop on an activity rather than a course, module or guide.",
  rubricRequired: "Prepare the twenty one-point checks, four blocking issues and correction adapted to this case before publishing.",
};
export const getProjectEditorialDictionary = (locale: Locale) => locale === "fr" ? fr : en;
