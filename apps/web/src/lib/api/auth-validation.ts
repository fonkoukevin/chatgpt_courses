import type { AuthUser, CsrfToken, Preferences } from "./generated/types.gen";

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

export function isAuthUser(value: unknown): value is AuthUser {
  return record(value) && exactKeys(value, ["id", "email", "displayName", "locale", "roles", "permissions"])
    && typeof value.id === "string" && uuid.test(value.id) && typeof value.email === "string" && value.email.length > 0
    && (value.displayName === null || typeof value.displayName === "string") && (value.locale === "fr" || value.locale === "en")
    && Array.isArray(value.roles) && value.roles.every((item) => typeof item === "string")
    && Array.isArray(value.permissions) && value.permissions.every((item) => typeof item === "string");
}

export function isCsrfToken(value: unknown): value is CsrfToken {
  return record(value) && exactKeys(value, ["token", "headerName", "parameterName"])
    && typeof value.token === "string" && value.token.length > 0 && value.token.length <= 4096 && !/[\r\n]/.test(value.token)
    && value.headerName === "X-CSRF-TOKEN" && value.parameterName === "_csrf";
}

export function isPreferences(value: unknown): value is Preferences {
  return record(value) && exactKeys(value, ["id", "locale", "revision"])
    && typeof value.id === "string" && uuid.test(value.id) && (value.locale === "fr" || value.locale === "en")
    && typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0;
}

export function preferencesEtagMatches(value: Preferences, etag: string | null): etag is string {
  return etag === `"preferences-${value.id}-r${value.revision}"`;
}

export function validNewPassword(value: string): boolean {
  const length = Array.from(value).length;
  return length >= 12 && length <= 128 && new TextEncoder().encode(value).length <= 1024;
}
