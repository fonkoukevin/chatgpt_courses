import type { Locale } from "./locales";
const fr = {
  title: "Adresse publique", open: "Renommer l’adresse publique", close: "Fermer", slug: "Nom dans l’adresse", reason: "Motif du changement",
  help: "Le changement concerne cette ressource et cette langue dans toutes ses versions. Les anciennes adresses restent réservées à cette ressource et redirigent vers son adresse actuelle. Le contenu et les versions pédagogiques ne sont pas remplacés.",
  permission: "Si cette ressource a déjà été publiée dans cette langue, l’autorisation de publication est aussi nécessaire.",
  format: "Lettres minuscules sans accent, chiffres et tirets simples, de 1 à 180 caractères.", required: "Vérifiez le nom et renseignez un motif de 1 à 1 000 caractères.",
  confirmTitle: "Confirmer le changement d’adresse", confirmHelp: "Relisez l’ancienne et la nouvelle adresse avant d’enregistrer ce changement pour toutes les versions de cette ressource et de cette langue.",
  before: "Nom actuel", after: "Nouveau nom", confirm: "Enregistrer cette adresse", cancel: "Annuler", saving: "Enregistrement…", saved: "Adresse publique enregistrée.",
  modified: "Le changement d’adresse n’est pas encore enregistré.", parentBusy: "Enregistrez ou abandonnez les autres modifications avant de changer l’adresse.",
  reserved: "Ce nom est réservé à une autre ressource. Votre saisie est conservée.", conflict: "L’état actuel a changé. Votre proposition est conservée ; comparez-la avec la version actuelle avant de choisir.",
  read: "Lire la version actuelle", server: "Nom dans la version actuelle", useServer: "Utiliser la version actuelle", keepLocal: "Garder ma proposition sur cette version", discard: "Abandonner cette proposition", discardHelp: "La proposition et son motif seront abandonnés. Aucun changement ne sera envoyé.",
  unconfirmed: "Le résultat ne peut pas être confirmé pour le compte actuellement affiché. La proposition est conservée, sans nouvel envoi automatique.",
};
const en: typeof fr = {
  title: "Public address", open: "Rename the public address", close: "Close", slug: "Address name", reason: "Reason for the change",
  help: "The change applies to this resource and language across all its versions. Previous addresses remain reserved for this resource and redirect to its current address. Content and learning versions are not replaced.",
  permission: "Publication permission is also required if this resource has already been published in this language.",
  format: "Lowercase unaccented letters, digits and single hyphens, from 1 to 180 characters.", required: "Check the name and provide a reason of 1 to 1,000 characters.",
  confirmTitle: "Confirm the address change", confirmHelp: "Review the previous and new names before recording the change for all versions of this resource and language.",
  before: "Current name", after: "New name", confirm: "Save this address", cancel: "Cancel", saving: "Saving…", saved: "Public address saved.",
  modified: "The address change has not been saved.", parentBusy: "Save or discard other changes before changing the address.",
  reserved: "This name is reserved for another resource. Your input has been retained.", conflict: "The current state has changed. Your proposal is retained; compare it with the current version before choosing.",
  read: "Read the current version", server: "Name in the current version", useServer: "Use the current version", keepLocal: "Keep my proposal on this version", discard: "Discard this proposal", discardHelp: "The proposal and its reason will be discarded. No change will be sent.",
  unconfirmed: "The result cannot be confirmed for the account currently shown. Your proposal is retained without an automatic resubmission.",
};
export const getCmsSlugDictionary = (locale: Locale) => locale === "fr" ? fr : en;
