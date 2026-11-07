import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { environment, root, runtimeDir, run, start, terminateOwned, waitFor, windows } from './lib/runtime.mjs';

const env = environment();
if (!['local', 'test'].includes(env.APP_ENV)) throw new Error('Vérification HTTP réservée à local/test.');
for (const file of ['apps/api/target/chatgpt-courses-api.jar', 'apps/web/.next/BUILD_ID']) {
  if (!existsSync(join(root, file))) throw new Error(`Build requis : ${file}`);
}
for (const origin of [env.APP_PUBLIC_ORIGIN, env.API_INTERNAL_URL]) {
  const url = new URL(origin);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Sondes réservées à la boucle locale.');
  await new Promise((resolvePort, rejectPort) => {
    const socket = createServer();
    socket.once('error', () => rejectPort(new Error(`Port ${url.port} occupé : arrêter les serveurs avant verify:http.`)));
    socket.listen(Number(url.port), '127.0.0.1', () => socket.close(resolvePort));
  });
}

mkdirSync(runtimeDir, { recursive: true });
const children = [];
function launch(script) {
  const handle = openSync(join(runtimeDir, `verify-${script}.log`), 'a');
  const child = start(process.execPath, [join(root, 'scripts', `${script}.mjs`), 'start'],
    { env, detached: !windows, stdio: ['ignore', handle, handle] });
  closeSync(handle);
  const exit = new Promise((resolveExit) => {
    child.once('exit', () => resolveExit());
    child.once('error', () => resolveExit());
  });
  const record = { child, exit };
  children.push(record);
  return record;
}
async function ready(record, url) {
  await Promise.race([waitFor(url, 60_000), record.exit.then(() => { throw new Error(`Serveur arrêté avant disponibilité. Voir .runtime/verify-*.log.`); })]);
}
async function terminate(record) {
  if (!await terminateOwned(record.child.pid, !windows)) throw new Error('Arrêt du serveur de vérification non confirmé.');
  await record.exit;
}

try {
  let api = launch('api');
  const web = launch('web');
  await Promise.all([
    ready(api, `${env.API_INTERNAL_URL}/api/v1/system/health`),
    ready(web, `${env.APP_PUBLIC_ORIGIN}/fr`),
  ]);
  run(process.execPath, [join(root, 'scripts/smoke.mjs')], { env });
  await terminate(api);
  run(process.execPath, [join(root, 'scripts/smoke.mjs'), '--expect-api-unavailable'], { env });
  api = launch('api');
  await ready(api, `${env.API_INTERNAL_URL}/api/v1/system/health`);
  run(process.execPath, [join(root, 'scripts/smoke.mjs')], { env });
  console.log('OK chaîne HTTP réelle : état sain, arrêt API, erreur explicite et reprise.');
} finally {
  for (const record of children.toReversed()) await terminate(record);
}
