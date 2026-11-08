import type { ReactNode } from "react";
import { AuthMemory } from "@/components/auth/auth-memory";

export default function AuthLayout({ children }: { children: ReactNode }) { return <AuthMemory>{children}</AuthMemory>; }
