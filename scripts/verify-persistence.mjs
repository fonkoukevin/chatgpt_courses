import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { composeArgs, localEnvironment, run } from './lib/runtime.mjs';

const env = localEnvironment();
const prefix = composeArgs(env);
const token = randomUUID();
const table = `p01_probe_${token.replaceAll('-', '')}`;
function sql(statement) {
  return run('docker', [...prefix, 'exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB, '-At'],
  { env, input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }).stdout.trim();
}
// Table de preuve unique, sans modifier les migrations ni les tables applicatives.
sql(`CREATE TABLE public.${table} (value text NOT NULL); INSERT INTO public.${table} VALUES ('${token}');`);
try {
  run('docker', [...prefix, 'restart', 'postgres'], { env });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if (sql('SELECT 1;') === '1') { ready = true; break; } } catch { /* Restart in progress. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  assert.ok(ready, 'PostgreSQL non disponible après redémarrage.');
  assert.equal(sql(`SELECT value FROM public.${table};`), token);
  console.log('OK donnée de preuve conservée après redémarrage PostgreSQL ; aucun volume supprimé.');
} finally {
  sql(`DROP TABLE public.${table};`);
}
