"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthResult } from "@/lib/api/auth-client";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";

export function useRefundResource<T>(account: LearningAccountState, boundary: LearningAccountBoundary, load: (() => Promise<AuthResult<T>>) | null, initial: AuthResult<T> | null = null) {
  const [result, setResult] = useState(initial), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(false), sequence = useRef(0);
  const [lastGood, setLastGood] = useState<T | null>(initial?.ok ? initial.data : null), [scopeRead, setScopeRead] = useState<number | null>(null);
  useEffect(() => {
    if (account.status !== "active" || !load) return;
    const request = ++sequence.current, scope = boundary.capture(); let active = true;
    void load().then(value => { if (!active || request !== sequence.current || !boundary.isCurrent(scope)) return; setResult(value); setScopeRead(scope); if (value.ok) setLastGood(value.data); setLoading(false); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, load, refresh]);
  const reload = useCallback(() => { sequence.current++; setLoading(true); setRefresh(value => value + 1); }, []);
  return { result, lastGood, current: account.status === "active" && scopeRead === boundary.capture(), loading, reload };
}
