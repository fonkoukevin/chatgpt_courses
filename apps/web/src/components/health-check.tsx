"use client";

import { useEffect, useRef, useState } from "react";
import { checkSystemHealth, requestUnknownSystemEndpoint, type ApiError } from "@/lib/api/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type CheckTarget = "health" | "unknown";
type CheckState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success" }
  | { phase: "error"; error: ApiError };

function errorCopy(error: ApiError, dictionary: Dictionary): { title: string; detail: string } {
  if (error.kind === "unavailable") return { title: dictionary.unavailable, detail: dictionary.unavailableDetail };
  if (error.kind === "invalid-response") return { title: dictionary.invalidResponse, detail: dictionary.invalidResponseDetail };
  return { title: dictionary.httpError.replace("{status}", String(error.status)), detail: dictionary.httpErrorDetail };
}

export function HealthCheck({ dictionary }: { dictionary: Dictionary }) {
  const [state, setState] = useState<CheckState>({ phase: "idle" });
  const activeRequest = useRef<AbortController | null>(null);
  const lastTarget = useRef<CheckTarget>("health");

  useEffect(() => () => { activeRequest.current?.abort(); }, []);

  async function run(target: CheckTarget) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    lastTarget.current = target;
    setState({ phase: "loading" });
    const result = await (target === "health" ? checkSystemHealth : requestUnknownSystemEndpoint)(controller.signal);
    if (activeRequest.current !== controller || controller.signal.aborted) return;
    setState(result.ok ? { phase: "success" } : { phase: "error", error: result.error });
  }

  const copy = state.phase === "error" ? errorCopy(state.error, dictionary) : null;
  const busy = state.phase === "loading";

  return (
    <section className="connection-panel" aria-labelledby="connection-title" aria-busy={busy}>
      <div>
        <h2 id="connection-title">{dictionary.statusTitle}</h2>
        <p className="muted">{dictionary.statusDescription}</p>
      </div>
      <div className="connection-status" data-state={state.phase === "error" ? state.error.kind : state.phase} role="status" aria-live="polite" aria-atomic="true">
        {state.phase === "idle" && <p>{dictionary.idle}</p>}
        {busy && <p>{dictionary.loading}</p>}
        {state.phase === "success" && <><h3>{dictionary.connected}</h3><p>{dictionary.connectedDetail}</p></>}
        {copy && <><h3>{copy.title}</h3><p>{copy.detail}</p></>}
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="button button-primary" type="button" disabled={busy} onClick={() => void run("health")}>
          {dictionary.check}
        </button>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => void run("unknown")}>
          {dictionary.checkError}
        </button>
        {state.phase === "error" && <button className="button button-link" type="button" onClick={() => void run(lastTarget.current)}>{dictionary.retry}</button>}
      </div>
    </section>
  );
}
