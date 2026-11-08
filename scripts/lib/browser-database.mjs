import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Same resolved image as Compose/Testcontainers. A tmpfs overrides its data
// volume: this database never mounts or resets the user's local data.
const image = 'postgres:18.6@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42';
const ownershipLabel = 'com.chatgptcourses.browser-run';
function docker(args, options = {}) {
  const result = spawnSync('docker', args, { windowsHide: true, encoding: 'utf8', timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'], ...options });
  if (result.error || result.status !== 0) throw new Error('Opération Docker de recette refusée ou indisponible ; aucune base locale modifiée.');
  return result.stdout.trim();
}

export async function createBrowserDatabase(env, directory, runId, onCreate = () => {}) {
  const name = `courses-browser-${randomUUID()}`;
  const file = join(directory, 'test-database.env');
  const password = randomBytes(32).toString('hex');
  writeFileSync(file, `POSTGRES_DB=courses_browser\nPOSTGRES_USER=browser_test\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
  const database = { id: null, name, runId, image, stopped: false };
  // Register the unique name before Docker runs, so the supervisor can retry
  // cleanup even if creation succeeds but the CLI response is interrupted.
  onCreate(database);
  try {
    const id = docker(['run', '--rm', '--detach', '--name', name, '--label', `${ownershipLabel}=${runId}`,
      '--env-file', file, '--mount', 'type=tmpfs,destination=/var/lib/postgresql',
      '--publish', '127.0.0.1::5432', image]);
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Identité du conteneur de recette non confirmée.');
    database.id = id;
    const binding = docker(['port', id, '5432/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('PostgreSQL de recette doit rester en boucle locale.');
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = spawnSync('docker', ['exec', id, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'browser_test', '-d', 'courses_browser'],
        { windowsHide: true, stdio: 'ignore', timeout: 5000 });
      if (!result.error && result.status === 0) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!ready) throw new Error('PostgreSQL de recette ne devient pas sain.');
    Object.assign(env, { APP_ENV: 'test', SPRING_PROFILES_ACTIVE: 'test', POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: binding.split(':')[1], POSTGRES_DB: 'courses_browser', POSTGRES_USER: 'browser_test',
      POSTGRES_PASSWORD: password, MAIL_MODE: 'disabled', COMMERCE_ENABLED: 'false', STRIPE_ENABLED: 'false', STORAGE_ENABLED: 'false', VIDEO_ENABLED: 'false' });
    return database;
  } catch (error) {
    try { stopBrowserDatabase(database); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Création de la base échouée ; arrêt restant à confirmer par le superviseur.'); }
    throw error;
  }
}

export function stopBrowserDatabase(database) {
  if (!database || database.stopped) return;
  const matches = docker(['container', 'ls', '--all', '--no-trunc', '--filter',
    database.id ? `id=${database.id}` : `name=^/${database.name}$`, '--format', '{{.ID}}']);
  if (!matches) { database.stopped = true; return; }
  if (!/^[a-f0-9]{64}$/.test(matches) || (database.id && matches !== database.id)) throw new Error('Conteneur de recette non identifié pour son arrêt.');
  const owner = docker(['inspect', '--format', `{{ index .Config.Labels "${ownershipLabel}" }}`, matches]);
  if (owner !== database.runId) throw new Error('Arrêt refusé : propriété de la base de recette non confirmée.');
  docker(['stop', '--time', '10', matches]);
  database.stopped = true;
}
