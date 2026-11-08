import type { Locale } from "./locales";

const fr = {
  title: "Projets récents", description: "Retrouvez vos trois productions les plus récemment modifiées. Leur état reste distinct de la progression des parcours.",
  library: "Voir tous mes projets", empty: "Aucun projet enregistré dans ce compte.", loading: "Chargement de vos projets…",
  unavailable: "Vos projets ne sont pas consultables pour le moment. Réessayez lorsque le service sera disponible.",
  invalid: "La liste des projets n’a pas pu être vérifiée. Réessayez pour la consulter.",
  error: "La consultation de vos projets n’a pas abouti.", retry: "Réessayer", updated: "Modifié le",
};
const en: typeof fr = {
  title: "Recent projects", description: "Find your three most recently edited productions. Their status stays separate from course progress.",
  library: "View all my projects", empty: "No project saved in this account.", loading: "Loading your projects…",
  unavailable: "Your projects cannot be viewed at the moment. Retry when the service is available.",
  invalid: "The project list could not be verified. Retry to view it.",
  error: "Your projects could not be retrieved.", retry: "Retry", updated: "Updated on",
};
export const getRecentProjectsDictionary = (locale: Locale) => locale === "fr" ? fr : en;
