import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { environment, root, run } from './lib/runtime.mjs';
import { createBrowserDatabase, stopBrowserDatabase } from './lib/browser-database.mjs';
import { isolatedEnvironment } from './ci-run.mjs';
import { writePublicJson } from './ci-sanitize.mjs';

const env = isolatedEnvironment(environment({ loadLocal: false })), runId = `ci-smoke-${randomUUID()}`;
const directory = join(root, '.runtime', runId); mkdirSync(directory, { recursive: true, mode: 0o700 });
let database, passed = false, cleanupConfirmed = false;
try {
  database = await createBrowserDatabase(env, directory, runId, record => { database = record; });
  run(process.execPath, [join(root, 'scripts/verify-http.mjs')], { env });
  passed = true;
} catch { passed = false;
} finally {
  try { if (database) stopBrowserDatabase(database); cleanupConfirmed = database?.stopped === true; }
  catch { cleanupConfirmed = false; }
  finally { writePublicJson(join(root, '.runtime/ci-public/e2e/http-probe.json'), { result: passed ? 'passed' : 'failed', cleanupConfirmed, realPostgreSQL: true, sharedDatabaseChanged: false }); }
}
if (!passed || !cleanupConfirmed) { console.error('CI_SMOKE_OR_CLEANUP_NOT_CONFIRMED'); process.exitCode = 1; }
