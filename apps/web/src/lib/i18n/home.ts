import type { Locale } from "./locales";

const fr = {
  eyebrow: "Un parcours pratique, un travail à vous",
  trial: "Essayer l’activité gratuite", course: "Voir le parcours", anonymous: "Gratuite, sans inscription pour commencer.",
  preview: "Proposition de présentation à valider", demoLabel: "Exemple pédagogique fictif · BR01", demoTitle: "Du brief à une proposition vérifiable",
  briefLabel: "Le brief", brief: "Quatre pages à réécrire. Un budget maximal de 1\u202f400 € HT. Le logo et l’intégration sont évoqués sans tarif.",
  outputLabel: "Un extrait de proposition", output: "Le cadrage et la rédaction des quatre pages représentent 1\u202f200 € HT. Le logo et l’intégration restent à préciser et à chiffrer séparément.",
  checkLabel: "Le contrôle qui compte", check: "Un budget disponible ne crée pas un tarif. Retrouvez la source de chaque montant avant de vous engager.",
  demoNote: "Dossier fictif BR01 proposé pour cet aperçu local. Ce brouillon n’est pas une réponse obtenue de ChatGPT.",
  result: "Ce que vous allez produire", programme: "Un résultat à chaque étape", programmeLead: "Avancez dans le parcours en construisant votre propre travail.",
  audience: "Pour qui ?", prerequisites: "Pour commencer", faq: "Questions sur ce parcours", moreResources: "Consulter les ressources",
  steps: ["Comprendre le dossier", "Produire un brouillon", "Vérifier les engagements", "Réutiliser la méthode"],
  genericTitle: "Préparer, pratiquer, vérifier", genericBody: "Partez des informations disponibles, produisez votre propre travail, puis contrôlez-le avec les critères du dossier.",
};
const en: typeof fr = {
  eyebrow: "A practical course, work of your own",
  trial: "Try the free activity", course: "View the course", anonymous: "Free, with no sign-up needed to start.",
  preview: "Proposed presentation for review", demoLabel: "Fictional learning example · BR01", demoTitle: "From brief to a checkable proposal",
  briefLabel: "The brief", brief: "Four pages to rewrite. A maximum budget of €1,400 excluding tax. Logo work and integration are mentioned without prices.",
  outputLabel: "A proposal excerpt", output: "Scoping and copywriting for the four pages total €1,200 excluding tax. Logo work and integration need separate clarification and pricing.",
  checkLabel: "The essential check", check: "Available budget is not an agreed price. Trace every amount to its source before making a commitment.",
  demoNote: "Fictional BR01 case proposed for this local preview. This draft is not a response obtained from ChatGPT.",
  result: "What you will produce", programme: "A useful result at each step", programmeLead: "Work through the course by building your own output.",
  audience: "Who is it for?", prerequisites: "Before you start", faq: "Questions about this course", moreResources: "Browse the resources",
  steps: ["Understand the brief", "Produce a draft", "Check the commitments", "Reuse the method"],
  genericTitle: "Prepare, practise, check", genericBody: "Start from the available information, produce your own work, then check it against the case criteria.",
};
export const getHomeDictionary = (locale: Locale) => locale === "fr" ? fr : en;
