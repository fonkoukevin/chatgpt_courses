import type { ProjectFields } from "../api/generated/types.gen";
import { getProjectsDictionary } from "../i18n/projects";
import type { Locale } from "../i18n/locales";
import { validMethodText } from "../methods/validation";

export const projectSectionKeys = ["objective", "scope", "method", "timeline", "budget", "clarifications", "nextStep"] as const;

export function sameProjectFields(left: ProjectFields, right: ProjectFields): boolean {
  return (["title", "locale", ...projectSectionKeys, "externalText"] as const).every((key) => left[key] === right[key]);
}

export function emptyProjectFields(locale: Locale): ProjectFields {
  return { title: "", locale, objective: "", scope: "", method: "", timeline: "", budget: "", clarifications: "", nextStep: "", externalText: "" };
}

export function projectBodyText(value: ProjectFields): string {
  const t = getProjectsDictionary(value.locale);
  const sections = projectSectionKeys.filter((key) => value[key].length > 0).map((key) => `${t[key]}\n${value[key]}`);
  if (value.externalText) sections.push(`${t.externalText}\n${value.externalText}`);
  return [value.title, ...sections].filter(Boolean).join("\n\n");
}

export function invalidProjectField(value: ProjectFields): keyof ProjectFields | "size" | null {
  if (!validMethodText(value.title, 240, 1)) return "title";
  if (value.locale !== "fr" && value.locale !== "en") return "locale";
  for (const key of projectSectionKeys) if (!validMethodText(value[key], 8000)) return key;
  if (!validMethodText(value.externalText, 32000)) return "externalText";
  return new TextEncoder().encode(JSON.stringify(value)).byteLength > 48 * 1024 ? "size" : null;
}
