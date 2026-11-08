import type { ApiError } from "../api/client";
import { validMethodText } from "../methods/validation";
import type { QuizPolicy } from "../api/generated/types.gen";

export function validActivityNote(text: string): boolean {
  return validMethodText(text, 16000) && new TextEncoder().encode(JSON.stringify({ text })).byteLength <= 48 * 1024;
}

export function ambiguousLearningError(error: ApiError): boolean {
  return error.kind === "unavailable" || error.kind === "invalid-response" || (error.status ?? 0) >= 500;
}

export function remainingQuizAttempts(policy: QuizPolicy, overviewRemaining: number | null | undefined, resultAttemptNumber?: number): number | null | undefined {
  if (policy.maxAttempts === null) return null;
  const known = typeof overviewRemaining === "number" ? [overviewRemaining] : [];
  if (resultAttemptNumber !== undefined) known.push(Math.max(0, policy.maxAttempts - resultAttemptNumber));
  return known.length > 0 ? Math.min(...known) : overviewRemaining;
}
