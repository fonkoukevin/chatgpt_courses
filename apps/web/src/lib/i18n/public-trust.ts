import type { Locale } from "./locales";

const fr = {
  benefit: "Apprendre en produisant. Vérifier avant de réutiliser.",
  navigation: "Aide et demandes du compte",
  help: "Aide dans mon compte",
  dataRequests: "Mes demandes de données (connexion requise)",
  course: "Formation",
  trial: "Essai gratuit",
  resources: "Ressources",
};

const en: typeof fr = {
  benefit: "Learn by producing. Check before reusing.",
  navigation: "Account help and requests",
  help: "Help in my account",
  dataRequests: "My data requests (sign-in required)",
  course: "Course",
  trial: "Free activity",
  resources: "Resources",
};

export const getPublicTrustDictionary = (locale: Locale): typeof fr => locale === "fr" ? fr : en;
