import type { Locale } from "./locales";

const copy = {
  fr: {
    modules: "Choisir une version de module", activities: "Choisir une version d’activité",
    description: "Les résultats proviennent du catalogue enregistré, dans la langue du contenu. Un enfant doit être publié et gelé avant la publication de son parent.",
    search: "Rechercher une version enfant", searchHint: "Titre, résumé ou identifiant lisible.", apply: "Rechercher", loading: "Chargement des versions…",
    empty: "Aucune version trouvée. Essayez une autre recherche ou créez d’abord le contenu enfant.",
    add: "Ajouter", added: "Déjà ajouté", version: "Version {n}", previous: "Versions précédentes", next: "Versions suivantes",
    pagination: "Pages des versions enfants", page: "Page {page} sur {total}", one: "{n} version trouvée", many: "{n} versions trouvées",
    maximum: "La composition contient déjà 100 enfants. Retirez-en un avant d’en ajouter un autre.",
  },
  en: {
    modules: "Choose a module version", activities: "Choose an activity version",
    description: "Results come from the saved catalogue in the content language. A child must be published and frozen before its parent can be published.",
    search: "Search child versions", searchHint: "Title, summary or readable identifier.", apply: "Search", loading: "Loading versions…",
    empty: "No versions found. Try another search or create the child content first.",
    add: "Add", added: "Already added", version: "Version {n}", previous: "Previous versions", next: "Next versions",
    pagination: "Child version pages", page: "Page {page} of {total}", one: "{n} version found", many: "{n} versions found",
    maximum: "The composition already contains 100 children. Remove one before adding another.",
  },
};

export const getCmsChildrenDictionary = (locale: Locale) => copy[locale];
