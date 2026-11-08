import type { Locale } from "@/lib/i18n/locales";

export type DomainAction = { href: string; label: string };
export type AccessState =
  | "unknown" | "loading" | "free" | "granted" | "required"
  | "login-required" | "payment-required" | "expired" | "revoked"
  | "not-published" | "not-found" | "temporarily-unavailable"
  | "translation-missing" | "unavailable" | "error";
export type PendingState = { kind: "unknown" | "loading" | "empty" | "error" };
export type ProgressState = PendingState | { kind: "ready"; completed: number; total: number };
export type SaveState =
  | { kind: "unknown" | "local" | "modified" | "saving" | "error" | "conflict" }
  | { kind: "saved"; confirmedAt: string };
export type VersionState =
  | { kind: "unknown" | "loading" | "error" }
  | { kind: "current" | "update-available" | "archived"; version: string }
  | { kind: "translation-missing"; availableLocale: Locale };
export type ResumeState = PendingState | {
  kind: "ready";
  title: string;
  activity: string;
  href: string;
  progress?: { completed: number; total: number };
};
export type OfferState =
  | { kind: "unknown" | "loading" | "unavailable" | "error" }
  | {
    kind: "ready";
    price: { amountMinor: number; currency: string };
    conditions: readonly string[];
    action?: DomainAction;
  };
export type MethodValues = {
  objective: string;
  context: string;
  data: string;
  audience: string;
  format: string;
  constraints: string;
};
export type RubricItem = { id: string; label: string; description?: string; blocking?: boolean };
