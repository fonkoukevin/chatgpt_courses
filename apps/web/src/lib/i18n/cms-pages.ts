import type { Locale } from "./locales";

const copy = {
  fr: { invalidFilters: "Les filtres de cette adresse sont invalides. Revenez aux contenus pour choisir de nouveaux filtres.", retry: "Recharger cette page" },
  en: { invalidFilters: "The filters in this address are invalid. Return to the content list to choose new filters.", retry: "Reload this page" },
};
export const getCmsPageDictionary = (locale: Locale) => copy[locale];
