import type { Locale } from "./locales";
const fr = {
  title: "Nouveau projet", description: "Conservez un travail préparé depuis une activité et retrouvez-le dans votre compte.",
  connectedAs: "Compte utilisé pour cet import", importTitle: "Reprendre votre préparation temporaire ?",
  importHelp: "La préparation reste dans cet onglet pendant deux heures au maximum. Importer ne l’enregistre pas : relisez-la puis enregistrez volontairement votre production dans ce compte.",
  importAction: "Importer ma préparation", discard: "Abandonner cette préparation", discardHelp: "Cette action retire uniquement le brouillon temporaire de cet onglet. Copiez-le avant de continuer si vous souhaitez le garder.",
  unavailable: "La préparation temporaire est absente, expirée ou indisponible dans ce navigateur. Aucun projet n’a été créé depuis cet écran.",
  noSource: "Commencez depuis les consignes d’une activité accessible pour conserver sa version et sa grille avec votre projet.",
  discover: "Choisir une activité", loading: "Lecture de la préparation…", cancel: "Annuler",
};
const en: typeof fr = {
  title: "New project", description: "Keep work prepared from an activity and find it again in your account.",
  connectedAs: "Account used for this import", importTitle: "Resume your temporary preparation?",
  importHelp: "The preparation stays in this tab for up to two hours. Importing does not save it: review it, then deliberately save your production in this account.",
  importAction: "Import my preparation", discard: "Discard this preparation", discardHelp: "This removes only the temporary draft in this tab. Copy it first if you want to keep it.",
  unavailable: "The temporary preparation is missing, expired or unavailable in this browser. No project has been created from this screen.",
  noSource: "Start from an available activity’s instructions to keep its version and rubric with your project.",
  discover: "Choose an activity", loading: "Reading the preparation…", cancel: "Cancel",
};
export const getProjectDraftDictionary = (locale: Locale) => locale === "fr" ? fr : en;
