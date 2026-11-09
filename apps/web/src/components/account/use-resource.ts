"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthResult } from "@/lib/api/auth-client";
import type { LearningAccountBoundary, LearningAccountState } from "@/lib/learning/account";

export function useAccountResource<T>(account: LearningAccountState, boundary: LearningAccountBoundary, load: (() => Promise<AuthResult<T>>) | null, initial: AuthResult<T> | null = null) {
  const [result, setResult] = useState(initial), [cycle, setCycle] = useState(0), [loading, setLoading] = useState(false), sequence = useRef(0), [scopeRead, setScopeRead] = useState<number | null>(null);
  useEffect(() => {
    if (account.status !== "active" || !load) return;
    const read = ++sequence.current, scope = boundary.capture(); let active = true;
    void load().then(value => { if (!active || read !== sequence.current || !boundary.isCurrent(scope)) return; setResult(value); setScopeRead(scope); setLoading(false); if (!value.ok) boundary.fail(value.error); });
    return () => { active = false; };
  }, [account.status, boundary, cycle, load]);
  const reload = useCallback(() => { sequence.current++; setLoading(true); setScopeRead(null); setCycle(value => value + 1); }, []);
  return { result, loading, reload, current: account.status === "active" && scopeRead === boundary.capture() };
}
