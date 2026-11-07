import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeArgs, localEnvironment, root, run, runtimeDir, terminateOwned } from './lib/runtime.mjs';

const pidFile = join(runtimeDir, 'processes.json');
if (existsSync(pidFile)) {
  const state = JSON.parse(readFileSync(pidFile, 'utf8'));
  if (state.root !== root) throw new Error('Le fichier de processus ne correspond pas à ce projet.');
  writeFileSync(join(runtimeDir, 'stop.requested'), 'local stop requested\n');
  const results = await Promise.all([...state.children].reverse().map((pid) => terminateOwned(pid, Boolean(state.processGroups))));
  if (results.some((stopped) => !stopped)) throw new Error('Arrêt non confirmé pour un processus ; fichier de suivi conservé.');
  for (let attempt = 0; attempt < 30; attempt++) {
    try { process.kill(state.supervisor, 0); } catch { break; }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  try {
    process.kill(state.supervisor, 0);
    if (!await terminateOwned(state.supervisor)) throw new Error('Arrêt du superviseur non confirmé.');
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
  if (existsSync(pidFile)) unlinkSync(pidFile);
  console.log('Processus du projet arrêtés.');
}
const env = localEnvironment();
run('docker', [...composeArgs(env), '--profile', 's3', 'stop'], { env });
console.log('Services arrêtés ; volumes conservés.');
