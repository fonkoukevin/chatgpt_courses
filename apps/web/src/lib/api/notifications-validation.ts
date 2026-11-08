import type { NotificationPage, NotificationSummary } from "./generated/types.gen";
import { record } from "./auth-validation";
import { isUuid } from "./cms-validation";
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const instant = (value: unknown): value is string => typeof value === "string" && value.endsWith("Z") && Number.isFinite(Date.parse(value));
export function isNotificationSummary(value: unknown): value is NotificationSummary {
  return record(value) && exact(value, ["id", "type", "status", "attempts", "cycleAttempts", "requeueCount", "nextAttemptAt", "leaseUntil", "lastErrorCode", "createdAt", "updatedAt", "expiresAt", "sentAt", "purgedAt", "payloadAvailable"])
    && isUuid(value.id) && typeof value.type === "string" && ["PASSWORD_RESET", "ACCOUNT_CREATED", "ACCESS_ACTIVATED", "SUPPORT_REPLY"].includes(value.type)
    && typeof value.status === "string" && ["PENDING", "PROCESSING", "RETRY", "SENT", "DEAD", "INDETERMINATE"].includes(value.status)
    && integer(value.attempts) && integer(value.cycleAttempts) && value.cycleAttempts <= value.attempts && integer(value.requeueCount)
    && [value.nextAttemptAt, value.leaseUntil, value.sentAt, value.purgedAt].every((date) => date === null || instant(date))
    && [value.createdAt, value.updatedAt, value.expiresAt].every(instant)
    && (value.lastErrorCode === null || typeof value.lastErrorCode === "string" && /^[A-Z0-9_]{1,64}$/.test(value.lastErrorCode)) && typeof value.payloadAvailable === "boolean";
}
export function isNotificationPage(value: unknown): value is NotificationPage {
  return record(value) && exact(value, ["items", "page", "pageSize", "total"]) && Array.isArray(value.items) && value.items.every(isNotificationSummary)
    && integer(value.page, 0, 1_000_000) && integer(value.pageSize, 1, 100) && integer(value.total) && value.items.length <= value.pageSize && value.items.length <= value.total;
}
