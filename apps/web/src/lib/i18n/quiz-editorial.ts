import type { Locale } from "./locales";

const fr = {
  title: "Règle du quiz", help: "Cette règle appartient à la version pédagogique. Elle ne valide ni projet ni compétence.",
  threshold: "Seuil de réussite (%)", attempts: "Nombre maximal de tentatives", unlimited: "Illimitées si vide",
  legacy: "Sans règle explicite : seuil de 100 %, tentatives illimitées.", enable: "Définir une règle explicite", reset: "Utiliser la règle par défaut",
};
const en: typeof fr = {
  title: "Quiz rule", help: "This rule belongs to the learning version. It validates neither a project nor a skill.",
  threshold: "Passing threshold (%)", attempts: "Maximum attempts", unlimited: "Unlimited when empty",
  legacy: "Without an explicit rule: 100% threshold, unlimited attempts.", enable: "Set an explicit rule", reset: "Use the default rule",
};
export const getQuizEditorialDictionary = (locale: Locale) => locale === "fr" ? fr : en;
