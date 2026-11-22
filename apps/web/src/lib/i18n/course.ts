import type { Locale } from "./locales";

const fr = {
  eyebrow: "Un parcours pour produire et vérifier",
  preview: "Un aperçu à essayer",
  previewOpen: "Ouvrir cette activité gratuite",
  previewNote: "Cette activité du programme est accessible gratuitement, sans inscription.",
  programmeLead: "Les étapes et les activités de cette version du parcours.",
  practice: "Pratiquer et vérifier",
  information: "Format et langues",
  author: "Auteur",
  authorUnknown: "Auteur non renseigné",
  format: "Format",
  formatUnknown: "Format non renseigné",
  duration: "Durée estimée",
  languages: "Langues de cette version",
  currentLanguage: "Langue consultée",
  versionDetails: "Version et vérification du contenu",
  pinnedProgramme: "Ce programme conserve les versions des activités présentées ici.",
};

const en: typeof fr = {
  eyebrow: "A course to produce and check your work",
  preview: "A preview you can try",
  previewOpen: "Open this free activity",
  previewNote: "This programme activity is free to access, with no sign-up needed.",
  programmeLead: "The stages and activities for this version of the course.",
  practice: "Practise and check",
  information: "Format and languages",
  author: "Author",
  authorUnknown: "Author not provided",
  format: "Format",
  formatUnknown: "Format not provided",
  duration: "Estimated duration",
  languages: "Languages for this version",
  currentLanguage: "Current language",
  versionDetails: "Content version and review",
  pinnedProgramme: "This programme keeps the activity versions shown here.",
};

export const getCourseDictionary = (locale: Locale) => locale === "fr" ? fr : en;
