import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { composeArgs, localEnvironment, root } from './lib/runtime.mjs';

// This command deliberately targets only the named local Compose database.
// Testcontainers loads the same fixture separately into its disposable database.
const env = localEnvironment();
if (!['localhost', '127.0.0.1'].includes(env.POSTGRES_HOST)) {
  throw new Error('Le chargement de démonstration est réservé à PostgreSQL local.');
}
const statement = (sql) => {
  const result = spawnSync('docker', [...composeArgs(env), 'exec', '-T', 'postgres',
  'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB, '-At'],
  { cwd: root, windowsHide: true, env, input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) {
    if (result.stderr?.includes('P03_DEMO_ID_COLLISION')) throw new Error('P03_DEMO_ID_COLLISION : les UUID réservés correspondent à d’autres données. Chargement annulé sans écrasement.');
    throw new Error('PostgreSQL local indisponible ou chargement refusé. Vérifier services:status et le schéma ; aucune réinitialisation automatique.');
  }
  return result.stdout.trim();
};

if (statement("SELECT to_regclass('public.flyway_schema_history') IS NOT NULL;\n") !== 't'
    || statement("SELECT EXISTS (SELECT 1 FROM public.flyway_schema_history WHERE version = '002' AND success);\n") !== 't') {
  throw new Error('Migration V002 requise : construire puis démarrer l’API avant le chargement.');
}
statement(readFileSync(join(root, 'apps/api/src/test/resources/devdata/p03-demo.sql'), 'utf8'));
console.log('Dossier pédagogique fictif chargé dans PostgreSQL local. Aucun compte, prix, offre active ou droit créé.');
console.log('Réexécutable sans écraser les contenus déjà présents ; aucun volume supprimé.');
