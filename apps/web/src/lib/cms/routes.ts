import type { Locale } from "../i18n/locales";
import { isUuid } from "../api/cms-validation";

export function cmsPath(locale: Locale, id?: string, mode: "edit" | "preview" = "edit"): string {
  if (id && !isUuid(id)) throw new Error("Invalid content identifier.");
  return `/${locale}/admin/content${id ? `/${id}/${mode}` : ""}`;
}
