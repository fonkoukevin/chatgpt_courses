import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export function stagingCredentialsMatch(authorization: string | null): boolean {
  const username = process.env.STAGING_BASIC_USERNAME;
  const password = process.env.STAGING_BASIC_PASSWORD;
  if (!username || !/^[A-Za-z0-9._-]{3,80}$/.test(username) || !password || password.length < 24 || password.length > 256 || /[\r\n:]/.test(password)) {
    throw new Error("Configuration STAGING_BASIC_USERNAME / STAGING_BASIC_PASSWORD: a valid username and a private password of 24–256 characters are required");
  }
  const expected = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  // Constant-sized digests avoid length-dependent comparisons; never log either value.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return authorization !== null && authorization.length <= 1024 && timingSafeEqual(digest(authorization), digest(expected));
}
