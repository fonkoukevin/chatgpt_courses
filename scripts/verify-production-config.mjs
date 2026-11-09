import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { environment, root, runtimeDir, start, terminateOwned, windows } from './lib/runtime.mjs';
import { createBrowserDatabase, stopBrowserDatabase } from './lib/browser-database.mjs';

// Production configuration on owned loopback processes and a fresh tmpfs database.
// This does not deploy a site, establish TLS, import content or contact a provider.
const env = environment({ loadLocal: false });
for (const key of Object.keys(env)) if (/^(STRIPE_|S3_|MAIL_|POSTGRES_|VIDEO_|NOTIFICATION_)/u.test(key)) delete env[key];
const sourceJar = join(root, 'apps/api/target/chatgpt-courses-api.jar');
if (!existsSync(sourceJar) || !existsSync(join(root, 'apps/web/.next/BUILD_ID'))) throw new Error('Both production builds are required.');
const runId = `production-config-${randomUUID()}`, directory = join(runtimeDir, runId);
mkdirSync(directory, { recursive: true });
const jar = join(directory, 'api.jar'); copyFileSync(sourceJar, jar);
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = { runId, startedAt: new Date().toISOString(), environment: 'production', isolatedLoopbackOnly: true,
  publicOriginIsSyntheticHttps: true, tlsDeploymentClaimed: false, jarSha256: digest(jar),
  webBuildId: readFileSync(join(root, 'apps/web/.next/BUILD_ID'), 'utf8').trim(), checks: [], result: 'running', cleanupConfirmed: false, secretsPrinted: false };
const children = []; let database, failure, interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; });
const requireCheck = (name, passed, observed) => { report.checks.push({ name, passed: Boolean(passed), ...(observed === undefined ? {} : { observed }) }); if (!passed) throw new Error('PRODUCTION_CONFIG_CHECK_FAILED'); };
function launch(name, executable, args, cwd = root, childEnv = env) {
  const handle = openSync(join(directory, name + '.log'), 'a');
  const child = start(executable, args, { cwd, env: childEnv, detached: !windows, stdio: ['ignore', handle, handle] }); closeSync(handle);
  const record = { name, child, exited: false, exit: null };
  record.exit = new Promise(resolve => { child.once('exit', (code, signal) => { record.exited = true; resolve({ code, signal }); }); child.once('error', () => { record.exited = true; resolve({ code: null }); }); });
  children.push(record); return record;
}
async function availablePort() {
  const server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); return port;
}
async function ready(record, url) {
  const until = Date.now() + 180000;
  while (!record.exited && !interrupted && Date.now() < until) {
    try { const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) }); await response.body?.cancel(); if (response.ok) return; } catch { /* bounded readiness polling only */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('OWNED_PRODUCTION_PROCESS_NOT_READY');
}
async function request(origin, path) { return fetch(origin + path, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) }); }
try {
  database = await createBrowserDatabase(env, directory, runId, value => { database = value; });
  const webPort = await availablePort(); let apiPort = await availablePort(); while (apiPort === webPort) apiPort = await availablePort();
  const origin = `http://127.0.0.1:${webPort}`, apiOrigin = `http://127.0.0.1:${apiPort}`;
  Object.assign(env, { APP_ENV: 'production', SPRING_PROFILES_ACTIVE: 'production', NODE_ENV: 'production',
    APP_PUBLIC_ORIGIN: 'https://courses-production.invalid', APP_DEFAULT_LOCALE: 'fr', APP_PUBLISHED_LOCALES: '',
    API_INTERNAL_URL: apiOrigin, API_PORT: String(apiPort), API_TIMEOUT_MS: '10000', SESSION_COOKIE_SECURE: 'true',
    COMMERCE_ENABLED: 'false', COMMERCE_ALLOWED_CURRENCIES: '', STRIPE_ENABLED: 'false', STORAGE_ENABLED: 'false', VIDEO_ENABLED: 'false',
    MAIL_MODE: 'disabled', NOTIFICATION_OUTBOX_KEY: randomBytes(32).toString('base64'), NOTIFICATION_OUTBOX_ENABLED: 'false',
    PAYMENT_INBOX_ENABLED: 'false', REFUND_WORKER_ENABLED: 'false', ASSET_STAGING_CLEANUP_WORKER_ENABLED: 'false' });
  const java = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java';
  const api = launch('api', java, ['-jar', jar, '--debug=false']);
  const webEnv = { ...env }; for (const key of Object.keys(webEnv)) if (/^(STRIPE_|S3_|MAIL_|POSTGRES_|NOTIFICATION_|PAYMENT_|REFUND_|ASSET_)/u.test(key)) delete webEnv[key];
  const web = launch('web', process.execPath, [join(root, 'scripts/lib/browser-web-process.mjs'), String(webPort)], root, webEnv);
  await Promise.all([ready(api, apiOrigin + '/api/v1/system/health'), ready(web, origin + '/fr')]);
  const health = await request(origin, '/api/v1/system/health');
  const healthBody = await health.json();
  requireCheck('real-Spring-PostgreSQL-health-through-Next', health.status === 200 && healthBody.status === 'UP' && Object.keys(healthBody).length === 1);
  for (const path of ['/fr', '/en']) { const response = await request(origin, path); const text = await response.text(); requireCheck('public-page-' + path, response.status === 200 && /ChatGPT Courses/u.test(text), response.status); }
  for (const path of ['/fr/dev/public', '/fr/dev/foundations', '/en/dev/public']) { const response = await request(origin, path); await response.body?.cancel(); requireCheck('fixture-route-closed-' + path, response.status === 404, response.status); }
  const me = await request(origin, '/api/v1/auth/me'); await me.body?.cancel();
  requireCheck('private-API-requires-authentication', me.status === 401 && /no-store/u.test(me.headers.get('Cache-Control') ?? ''), me.status);
  const csrf = await request(origin, '/api/v1/auth/csrf'); const cookie = csrf.headers.get('set-cookie') ?? ''; await csrf.body?.cancel();
  requireCheck('production-session-cookie-flags', csrf.status === 200 && /(?:^|;)\s*Secure(?:;|$)/iu.test(cookie) && /HttpOnly/iu.test(cookie) && /SameSite=Lax/iu.test(cookie) && /Path=\//u.test(cookie));
  const statement = "SELECT json_build_object('users',(SELECT count(*) FROM user_accounts),'resources',(SELECT count(*) FROM learning_resources),'offers',(SELECT count(*) FROM offers),'orders',(SELECT count(*) FROM orders),'grants',(SELECT count(*) FROM access_grants),'migrations',(SELECT count(*) FROM flyway_schema_history WHERE success AND type='SQL'))::text;";
  const queried = spawnSync('docker', ['exec', '-i', database.id, 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB], { env, windowsHide: true, encoding: 'utf8', input: statement, timeout: 15000 });
  requireCheck('isolated-production-database-readable', queried.status === 0);
  const counts = JSON.parse(queried.stdout.trim());
  requireCheck('no-demo-account-content-offer-order-or-grant', ['users', 'resources', 'offers', 'orders', 'grants'].every(key => counts[key] === 0), counts);
  requireCheck('Next-started-without-database-mail-storage-or-payment-secrets', !Object.keys(webEnv).some(key => /^(STRIPE_|S3_|MAIL_|POSTGRES_|NOTIFICATION_)/u.test(key)));
  requireCheck('all-Flyway-migrations-applied', counts.migrations === 19, counts.migrations);
  if (interrupted) throw new Error('PRODUCTION_CONFIG_INTERRUPTED');
  report.result = 'passed';
} catch (error) { failure = error; report.result = 'failed'; report.errorCode = 'PRODUCTION_CONFIG_NOT_VALIDATED'; }
finally {
  const cleanup = [];
  for (const record of children.reverse()) { try {
    // An exited supervisor does not prove its child process group is gone.
    // Keep the ownership guard even after the leader's exit was observed.
    const stopped = Number.isInteger(record.child.pid) ? await terminateOwned(record.child.pid, !windows) : record.exited;
    if (stopped) await record.exit; cleanup.push({ name: record.name, stopped });
  } catch { cleanup.push({ name: record.name, stopped: false }); } }
  try { if (database) stopBrowserDatabase(database); } catch { cleanup.push({ name: 'postgres', stopped: false }); }
  report.processes = cleanup; report.databaseStopped = Boolean(database?.stopped); report.cleanupConfirmed = cleanup.every(item => item.stopped) && report.databaseStopped;
  report.completedAt = new Date().toISOString(); report.providerContacted = false; report.seedInvoked = false; report.sharedVolumeChanged = false;
  writeFileSync(join(root, 'docs/evidence/P19-production-config-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, cleanupConfirmed: report.cleanupConfirmed, secretsPrinted: false }));
  if (failure || !report.cleanupConfirmed) process.exitCode = 1;
}
