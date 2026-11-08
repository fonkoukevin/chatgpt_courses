import "server-only";
import { cookies } from "next/headers";
import { getServerConfig } from "../config/server";
import type { Locale } from "../i18n/locales";
import type { AuthResult } from "./auth-client";
import { learningDashboardPath } from "./learning-client";
import { decodeLearningResponse } from "./learning-response";
import { isLearningDashboard } from "./learning-validation";
import { isEnrollmentView, isLearningActivity } from "./learning-validation";
import { isUuid } from "./cms-validation";

async function read<T>(path: string, decode: (value: unknown) => value is T): Promise<AuthResult<T>> {
  const session = (await cookies()).get("SESSION")?.value;
  if (!session || !/^[A-Za-z0-9+/=_-]+$/.test(session)) return { ok: false, error: { kind: "http", status: 401 } };
  try {
    const config = getServerConfig();
    const response = await fetch(new URL(`/api/v1${path}`, config.apiInternalOrigin), {
      method: "GET", headers: { Accept: "application/json, application/problem+json", Cookie: `SESSION=${session}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(config.apiTimeoutMs),
    });
    return await decodeLearningResponse(response, decode);
  } catch { return { ok: false, error: { kind: "unavailable" } }; }
}
export const readLearningDashboard = (locale: Locale) => read(learningDashboardPath(locale), isLearningDashboard);
const id = (value: string) => { if (!isUuid(value)) throw new Error("Invalid saved learning identifier."); return value; };
export const readEnrollment = (enrollmentId: string, locale: Locale) => read(`/me/enrollments/${id(enrollmentId)}?locale=${locale}`, isEnrollmentView);
export const readSavedLearningActivity = (enrollmentId: string, activityId: string, activityVersionId: string, locale: Locale) =>
  read(`/me/enrollments/${id(enrollmentId)}/activities/${id(activityId)}?activityVersionId=${id(activityVersionId)}&locale=${locale}`, isLearningActivity);
