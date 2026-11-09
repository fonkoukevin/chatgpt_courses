import { record } from "./auth-validation";
import { commerceExact, commerceInteger, commerceInstant, commerceLocale } from "./offers-validation";
import { isUuid } from "./cms-validation";

export { record, commerceExact as exact, commerceInteger as integer, commerceInstant as instant, commerceLocale as locale, isUuid };
export const oneOf = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value);
export const nullableId = (value: unknown) => value === null || isUuid(value);
export const nullableInstant = (value: unknown) => value === null || commerceInstant(value);
export const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const code = (value: unknown): value is string => typeof value === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(value);
export function accountPage<T>(value: unknown, guard: (item: unknown) => item is T, key: (item: T) => string): boolean {
  return record(value) && commerceExact(value, ["items", "page", "pageSize", "total"]) && commerceInteger(value.page, 0, 1_000_000) && commerceInteger(value.pageSize, 1, 100) && commerceInteger(value.total)
    && Array.isArray(value.items) && value.items.length <= value.pageSize && value.items.every(guard) && new Set(value.items.map(key)).size === value.items.length;
}
