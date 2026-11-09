import type { Locale } from "./locales";

const fr = { action: "Exporter ma saisie en Markdown (.md)", notice: "Copie locale du formulaire, y compris ses notes ou sections renseignées. Cet export ne confirme pas une sauvegarde serveur et ne contient pas de résultat d’évaluation.", failed: "Le téléchargement n’a pas pu être préparé. Copiez votre saisie avant de quitter la page." };
const en: typeof fr = { action: "Export my input as Markdown (.md)", notice: "A local copy of this form, including its completed notes or sections. Exporting does not confirm a server save and includes no assessment result.", failed: "The download could not be prepared. Copy your input before leaving this page." };
export const getExportsDictionary = (locale: Locale): typeof fr => locale === "fr" ? fr : en;
