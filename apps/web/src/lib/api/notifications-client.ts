import type { RetryNotification } from "./generated/types.gen";
import type { NotificationListQuery } from "../notifications/routes";
import { notificationStatuses } from "../notifications/routes";
import { matchingResource as matching, mutateResourceJson, readResourceJson, resourceId, resourcePagination } from "./resource-http";
import { isNotificationPage, isNotificationSummary } from "./notifications-validation";

export function notificationQueryString(query: NotificationListQuery = {}): string {
  if (query.status !== undefined && !notificationStatuses.includes(query.status)) throw new Error("Invalid notification filter.");
  return resourcePagination(query.page ?? 0, query.pageSize ?? 20) + (query.status ? `&${new URLSearchParams({ status: query.status })}` : "");
}
export const notificationPageGuard = (query: NotificationListQuery) => matching(isNotificationPage, (value) => value.page === (query.page ?? 0) && value.pageSize === (query.pageSize ?? 20) && (!query.status || value.items.every((item) => item.status === query.status)));
export const listNotifications = (query: NotificationListQuery = {}) => readResourceJson(`/admin/notifications?${notificationQueryString(query)}`, notificationPageGuard(query));
export const retryNotification = (id: string, body: RetryNotification, accountContext: string) => {
  if (!["CONFIGURATION_FIXED", "MANUAL_RECONCILIATION"].includes(body.reason) || typeof body.ackDuplicate !== "boolean") throw new Error("Invalid notification retry.");
  return mutateResourceJson(`/admin/notifications/${resourceId(id)}/retry`, { reason: body.reason, ackDuplicate: body.ackDuplicate }, resourceId(accountContext), matching(isNotificationSummary, (value) => value.id === id && value.status === "RETRY"));
};
