import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

type Mode = "production" | "staging";
type Server = { origin: string; authorization: string; stopped: boolean; stop: () => Promise<void> };
export const seoProbeObservations: { mode: Mode; publishedLocales: string; port: number; stopped: boolean }[] = [];

export async function startSeoServer(mode: Mode, publishedLocales = "fr,en", missingCredentials = false): Promise<Server> {
  if (process.env.COURSES_BROWSER_PHASE !== "P16_SEO" || process.env.APP_ENV !== "test" || !process.env.COURSES_BROWSER_RUN_ID || !process.env.API_INTERNAL_URL) throw new Error("Owned SEO test supervisor required");
  const port = mode === "production" ? 3111 : 3112;
  await new Promise<void>((accept, reject) => { const socket = createServer(); socket.once("error", reject); socket.listen(port, "127.0.0.1", () => socket.close(error => error ? reject(error) : accept())); });
  const root = resolve("."), directory = join(root, ".runtime", `seo-${process.env.COURSES_BROWSER_RUN_ID}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (/^(?:PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LANG|LC_ALL)$/i.test(key)) env[key] = value;
  const password = randomBytes(32).toString("base64url"), username = "courses-local-probe";
  Object.assign(env, { APP_ENV: mode, APP_PUBLIC_ORIGIN: "https://courses.invalid", APP_DEFAULT_LOCALE: "fr", APP_PUBLISHED_LOCALES: publishedLocales,
    API_INTERNAL_URL: process.env.API_INTERNAL_URL, API_TIMEOUT_MS: "5000", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    ...(missingCredentials ? {} : { STAGING_BASIC_USERNAME: username, STAGING_BASIC_PASSWORD: password }) });
  const handle = openSync(join(directory, `${mode}-${seoProbeObservations.length}.log`), "a", 0o600);
  let child: ChildProcess;
  try { child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: join(root, "apps/web"), env, stdio: ["ignore", handle, handle], windowsHide: true, detached: process.platform !== "win32" }); }
  finally { closeSync(handle); }
  const observation = { mode, publishedLocales, port, stopped: false }; seoProbeObservations.push(observation);
  const state = { root, pid: child.pid, mode, port, stopped: false }; const manifest = join(directory, `${mode}-${seoProbeObservations.length}.json`);
  writeFileSync(manifest, JSON.stringify(state, null, 2), { mode: 0o600 });
  let ended = false; const exit = new Promise<void>(accept => { child.once("exit", () => { ended = true; accept(); }); child.once("error", () => { ended = true; accept(); }); });
  const server: Server = { origin: `http://127.0.0.1:${port}`, authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`, stopped: false,
    async stop() {
      if (server.stopped) return;
      if (!ended && child.pid) {
        if (process.platform === "win32") {
          const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}').CommandLine`], { windowsHide: true, encoding: "utf8" });
          if (!result.stdout.toLowerCase().includes(join(root, "node_modules/next/dist/bin/next").toLowerCase())) throw new Error("SEO process ownership not confirmed");
          const stopped = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          if (stopped.status !== 0 && !ended) throw new Error("SEO process stop not confirmed");
        } else process.kill(-child.pid, "SIGTERM");
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([exit, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("SEO server stop timeout")), 10_000); })]); }
      finally { if (timeout) clearTimeout(timeout); }
      server.stopped = state.stopped = observation.stopped = true; writeFileSync(manifest, JSON.stringify(state, null, 2), { mode: 0o600 });
    } };
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (ended) throw new Error("SEO process ended before readiness; see private runtime log");
      try { const result = await fetch(`${server.origin}/robots.txt`, { signal: AbortSignal.timeout(1500) }); if ([200, 401, 503].includes(result.status)) return server; } catch { /* startup only */ }
      await new Promise(accept => setTimeout(accept, 100));
    }
    throw new Error("SEO process readiness timeout");
  } catch (error) { await server.stop(); throw error; }
}
