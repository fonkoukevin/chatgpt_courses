import type { MethodFields, MethodView } from "../api/generated/types.gen";
import type { Locale } from "../i18n/locales";
import { emptyParameters } from "./generator";
import { isMethodParameters, validMethodText } from "./validation";

export function emptyMethodFields(locale: Locale): MethodFields {
  return { title: "", locale, text: "", parameters: emptyParameters(), generatedFrom: null, notes: "", category: null };
}
export function methodFields(value: MethodView): MethodFields {
  const { title, locale, text, parameters, generatedFrom, notes, category } = value;
  return structuredClone({ title, locale, text, parameters, generatedFrom, notes, category });
}
export function invalidMethodField(value: MethodFields): "title" | "text" | "notes" | "category" | "parameters" | "size" | null {
  if (!validMethodText(value.title, 240, 1)) return "title";
  if (!validMethodText(value.text, 32000, 1)) return "text";
  if (!validMethodText(value.notes, 8000)) return "notes";
  if (value.category !== null && !validMethodText(value.category, 80, 1)) return "category";
  if (!isMethodParameters(value.parameters) || (value.generatedFrom !== null && !isMethodParameters(value.generatedFrom))) return "parameters";
  if (new TextEncoder().encode(JSON.stringify(value)).length > 48 * 1024) return "size";
  return null;
}
