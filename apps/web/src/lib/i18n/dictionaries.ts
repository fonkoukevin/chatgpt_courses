import type { Locale } from "./locales";

export type Dictionary = {
  pageTitle: string;
  description: string;
  skipLink: string;
  localeNavigation: string;
  environment: string;
  eyebrow: string;
  title: string;
  introduction: string;
  statusTitle: string;
  statusDescription: string;
  check: string;
  checkError: string;
  retry: string;
  loading: string;
  idle: string;
  connected: string;
  connectedDetail: string;
  httpError: string;
  httpErrorDetail: string;
  unavailable: string;
  unavailableDetail: string;
  invalidResponse: string;
  invalidResponseDetail: string;
  scopeTitle: string;
  scopeBody: string;
  nextTitle: string;
  nextBody: string;
  footer: string;
  notFoundTitle: string;
  notFoundBody: string;
  back: string;
};

const dictionaries: Record<Locale, Dictionary> = {
  fr: {
    pageTitle: "Fondations locales · ChatGPT Courses",
    description: "Vérification locale des fondations de ChatGPT Courses.",
    skipLink: "Aller au contenu",
    localeNavigation: "Langue de l’interface",
    environment: "Développement local · P01",
    eyebrow: "ChatGPT Courses se construit",
    title: "Apprendre. Produire. Vérifier.",
    introduction: "Une plateforme pour transformer une tâche en réalisation, puis conserver une méthode réutilisable. Cette première étape prépare ses fondations.",
    statusTitle: "Vérifier la connexion",
    statusDescription: "Le contrôle interroge l’API réelle et sa connexion à PostgreSQL.",
    check: "Vérifier la connexion",
    checkError: "Tester une erreur API",
    retry: "Réessayer",
    loading: "Vérification en cours…",
    idle: "Le contrôle n’a pas encore été lancé.",
    connected: "Connexion confirmée",
    connectedDetail: "L’API et la base de données répondent au contrôle.",
    httpError: "Erreur HTTP {status}",
    httpErrorDetail: "L’API a répondu avec une erreur. Aucune donnée de remplacement n’est affichée.",
    unavailable: "Service indisponible",
    unavailableDetail: "La connexion à l’API ou à la base de données n’a pas pu être confirmée. Vous pouvez réessayer.",
    invalidResponse: "Réponse inattendue",
    invalidResponseDetail: "La réponse reçue ne correspond pas au contrat de la sonde. La connexion n’est pas confirmée.",
    scopeTitle: "Ce qui est en place",
    scopeBody: "Une interface en français et en anglais, une API et une base de données reliées par une même origine.",
    nextTitle: "La suite",
    nextBody: "Les parcours, les méthodes personnelles et les espaces de travail seront intégrés au fil des prochaines phases.",
    footer: "Environnement de développement. Aucune formation ni offre commerciale disponible à cette étape.",
    notFoundTitle: "Page introuvable",
    notFoundBody: "Cette page n’est pas disponible dans les fondations actuelles.",
    back: "Revenir à l’accueil",
  },
  en: {
    pageTitle: "Local foundations · ChatGPT Courses",
    description: "Local verification of the ChatGPT Courses foundations.",
    skipLink: "Skip to content",
    localeNavigation: "Interface language",
    environment: "Local development · P01",
    eyebrow: "Building ChatGPT Courses",
    title: "Learn. Produce. Verify.",
    introduction: "A platform to turn a task into a useful result, then keep a reusable method. This first step prepares its foundations.",
    statusTitle: "Check the connection",
    statusDescription: "The check queries the real API and its PostgreSQL connection.",
    check: "Check the connection",
    checkError: "Test an API error",
    retry: "Try again",
    loading: "Checking the connection…",
    idle: "The check has not been started yet.",
    connected: "Connection confirmed",
    connectedDetail: "The API and database are responding to the check.",
    httpError: "HTTP error {status}",
    httpErrorDetail: "The API returned an error. No substitute data is displayed.",
    unavailable: "Service unavailable",
    unavailableDetail: "The connection to the API or database could not be confirmed. You can try again.",
    invalidResponse: "Unexpected response",
    invalidResponseDetail: "The response does not match the health check contract. The connection is not confirmed.",
    scopeTitle: "What is in place",
    scopeBody: "A French and English interface, an API and a database connected through a single origin.",
    nextTitle: "What comes next",
    nextBody: "Learning paths, personal methods and workspaces will be integrated during the next phases.",
    footer: "Development environment. No training course or commercial offer is available at this stage.",
    notFoundTitle: "Page not found",
    notFoundBody: "This page is not available in the current foundations.",
    back: "Back to the home page",
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
