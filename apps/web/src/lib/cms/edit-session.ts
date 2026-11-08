export type EditSession<T> = {
  value: T;
  confirmed: T;
  etag: string;
  change: number;
  activeRequest: number | null;
  phase: "saved" | "modified" | "saving" | "error" | "conflict";
};
export type SaveAttempt<T> = { id: number; change: number; value: T; etag: string };

export function createEditSession<T>(value: T, etag: string): EditSession<T> {
  return { value, confirmed: value, etag, change: 0, activeRequest: null, phase: "saved" };
}

export function changeEditSession<T>(state: EditSession<T>, value: T): EditSession<T> {
  return { ...state, value, change: state.change + 1, phase: state.activeRequest === null ? "modified" : "saving" };
}

export function beginSave<T>(state: EditSession<T>, id: number): { state: EditSession<T>; attempt: SaveAttempt<T> } {
  if (state.activeRequest !== null) throw new Error("A save is already in progress.");
  return {
    state: { ...state, activeRequest: id, phase: "saving" },
    attempt: { id, change: state.change, value: structuredClone(state.value), etag: state.etag },
  };
}

export function confirmSave<T>(state: EditSession<T>, attempt: SaveAttempt<T>, confirmed: T, etag: string): EditSession<T> {
  if (state.activeRequest !== attempt.id) return state;
  const changedDuringSave = state.change !== attempt.change;
  return {
    ...state, value: changedDuringSave ? state.value : confirmed, confirmed, etag,
    activeRequest: null, phase: changedDuringSave ? "modified" : "saved",
  };
}

export function rejectSave<T>(state: EditSession<T>, attempt: SaveAttempt<T>, conflict: boolean): EditSession<T> {
  if (state.activeRequest !== attempt.id) return state;
  return { ...state, activeRequest: null, phase: conflict ? "conflict" : "error" };
}

export function rebaseLocalEdit<T>(state: EditSession<T>, server: T, etag: string): EditSession<T> {
  return { ...state, confirmed: server, etag, activeRequest: null, phase: "modified" };
}
