"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type FormMemory = { email: string; setEmail: (value: string) => void; displayName: string; setDisplayName: (value: string) => void };
const Memory = createContext<FormMemory | null>(null);

export function AuthMemory({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  return <Memory.Provider value={{ email, setEmail, displayName, setDisplayName }}>{children}</Memory.Provider>;
}
export function useAuthMemory(): FormMemory {
  const value = useContext(Memory);
  if (!value) throw new Error("AuthMemory provider required.");
  return value;
}
