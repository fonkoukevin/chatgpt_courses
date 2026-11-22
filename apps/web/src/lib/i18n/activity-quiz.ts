import type { Locale } from "./locales";

const fr = {
  feedback: "Vos réponses expliquées",
  summary: "Bilan du quiz",
  saved: "Cette tentative est enregistrée dans votre compte. Retrouvez-la dans votre historique avec sa langue et la version évaluée.",
  pageOnly: "Ce résultat reste dans cette page et ne sera pas récupéré après une connexion. Copiez vos réponses avant de la quitter si vous souhaitez les garder.",
  checkAgain: "Préparer une nouvelle vérification",
};

const en: typeof fr = {
  feedback: "Your answers explained",
  summary: "Quiz summary",
  saved: "This attempt is saved in your account. Find it in your history with its original language and the version assessed.",
  pageOnly: "This result stays on this page and will not be recovered after signing in. Copy your answers before leaving if you want to keep them.",
  checkAgain: "Prepare another check",
};

export const getActivityQuizDictionary = (locale: Locale) => locale === "fr" ? fr : en;
