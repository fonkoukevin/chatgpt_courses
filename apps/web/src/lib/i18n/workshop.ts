import type { Locale } from "./locales";

const fr = {
  navigation: "Les quatre moments de l’activité",
  understand: "Comprendre",
  produce: "Produire",
  verify: "Vérifier",
  reuse: "Réutiliser",
  understandHelp: "Repérez le travail attendu et les informations à utiliser.",
  produceHelp: "Gardez la consigne et les pièces du dossier à portée de votre rédaction.",
  verifyHelp: "Relisez votre production, puis vérifiez votre compréhension. Ces démarches restent distinctes.",
  reuseHelp: "Gardez les observations utiles pour une prochaine tâche. Les notes, les déclarations et le quiz restent séparés.",
  details: "Version, langue et revue du contenu",
  otherCriteria: "Autres critères publiés",
};

const en: typeof fr = {
  navigation: "The four stages of this activity",
  understand: "Understand",
  produce: "Produce",
  verify: "Check",
  reuse: "Reuse",
  understandHelp: "Identify the expected work and the information you will use.",
  produceHelp: "Keep the instructions and case materials close to your writing.",
  verifyHelp: "Review your work, then check your understanding. These remain separate steps.",
  reuseHelp: "Keep useful observations for your next task. Notes, declarations and the quiz remain separate.",
  details: "Content version, language and review",
  otherCriteria: "Other published criteria",
};

export const getWorkshopDictionary = (locale: Locale) => locale === "fr" ? fr : en;
