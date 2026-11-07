import "server-only";
import { isLocale, type Locale } from "@/lib/i18n/locales";

const environments = ["local", "test", "staging", "production"] as const;
type Environment = (typeof environments)[number];

type ServerConfig = {
  environment: Environment;
  publicOrigin: string;
  defaultLocale: Locale;
  apiInternalOrigin: string;
  apiTimeoutMs: number;
};

function configurationError(variable: string, reason: string): never {
  // Report only the variable name and rule, never its potentially sensitive value.
  throw new Error(`Configuration ${variable}: ${reason}`);
}

function readOrigin(variable: string, fallback: string): URL {
  const value = process.env[variable] ?? fallback;
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    return configurationError(variable, "a valid absolute HTTP(S) origin is required");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
  ) {
    return configurationError(variable, "use an HTTP(S) origin without credentials, path, query or fragment");
  }
  return origin;
}

export function getServerConfig(): ServerConfig {
  const rawEnvironment = process.env.APP_ENV ?? (process.env.NODE_ENV === "production" ? "" : "local");
  if (!environments.some((value) => value === rawEnvironment)) {
    configurationError("APP_ENV", "choose local, test, staging or production explicitly");
  }
  const environment = rawEnvironment as Environment;
  const externalEnvironment = environment === "staging" || environment === "production";
  if (externalEnvironment && (!process.env.APP_PUBLIC_ORIGIN || !process.env.API_INTERNAL_URL)) {
    configurationError("APP_PUBLIC_ORIGIN / API_INTERNAL_URL", "explicit origins are required outside local/test");
  }
  const publicOrigin = readOrigin("APP_PUBLIC_ORIGIN", "http://localhost:3000");
  const apiOrigin = readOrigin("API_INTERNAL_URL", "http://127.0.0.1:8080");
  if (externalEnvironment && publicOrigin.protocol !== "https:") {
    configurationError("APP_PUBLIC_ORIGIN", "HTTPS is required in staging/production");
  }
  if (!externalEnvironment) {
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    if (!loopback.includes(publicOrigin.hostname) || !loopback.includes(apiOrigin.hostname)) {
      configurationError("APP_PUBLIC_ORIGIN / API_INTERNAL_URL", "local/test origins must use loopback hosts");
    }
  }
  const effectivePort = (origin: URL) => origin.port || (origin.protocol === "https:" ? "443" : "80");
  if (apiOrigin.origin === publicOrigin.origin || (
    !externalEnvironment && apiOrigin.protocol === publicOrigin.protocol && effectivePort(apiOrigin) === effectivePort(publicOrigin)
  )) {
    configurationError("API_INTERNAL_URL", "the API must use a different origin from the public frontend");
  }
  const defaultLocale = process.env.APP_DEFAULT_LOCALE ?? "fr";
  if (!isLocale(defaultLocale)) {
    configurationError("APP_DEFAULT_LOCALE", "choose fr or en");
  }
  const timeout = process.env.API_TIMEOUT_MS ?? "5000";
  if (!/^\d+$/.test(timeout) || Number(timeout) < 100 || Number(timeout) > 30000) {
    configurationError("API_TIMEOUT_MS", "use an integer between 100 and 30000");
  }
  return {
    environment,
    publicOrigin: publicOrigin.origin,
    defaultLocale,
    apiInternalOrigin: apiOrigin.origin,
    apiTimeoutMs: Number(timeout),
  };
}
