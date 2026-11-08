import type { Locale } from "../i18n/locales";
import { getMethodsDictionary } from "../i18n/methods";
import type { MethodFields, MethodParameters } from "../api/generated/types.gen";
import { parameterKeys, validMethodText } from "./validation";

export const generatorFields = parameterKeys;
export type GeneratorParameters = MethodParameters;
export type GeneratorValue = Pick<MethodFields, "parameters" | "generatedFrom" | "text">;
export type GeneratorErrors = Partial<Record<keyof GeneratorParameters, "required" | "tooLong" | "invalidCharacters">>;
export const requiredGeneratorFields = ["objective", "availableData", "format"] as const;
export function emptyParameters(): GeneratorParameters {
  return { objective: "", context: "", availableData: "", recipient: "", format: "", constraints: "", clarifications: "" };
}
export function validateGenerator(value: GeneratorParameters): GeneratorErrors {
  const errors: GeneratorErrors = {};
  for (const field of generatorFields) {
    if (requiredGeneratorFields.some((key) => key === field) && !value[field].trim()) errors[field] = "required";
    else if (value[field].length > 4000) errors[field] = "tooLong";
    else if (!validMethodText(value[field], 4000)) errors[field] = "invalidCharacters";
  }
  return errors;
}
export function parametersChanged(value: GeneratorValue): boolean {
  return value.generatedFrom !== null && generatorFields.some((field) => value.parameters[field] !== value.generatedFrom![field]);
}
export function assembleInstruction(parameters: GeneratorParameters, locale: Locale, sourceInstruction = ""): string {
  if (Object.keys(validateGenerator(parameters)).length) throw new Error("Generator parameters are incomplete or invalid.");
  const t = getMethodsDictionary(locale);
  return [sourceInstruction.trim(), t.assemblyIntro, ...generatorFields.map((field) => `${t.fields[field]}\n${parameters[field].trim() || t.assemblyUnknown}`), t.assemblyChecks].filter(Boolean).join("\n\n");
}
export function generateInstruction(value: GeneratorValue, locale: Locale, sourceInstruction = ""): GeneratorValue {
  return { parameters: { ...value.parameters }, generatedFrom: { ...value.parameters }, text: assembleInstruction(value.parameters, locale, sourceInstruction) };
}
