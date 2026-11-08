"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getCurrentUser } from "../api/auth-client";
import type { ApiError } from "../api/client";
import { subscribeAccountEvents } from "../auth/account-events";

export type LearningAccountState = {
  status: "loading" | "active" | "anonymous" | "expired" | "changed" | "error";
  accountId: string | null;
  error: ApiError | null;
};

export function isAccountContextError(error: ApiError): boolean {
  return error.status === 409 && "problem" in error && error.problem?.code === "ACCOUNT_CONTEXT_CHANGED";
}

function createBoundary(expectedAccountId?: string) {
  const initial: LearningAccountState = { status: "loading", accountId: expectedAccountId ?? null, error: null };
  let state = initial, boundAccountId = expectedAccountId ?? null, generation = 0, privacyExit = false, permissionRechecked = false;
  const listeners = new Set<() => void>();
  const update = (next: LearningAccountState) => { state = next; for (const listener of listeners) listener(); };
  async function refresh(resetPermissionCheck = true) {
    if (resetPermissionCheck) permissionRechecked = false;
    const request = ++generation;
    update({ status: "loading", accountId: boundAccountId, error: null });
    const result = await getCurrentUser();
    if (request !== generation || privacyExit) return;
    if (result.ok) {
      if (boundAccountId && boundAccountId !== result.data.id) update({ status: "changed", accountId: boundAccountId, error: null });
      else { boundAccountId = result.data.id; update({ status: "active", accountId: boundAccountId, error: null }); }
    } else if (result.error.kind === "http" && result.error.status === 401) update({ status: boundAccountId ? "expired" : "anonymous", accountId: boundAccountId, error: result.error });
    else update({ status: "error", accountId: boundAccountId, error: result.error });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    capture: () => generation,
    isCurrent: (value: number) => value === generation && !privacyExit,
    isPrivacyExit: () => privacyExit,
    refresh,
    fail(error: ApiError) {
      if (isAccountContextError(error)) { generation++; update({ status: "changed", accountId: boundAccountId, error }); }
      else if (error.status === 401) { generation++; update({ status: boundAccountId ? "expired" : "anonymous", accountId: boundAccountId, error }); }
      else if (error.status === 403 && !permissionRechecked) { permissionRechecked = true; void refresh(false); }
    },
    start(returnTo: string) {
      privacyExit = false;
      void refresh();
      const unsubscribe = subscribeAccountEvents((kind) => {
        if (kind === "signed-in") { void refresh(); return; }
        generation++; privacyExit = true;
        window.location.replace(returnTo);
      });
      return () => { generation++; unsubscribe(); };
    },
  };
}

export type LearningAccountBoundary = ReturnType<typeof createBoundary>;

export function useLearningAccount(returnTo: string, expectedAccountId?: string) {
  const boundary = useMemo(() => createBoundary(expectedAccountId), [expectedAccountId]);
  const state = useSyncExternalStore(boundary.subscribe, boundary.getSnapshot, boundary.getServerSnapshot);
  useEffect(() => boundary.start(returnTo), [boundary, returnTo]);
  return { state, boundary };
}
