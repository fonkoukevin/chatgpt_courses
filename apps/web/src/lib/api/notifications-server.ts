import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { NotificationListQuery } from "../notifications/routes";
import type { NotificationPage } from "./generated/types.gen";
import type { AuthResult } from "./auth-client";
import { decodeAssetResponse } from "./assets-response";
import { notificationPageGuard, notificationQueryString } from "./notifications-client";

export async function readNotifications(query: NotificationListQuery = {}): Promise<AuthResult<NotificationPage>> {
  const session = (await cookies()).get("SESSION")?.value;
  if (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session)) return { ok: false, error: { kind: "http", status: 401 } };
  const path = `/api/v1/admin/notifications?${notificationQueryString(query)}`;
  try {
    const config = getServerConfig(), response = await fetch(new URL(path, config.apiInternalOrigin), { method: "GET", headers: { Accept: "application/json, application/problem+json", Cookie: `SESSION=${session}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs) });
    return await decodeAssetResponse(response, notificationPageGuard(query));
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
