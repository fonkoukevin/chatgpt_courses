import type { MethodDefinition, MethodParameters } from "../api/generated/types.gen";
import { record } from "../api/auth-validation";

export const parameterKeys = ["objective", "context", "availableData", "recipient", "format", "constraints", "clarifications"] as const;
export const validMethodText = (value: unknown, max: number, min = 0): value is string => typeof value === "string"
  && value.length <= max && value.trim().length >= min && !value.includes("\0")
  && Array.from(value).every((character) => character.length !== 1 || character.charCodeAt(0) < 0xd800 || character.charCodeAt(0) > 0xdfff);
export function isMethodParameters(value: unknown): value is MethodParameters {
  return record(value) && Object.keys(value).length === parameterKeys.length
    && parameterKeys.every((key) => validMethodText(value[key], 4000));
}
export function isMethodDefinition(value: unknown): value is MethodDefinition {
  if (!record(value) || Object.keys(value).some((key) => !["useCases", "requiredInputs", "steps", "starterInstruction", "example", "checks", "limitations", "defaults"].includes(key))) return false;
  const list = (items: unknown) => Array.isArray(items) && items.length <= 20 && items.every((item) => validMethodText(item, 1000, 1));
  return list(value.useCases) && list(value.requiredInputs) && list(value.steps) && list(value.checks) && list(value.limitations)
    && validMethodText(value.starterInstruction, 4000) && validMethodText(value.example, 8000)
    && isMethodParameters(value.defaults) && new TextEncoder().encode(JSON.stringify(value)).length <= 24 * 1024;
}
export function isCompleteMethodDefinition(value: unknown): value is MethodDefinition {
  return isMethodDefinition(value) && [value.useCases, value.requiredInputs, value.steps, value.checks, value.limitations]
    .every((items) => items.length > 0 && items.every((item) => item.trim().length > 0))
    && value.starterInstruction.trim().length > 0 && value.example.trim().length > 0;
}
