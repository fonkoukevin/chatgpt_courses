import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const windows = process.platform === 'win32';
export const runtimeDir = join(root, '.runtime');

export function environment() {
  const localFile = join(root, '.env.local');
  if (existsSync(localFile) && (!process.env.APP_ENV || process.env.APP_ENV === 'local')) {
    process.loadEnvFile(localFile);
  }
  const env = { ...process.env };
  // Spring interprets a host DEBUG variable as its verbose diagnostic switch.
  delete env.DEBUG;
  env.NEXT_TELEMETRY_DISABLED ??= '1';
  env.PLAYWRIGHT_BROWSERS_PATH ??= join(root, '.tools/playwright');
  const jdk = join(root, '.tools/jdk/jdk-21.0.13+9');
  if (windows && existsSync(join(jdk, 'bin/java.exe'))) env.JAVA_HOME = jdk;
  env.PATH = [dirname(process.execPath), env.JAVA_HOME && join(env.JAVA_HOME, 'bin'), env.PATH]
    .filter(Boolean).join(delimiter);
  return env;
}

export function localEnvironment() {
  if (!existsSync(join(root, '.env.local'))) {
    throw new Error('Configuration locale absente. Exécuter npm run setup:local.');
  }
  const env = environment();
  if (env.APP_ENV !== 'local') throw new Error('Cette opération est réservée à APP_ENV=local.');
  for (const key of ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']) {
    if (!env[key]) throw new Error(`Configuration locale requise : ${key}.`);
  }
  return env;
}

export function command(executable, args = []) {
  if (windows && /\.cmd$/i.test(executable)) {
    const quote = (value) => {
      if (/["\r\n%]/.test(value)) throw new Error('Argument de commande Windows non pris en charge.');
      return `"${value}"`;
    };
    return ['cmd.exe', ['/d', '/s', '/c', `"${[executable, ...args].map(quote).join(' ')}"`]];
  }
  return [executable, args];
}

export function start(executable, args = [], options = {}) {
  const [file, argv] = command(executable, args);
  return spawn(file, argv, { cwd: root, env: environment(), stdio: 'inherit', windowsHide: true,
    windowsVerbatimArguments: windows && file === 'cmd.exe', ...options });
}

export function run(executable, args = [], options = {}) {
  const [file, argv] = command(executable, args);
  const result = spawnSync(file, argv, { cwd: root, env: environment(), stdio: 'inherit', windowsHide: true,
    windowsVerbatimArguments: windows && file === 'cmd.exe', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Échec de ${executable} (code ${result.status ?? 'signal'}).`);
  return result;
}

export function composeArgs(env) {
  return ['compose', '--project-name', 'chatgpt-courses-local', '--env-file', join(root, '.env.local'),
    '-f', join(root, 'infra/compose/compose.local.yml')];
}

export function loopbackPort(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} doit être une origine HTTP locale valide.`); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} doit être une origine HTTP en boucle locale, sans chemin ni identifiants.`);
  }
  const port = Number(url.port || '80');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Port invalide pour ${name}.`);
  return port;
}

export async function preflightServers(env) {
  const webPort = loopbackPort(env.APP_PUBLIC_ORIGIN, 'APP_PUBLIC_ORIGIN');
  const apiPort = loopbackPort(env.API_INTERNAL_URL, 'API_INTERNAL_URL');
  if (!/^\d+$/.test(env.API_PORT ?? '') || Number(env.API_PORT) !== apiPort) {
    throw new Error('API_PORT doit correspondre au port de API_INTERNAL_URL.');
  }
  if (webPort === apiPort) throw new Error('Les serveurs web et API doivent utiliser des ports distincts.');
  for (const port of [webPort, apiPort]) {
    await new Promise((resolvePort, rejectPort) => {
      const socket = createServer();
      socket.once('error', (cause) => {
        const detail = cause.code === 'EADDRINUSE' ? 'occupé' : 'indisponible';
        rejectPort(new Error(`Port ${port} ${detail} : aucun serveur existant n'a été arrêté.`, { cause }));
      });
      socket.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
        socket.close((error) => error ? rejectPort(error) : resolvePort());
      });
    });
  }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

export function stopOwned(pid, processGroup = false) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  if (!processExists(pid)) return true;
  let commandLine;
  if (windows) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`],
    { encoding: 'utf8', windowsHide: true });
    commandLine = result.stdout ?? '';
  } else {
    try { commandLine = readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { return false; }
  }
  if (!commandLine.toLowerCase().includes(root.toLowerCase())) return !processExists(pid);
  if (windows) {
    const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return result.status === 0 || !processExists(pid);
  }
  try { process.kill(processGroup ? -pid : pid, 'SIGTERM'); return true; } catch (error) { return error.code === 'ESRCH'; }
}

export async function terminateOwned(pid, processGroup = false) {
  // Never infer ownership of a stale group after its recorded leader has gone.
  if (processGroup && !processExists(pid) && processExists(-pid)) return false;
  if (!stopOwned(pid, processGroup)) return false;
  const target = processGroup ? -pid : pid;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!processExists(target)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if (!windows) {
    try { process.kill(target, 'SIGKILL'); } catch (error) { if (error.code === 'ESRCH') return true; }
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!processExists(target)) return true;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  return !processExists(target);
}

export async function waitFor(url, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* Service still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Service non disponible après ${timeoutMs / 1000}s : ${url}`);
}
