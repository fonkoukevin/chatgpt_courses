// Prepared for an explicitly authorized Playwright run; never installs browsers.
import { randomBytes, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { environment, preflightServers, root, runtimeDir, start, terminateOwned, waitFor, windows } from './lib/runtime.mjs';
import { createBrowserDatabase, stopBrowserDatabase } from './lib/browser-database.mjs';

const env = environment();
const phase = process.argv[2] ?? 'P01';
if (!['P01', 'P02', 'P04', 'P05', 'P06', 'P07'].includes(phase)) throw new Error('Phase de recette inconnue : P01, P02, P04, P05, P06 ou P07 attendu.');
const needsApi = phase !== 'P02';
const isolatedDatabase = ['P05', 'P06', 'P07'].includes(phase);
if (!['local', 'test'].includes(env.APP_ENV)) throw new Error('Vérification navigateur réservée à local/test.');
const port = (value, fallback) => {
  const text = value ?? String(fallback);
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 65535) throw new Error('Port navigateur de test invalide.');
  return Number(text);
};
env.APP_PUBLIC_ORIGIN = `http://127.0.0.1:${port(env.BROWSER_WEB_PORT, 3101)}`;
env.API_PORT = String(port(env.BROWSER_API_PORT, 8181));
env.API_INTERNAL_URL = `http://127.0.0.1:${env.API_PORT}`;
env.SPRING_PROFILES_ACTIVE = env.APP_ENV;
for (const key of needsApi && !isolatedDatabase ? ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'] : []) {
  if (!env[key]) throw new Error(`Configuration locale requise : ${key}.`);
}
const jar = join(root, 'apps/api/target/chatgpt-courses-api.jar');
const next = join(root, 'node_modules/next/dist/bin/next');
const runner = join(root, 'node_modules/@playwright/test/cli.js');
for (const file of [next, runner, join(root, 'apps/web/.next/BUILD_ID'), ...(needsApi ? [jar] : [])]) {
  if (!existsSync(file)) throw new Error('Builds ou @playwright/test 1.65.0 absents. Voir la préparation documentée ; aucune installation automatique.');
}
await preflightServers(env); // Occupied ports fail without stopping any existing server.

const runId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID()}`;
const runDirectory = join(runtimeDir, `browser-${runId}`);
const evidence = join(root, `docs/evidence/${phase}-browser`, runId);
mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
mkdirSync(evidence, { recursive: true });
const manifest = join(runDirectory, 'processes.json');
const ipc = windows ? `\\\\.\\pipe\\courses-browser-${randomUUID()}` : join(runDirectory, 'control.sock');
const token = randomBytes(32).toString('hex');
const children = [];
const sockets = new Set();
let api;
let web;
let stopping = false;
let controlQueue = Promise.resolve();
let verificationError;
let database;

function save() {
  writeFileSync(manifest, JSON.stringify({ root, runId, supervisor: process.pid,
    children: children.map(({ name, child, terminated }) => ({ name, pid: child.pid, terminated: Boolean(terminated) })),
    ...(database ? { database: { id: database.id, name: database.name, stopped: database.stopped } } : {}) }, null, 2), { mode: 0o600 });
}
function launch(name, executable, args, options = {}) {
  const handle = openSync(join(runDirectory, `${name}-${children.length}.log`), 'a', 0o600);
  let child;
  try { child = start(executable, args, { env, detached: !windows, stdio: ['ignore', handle, handle], ...options }); }
  finally { closeSync(handle); }
  const record = { name, child, terminated: false };
  record.exit = new Promise((resolveExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
    child.once('error', () => resolveExit({ code: 1, signal: null }));
  });
  children.push(record);
  save();
  return record;
}
async function ready(record, url) {
  await Promise.race([waitFor(url, 60_000), record.exit.then(() => {
    throw new Error(`${record.name} arrêté avant disponibilité. Voir les journaux de cette session dans .runtime.`);
  })]);
}
async function terminate(record) {
  if (!record || record.terminated) return;
  if (!Number.isInteger(record.child.pid)) {
    await record.exit; // Spawn failed; no process was created to stop.
    record.terminated = true;
    save();
    return;
  }
  if (!await terminateOwned(record.child.pid, !windows)) throw new Error(`Arrêt non confirmé : ${record.name}.`);
  await record.exit;
  record.terminated = true;
  save();
}
async function startApi() {
  if (stopping) throw new Error('Arrêt de la vérification en cours.');
  if (!api || api.terminated) {
    const java = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java';
    api = launch('api', java, ['-jar', jar, '--debug=false']);
  }
  await ready(api, `${env.API_INTERNAL_URL}/api/v1/system/health`);
  return { apiPid: api.child.pid, webPid: web?.child.pid };
}

// Private Node IPC, not a product HTTP endpoint. Only these two operations exist.
const control = createServer((socket) => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  socket.on('error', () => {});
  socket.setTimeout(90_000, () => socket.destroy());
  let input = '';
  let handled = false;
  socket.on('data', (chunk) => {
    if (handled) return;
    input += chunk.toString('utf8');
    if (input.length > 1024) return socket.destroy();
    if (!input.includes('\n')) return;
    handled = true;
    let message;
    try { message = JSON.parse(input.slice(0, input.indexOf('\n'))); } catch { return socket.destroy(); }
    if (message.token !== token || !['stop-api', 'start-api'].includes(message.operation)) return socket.destroy();
    controlQueue = controlQueue.then(async () => {
      if (stopping) throw new Error('Arrêt en cours.');
      if (message.operation === 'stop-api') {
        await terminate(api);
        return { webPid: web.child.pid };
      }
      return startApi();
    });
    controlQueue.then((result) => socket.end(`${JSON.stringify({ ok: true, ...result })}\n`),
      () => socket.end('{"ok":false,"error":"Commande IPC non confirmée ; voir les journaux locaux."}\n'));
    // A failed command must not prevent a later cleanup/restart command.
    controlQueue = controlQueue.catch(() => {});
  });
});

const interrupted = new Promise((_, reject) => {
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => reject(new Error(`Vérification interrompue : ${signal}.`)));
});
interrupted.catch(() => {}); // Also handle interruption during IPC initialization.
try {
  if (isolatedDatabase) { database = await createBrowserDatabase(env, runDirectory, runId, (record) => { database = record; save(); }); save(); }
  await new Promise((resolveListen, rejectListen) => {
    control.once('error', rejectListen);
    control.listen(ipc, resolveListen);
  });
  if (!windows) chmodSync(ipc, 0o600);
  web = launch('web', process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', String(new URL(env.APP_PUBLIC_ORIGIN).port)],
    { cwd: join(root, 'apps/web') });
  await Promise.race([Promise.all([
    ...(needsApi ? [startApi()] : []),
    ready(web, `${env.APP_PUBLIC_ORIGIN}/fr${phase === 'P02' ? '/dev/public' : phase === 'P01' ? '/dev/foundations' : ''}`),
  ]), interrupted]);
  const playwright = launch('playwright', process.execPath, [runner, 'test', '--config', join(root, 'playwright.config.ts')], {
    stdio: 'inherit',
    env: { ...env, COURSES_BROWSER_PHASE: phase, COURSES_BROWSER_ORIGIN: env.APP_PUBLIC_ORIGIN, COURSES_BROWSER_IPC: ipc,
      COURSES_BROWSER_TOKEN: token, COURSES_BROWSER_EVIDENCE: evidence, COURSES_BROWSER_RESULTS: join(runDirectory, 'results'),
      COURSES_BROWSER_LOGS: runDirectory,
      ...(database ? { COURSES_BROWSER_DB_ID: database.id, COURSES_BROWSER_RUN_ID: runId } : {}),
      COURSES_MAILPIT_ORIGIN: `http://127.0.0.1:${port(env.MAIL_HTTP_PORT, 8025)}` },
  });
  const result = await Promise.race([playwright.exit, interrupted]);
  if (result.code !== 0) throw new Error(`Recette navigateur échouée (code ${result.code}, signal ${result.signal}).`);
  if (phase === 'P02') {
    // The exact same compiled app must reject every fixture route at runtime.
    await terminate(web);
    const checks = [];
    for (const appEnvironment of ['staging', 'production']) {
      web = launch(`web-${appEnvironment}`, process.execPath,
        [next, 'start', '--hostname', '127.0.0.1', '--port', String(new URL(env.APP_PUBLIC_ORIGIN).port)],
        { cwd: join(root, 'apps/web'), env: { ...env, APP_ENV: appEnvironment, APP_PUBLIC_ORIGIN: 'https://courses.example.invalid' } });
      let started = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { const response = await fetch(`${env.APP_PUBLIC_ORIGIN}/fr/dev/public`, { signal: AbortSignal.timeout(1000) });
          if (response.status === 404) { started = true; break; }
          throw new Error(`Route locale visible en ${appEnvironment} (HTTP ${response.status}).`);
        } catch (error) { if (error.message.startsWith('Route locale')) throw error; }
        await new Promise((resolveWait) => setTimeout(resolveWait, 200));
      }
      if (!started) throw new Error(`Instance ${appEnvironment} non disponible pour le contrôle d'exclusion.`);
      for (const locale of ['fr', 'en']) for (const suffix of ['', '/components', '/public', '/learning', '/admin', '/foundations']) {
        const path = `/${locale}/dev${suffix}`;
        const response = await fetch(`${env.APP_PUBLIC_ORIGIN}${path}`, { redirect: 'manual' });
        const body = await response.text();
        const fixtureVisible = /Vitrine locale|Local showcase|data-showcase-fixture/.test(body);
        checks.push({ environment: appEnvironment, path, status: response.status, fixtureVisible });
        if (response.status !== 404 || fixtureVisible) throw new Error(`Exclusion de la vitrine échouée : ${appEnvironment} ${path}.`);
      }
      await terminate(web);
    }
    writeFileSync(join(evidence, 'production-guards.json'), JSON.stringify(checks, null, 2));
    console.log(`${checks.length} routes de vitrine refusées en staging/production par le build local.`);
  }
  console.log(`Recette navigateur terminée. Captures et rapport : docs/evidence/${phase}-browser/${runId}`);
} catch (error) {
  verificationError = error;
  throw error;
} finally {
  stopping = true;
  for (const socket of sockets) socket.destroy();
  const results = await Promise.allSettled([
    ...children.toReversed().map((record) => terminate(record)),
    (async () => {
      await controlQueue;
      if (control.listening) await new Promise((resolveClose, rejectClose) => {
        control.close((error) => error ? rejectClose(error) : resolveClose());
      });
    })(),
  ]);
  const cleanupErrors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  try { stopBrowserDatabase(database); save(); } catch (error) { cleanupErrors.push(error); }
  try {
    writeFileSync(join(evidence, 'session.json'), JSON.stringify({ runId, completedAt: new Date().toISOString(),
      result: verificationError || cleanupErrors.length ? 'failed' : 'passed', cleanupConfirmed: cleanupErrors.length === 0,
      ...(database ? { isolatedPostgres: { image: database.image, tmpfs: true, stopped: database.stopped } } : {}),
      processes: children.map(({ name, child, terminated }) => ({ name, pid: child.pid, terminated })) }, null, 2));
  } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) {
    if (verificationError) cleanupErrors.unshift(verificationError);
    throw new AggregateError(cleanupErrors, 'Tous les arrêts ont été tentés ; certains restent non confirmés. Le manifeste .runtime est conservé.');
  }
}
