"use client";

import { createContext, useContext, type ReactNode } from "react";
import { emptyPublicNavigation, type PublicNavigationAvailability } from "@/lib/public/navigation";

const PublicNavigationContext = createContext<PublicNavigationAvailability>(emptyPublicNavigation);

export function PublicNavigationProvider({ value, children }: { value: PublicNavigationAvailability; children: ReactNode }) {
  return <PublicNavigationContext.Provider value={value}>{children}</PublicNavigationContext.Provider>;
}

export function usePublicNavigationAvailability() { return useContext(PublicNavigationContext); }
