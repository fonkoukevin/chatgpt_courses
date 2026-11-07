"use client";

import { useEffect, useRef, useState } from "react";
import { checkSystemHealth, requestUnknownSystemEndpoint, type ApiError } from "@/lib/api/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type CheckTarget = "health" | "unknown";
type CheckState =
  | { phase: "idle" }
  | { phase: "loading"; retryAvailable: boolean }
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
  const checkButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const removedRetryFocus = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => { activeRequest.current?.abort(); }, []);

  useEffect(() => {
    if (state.phase !== "success") return;
    const previousButton = removedRetryFocus.current;
    removedRetryFocus.current = null;
    // Retry disappears after a successful response. Restore a useful focus only
    // when that button still owned it immediately before the render removed it.
    if (previousButton && !previousButton.isConnected && document.activeElement === document.body) {
      checkButton.current?.focus({ preventScroll: true });
    }
  }, [state.phase]);

  async function run(target: CheckTarget, trigger: HTMLButtonElement) {
    // aria-disabled keeps keyboard focus; this synchronous guard also prevents
    // a second request before React has rendered the busy state.
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    lastTarget.current = target;
    removedRetryFocus.current = null;
    setState({ phase: "loading", retryAvailable: state.phase === "error" });
    const result = await (target === "health" ? checkSystemHealth : requestUnknownSystemEndpoint)(controller.signal);
    if (activeRequest.current !== controller || controller.signal.aborted) return;
    activeRequest.current = null;
    if (result.ok && trigger === retryButton.current && document.activeElement === trigger) {
      removedRetryFocus.current = trigger;
    }
    setState(result.ok ? { phase: "success" } : { phase: "error", error: result.error });
  }

  const copy = state.phase === "error" ? errorCopy(state.error, dictionary) : null;
  const busy = state.phase === "loading";
  const retryAvailable = state.phase === "error" || (state.phase === "loading" && state.retryAvailable);

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
        <button ref={checkButton} className="button button-primary" type="button" aria-disabled={busy} onClick={(event) => void run("health", event.currentTarget)}>
          {dictionary.check}
        </button>
        <button className="button button-secondary" type="button" aria-disabled={busy} onClick={(event) => void run("unknown", event.currentTarget)}>
          {dictionary.checkError}
        </button>
        {retryAvailable && <button ref={retryButton} className="button button-link" type="button" aria-disabled={busy} onClick={(event) => void run(lastTarget.current, event.currentTarget)}>{dictionary.retry}</button>}
      </div>
    </section>
  );
}
