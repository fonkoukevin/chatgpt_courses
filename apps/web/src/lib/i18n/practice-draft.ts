import type { Locale } from "./locales";

const fr = {
  title: "Préparer mon essai", local: "Votre texte reste dans cette page. Copiez-le ou exportez-le avant de partir ; cet essai n’est pas enregistré dans votre compte.",
  response: "Mon essai", responseHelp: "Rédigez à partir des consignes et des pièces du dossier. Aucun exemple ni corrigé n’est inséré dans votre réponse. Limite : 32 000 caractères.",
  language: "Langue de rédaction", languageHelp: "Ce choix décrit votre texte ; il ne le traduit pas.", instructions: "Revoir la consigne pendant la rédaction",
  copy: "Copier mon essai", copied: "Essai copié.", copyFailed: "La copie a échoué. Sélectionnez votre texte pour le copier manuellement.", select: "Sélectionner mon texte",
  unsaved: "Votre essai reste dans cette page. Copiez-le ou exportez-le avant de quitter. Quitter cette page et perdre la saisie ?",
  activity: "Activité d’origine", version: "Version pédagogique", exportTitle: "Essai personnel local",
};
const en: typeof fr = {
  title: "Prepare my practice draft", local: "Your text stays on this page. Copy or export it before leaving; this draft is not saved in your account.",
  response: "My practice draft", responseHelp: "Write from the instructions and source materials. No example or solution is inserted into your answer. Limit: 32,000 characters.",
  language: "Writing language", languageHelp: "This describes your text; it does not translate it.", instructions: "Review the instructions while writing",
  copy: "Copy my practice draft", copied: "Practice draft copied.", copyFailed: "Copy failed. Select your text to copy it manually.", select: "Select my text",
  unsaved: "Your practice draft stays on this page. Copy or export it before leaving. Leave this page and lose your writing?",
  activity: "Source activity", version: "Learning version", exportTitle: "Local personal practice draft",
};
export const getPracticeDraftDictionary = (locale: Locale) => locale === "fr" ? fr : en;
