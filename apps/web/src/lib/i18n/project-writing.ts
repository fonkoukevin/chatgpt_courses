import type { Locale } from "./locales";

const fr = {
  title: "Choisissez un titre pour retrouver cette production.",
  objective: "Quel résultat le client attend-il, d’après le dossier ?",
  scope: "Précisez ce qui est inclus, exclu et à confirmer.",
  method: "Décrivez les étapes de réalisation et les validations nécessaires.",
  timeline: "Indiquez le délai et ce qui doit être reçu ou validé avant son démarrage.",
  budget: "Détaillez quantités, tarifs et calculs issus du dossier. Signalez ce qui reste à chiffrer.",
  clarifications: "Listez les informations manquantes et les questions à poser.",
  nextStep: "Quelle action précise attendez-vous du client pour avancer ?",
};
const en: typeof fr = {
  title: "Choose a title that helps you find this work again.",
  objective: "What outcome does the client expect, according to the brief?",
  scope: "State what is included, excluded and still needs confirmation.",
  method: "Describe the delivery steps and the approvals they require.",
  timeline: "State the timeframe and what must be received or approved before it starts.",
  budget: "Show quantities, rates and calculations from the brief. Flag anything still to be priced.",
  clarifications: "List the missing information and the questions to ask.",
  nextStep: "What specific action should the client take to move forward?",
};
export const getProjectWritingDictionary = (locale: Locale) => locale === "fr" ? fr : en;
