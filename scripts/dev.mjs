import { closeSync, existsSync, mkdirSync, openSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { composeArgs, localEnvironment, root, run, runtimeDir, start, terminateOwned, waitFor, windows } from './lib/runtime.mjs';

const env = localEnvironment();
const pidFile = join(runtimeDir, 'processes.json');
const stopRequest = join(runtimeDir, 'stop.requested');
if (existsSync(pidFile)) throw new Error('Session locale déjà enregistrée. Utiliser npm run stop avant de relancer.');
run('docker', [...composeArgs(env), 'up', '-d', '--wait'], { env });
mkdirSync(runtimeDir, { recursive: true });
const children = [];
const exits = [];
const save = () => writeFileSync(pidFile, JSON.stringify({ root, supervisor: process.pid,
  processGroups: !windows, children: children.map((child) => child.pid) }));
let cleaning;
let stopping = false;
const cleanup = () => cleaning ??= (async () => {
  stopping = true;
  const stopped = (await Promise.all(children.toReversed().map((child) => terminateOwned(child.pid, !windows)))).every(Boolean);
  if (stopped && existsSync(pidFile)) unlinkSync(pidFile);
  if (stopped && existsSync(stopRequest)) unlinkSync(stopRequest);
  return stopped;
})();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void cleanup().then((stopped) => process.exit(stopped ? 0 : 1)); });
try {
  for (const [script, log] of [['api.mjs', 'api.log'], ['web.mjs', 'web.log']]) {
    const handle = openSync(join(runtimeDir, log), 'a');
    const child = start(process.execPath, [join(root, 'scripts', script), script === 'api.mjs' ? 'run' : 'dev'],
      { env, detached: !windows, stdio: ['ignore', handle, handle] });
    closeSync(handle);
    children.push(child);
    exits.push(new Promise((resolveExit) => {
      child.once('exit', (code, signal) => resolveExit({ script, code, signal }));
      child.once('error', () => resolveExit({ script, code: 1, signal: null }));
    }));
    save();
    child.on('exit', (code) => {
      if (code && !stopping && !existsSync(stopRequest)) console.error(`${script} arrêté (code ${code}). Voir .runtime/${log}.`);
    });
  }
  const firstExit = Promise.race(exits);
  const unexpectedExit = (exit) => {
    throw new Error(`${exit.script} arrêté avant la fin de la session (code ${exit.code}, signal ${exit.signal}). Voir .runtime.`);
  };
  await Promise.race([
    Promise.all([waitFor(`${env.API_INTERNAL_URL}/api/v1/system/health`), waitFor(`${env.APP_PUBLIC_ORIGIN}/fr`)]),
    firstExit.then(unexpectedExit),
  ]);
  console.log(`Fondations locales disponibles : ${env.APP_PUBLIC_ORIGIN}/fr et /en`);
  console.log('Journaux locaux : .runtime/api.log et .runtime/web.log. Ctrl+C ou npm run stop pour arrêter.');
  const exit = await firstExit;
  if (!existsSync(stopRequest)) unexpectedExit(exit);
} finally {
  if (!await cleanup()) throw new Error('Arrêt non confirmé ; suivi des processus conservé dans .runtime.');
}
