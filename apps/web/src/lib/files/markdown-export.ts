import type { MethodFields, ProjectFields } from "../api/generated/types.gen";
import { getMethodsDictionary } from "../i18n/methods";
import { getProjectsDictionary } from "../i18n/projects";
import { projectSectionKeys } from "../projects/fields";

// Personal text remains literal in previews, including HTML or Markdown fences.
function literal(value: string): string {
  const longest = Math.max(2, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${value}\n${fence}`;
}
function document(sections: [string, string][]): string {
  return sections.map(([label, value]) => `## ${label}\n\n${literal(value)}`).join("\n\n") + "\n";
}
export function projectMarkdown(value: ProjectFields): string {
  const t = getProjectsDictionary(value.locale);
  return document([[t.title, value.title], [t.locale, value.locale], ...projectSectionKeys.map((key): [string, string] => [t[key], value[key]]), [t.externalText, value.externalText]]);
}
export function methodMarkdown(value: MethodFields): string {
  const t = getMethodsDictionary(value.locale);
  return document([[t.title, value.title], [t.textLocale, value.locale], [t.output, value.text], ...Object.entries(t.fields).map(([key, label]): [string, string] => [label, value.parameters[key as keyof typeof value.parameters]]), [t.notes, value.notes], [t.category, value.category ?? ""]]);
}
export function downloadMarkdown(kind: "project" | "method", locale: "fr" | "en", text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = window.document.createElement("a");
  anchor.href = url; anchor.download = `${kind}-${locale}.md`; anchor.hidden = true;
  window.document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
