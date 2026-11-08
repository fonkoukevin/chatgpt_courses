import { record } from "./auth-validation";

export function isQuizPolicy(value: unknown): value is { passPercent: number; maxAttempts: number | null } {
  return record(value) && Object.keys(value).length === 2 && Object.keys(value).every((key) => ["passPercent", "maxAttempts"].includes(key))
    && typeof value.passPercent === "number" && Number.isInteger(value.passPercent) && value.passPercent >= 1 && value.passPercent <= 100
    && (value.maxAttempts === null || (typeof value.maxAttempts === "number" && Number.isInteger(value.maxAttempts) && value.maxAttempts >= 1 && value.maxAttempts <= 50));
}
