"use client";

import { useEffect } from "react";
import type { LearningAccountBoundary } from "@/lib/learning/account";

const checkedNavigations = new WeakSet<Event>();

export function useUnsavedLearningInput(dirty: boolean, boundary: LearningAccountBoundary, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { if (boundary.isPrivacyExit()) return; event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (boundary.isPrivacyExit() || checkedNavigations.has(event) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, location.href);
      if (destination.pathname === location.pathname && destination.search === location.search) return;
      checkedNavigations.add(event);
      if (!window.confirm(message)) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, boundary, message]);
}
