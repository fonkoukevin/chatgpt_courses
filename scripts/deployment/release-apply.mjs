import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MAX_BACKUP_RECEIPT_BYTES, requireRelease, parseManifest, validateBackupReceipt, validateSchemaFacts } from './release.mjs';
import { loadDeployment, validateDeployment } from './config.mjs';

// Runs only on the explicitly configured Linux host. It does not bootstrap a
// server, transfer secrets, alter the schema backwards, restore data or build.
function argumentsOf(values) {
  requireRelease(values.length === 5 && ['apply', 'activate'].includes(values[0]) && values[1] === '--root' && values[3] === '--release', 'RELEASE_REMOTE_ARGUMENTS_INVALID');
  requireRelease(/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/u.test(values[2]) && /^[a-f0-9]{64}$/u.test(values[4]), 'RELEASE_REMOTE_PATH_INVALID');
  return { action: values[0], directory: values[2], hash: values[4] };
}
function noLinks(path) {
  for (let current = resolve(path); current !== dirname(current); current = dirname(current)) if (existsSync(current)) requireRelease(!lstatSync(current).isSymbolicLink(), 'RELEASE_REMOTE_SYMLINK_REFUSED');
}
export function validateSharedIngressNetwork(facts) {
  requireRelease(facts?.name === 'courses-staging-ingress' && facts.internal === true && facts.driver === 'bridge', 'RELEASE_SHARED_INGRESS_NETWORK_INVALID');
}
export function deploymentComposeFiles(release, validated, request) {
  requireRelease(typeof request.stagingPaymentTest === 'boolean' && request.stagingPaymentTest === validated.stagingPaymentTest, 'RELEASE_PAYMENT_TEST_TARGET_MISMATCH');
  requireRelease(!request.stagingPaymentTest || validated.environment === 'staging' && validated.ingressMode === 'shared' && validated.stagingIntegrations === 'mailpit-s3', 'RELEASE_PAYMENT_TEST_STAGING_ONLY');
  return ['compose.deployment.yml', ...(validated.environment === 'staging' ? ['compose.staging.yml'] : []),
    ...(validated.ingressMode === 'shared' ? ['compose.shared-ingress.yml'] : []),
    ...(validated.stagingIntegrations === 'mailpit-s3' ? ['compose.staging-integrations.yml'] : []),
    ...(request.stagingPaymentTest ? ['compose.staging-payment-test.yml'] : [])].map(file => join(release, 'infra/compose', file));
}
function main() {
  requireRelease(process.platform === 'linux' && process.versions.node === '24.22.2', 'RELEASE_REMOTE_LINUX_NODE_24_22_2_REQUIRED');
  const args = argumentsOf(process.argv.slice(2)), release = join(args.directory, 'releases', args.hash);
  noLinks(release); requireRelease(realpathSync(dirname(fileURLToPath(import.meta.url))) === join(release, 'scripts/deployment'), 'RELEASE_REMOTE_LOCATION_INVALID');
  const request = JSON.parse(readFileSync(join(release, 'release-request.json'), 'utf8'));
  requireRelease(request.manifestSha256 === args.hash && ['deploy', 'rollback'].includes(request.operation) && ['staging', 'production'].includes(request.environment) && typeof request.stagingPaymentTest === 'boolean' && (!request.stagingPaymentTest || request.environment === 'staging'), 'RELEASE_REMOTE_REQUEST_INVALID');
  const manifest = parseManifest(readFileSync(join(release, 'release-manifest.json'), 'utf8'), request.imageRepository, args.hash);
  const project = `courses-${request.environment}`, config = join(args.directory, 'config/deployment.env'), images = join(release, 'release.env');
  noLinks(config); requireRelease(lstatSync(config).isFile() && (lstatSync(config).mode & 0o007) === 0, 'RELEASE_REMOTE_CONFIG_MUST_BE_PRIVATE');
  const privateDirectory = join(args.directory, 'private'); mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  const lockPath = join(privateDirectory, 'deployment.lock');
  if (args.action === 'apply') {
    let lock; try { lock = openSync(lockPath, 'wx', 0o600); } catch { requireRelease(false, 'RELEASE_REMOTE_LOCK_ALREADY_HELD'); }
    try { writeFileSync(lock, JSON.stringify({ manifestSha256: args.hash, environment: request.environment, startedAt: new Date().toISOString() }) + '\n'); } finally { closeSync(lock); }
  } else requireRelease(JSON.parse(readFileSync(lockPath, 'utf8')).manifestSha256 === args.hash, 'RELEASE_REMOTE_LOCK_MISMATCH');
  const handle = openSync(join(privateDirectory, `${args.hash}.log`), 'a', 0o600);
  const run = (executable, values, capture = false) => { const result = spawnSync(executable, values, { cwd: release, stdio: ['ignore', capture ? 'pipe' : handle, handle], encoding: capture ? 'utf8' : undefined, timeout: 600000, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|HOME|LANG|DOCKER_CONFIG)$/u.test(key))) }); requireRelease(!result.error && result.status === 0, 'RELEASE_REMOTE_COMMAND_FAILED'); return result; };
  const receiptPath = join(release, 'deployment-receipt.json');
  try {
    if (args.action === 'activate') {
      const previous = JSON.parse(readFileSync(receiptPath, 'utf8'));
      requireRelease(previous.result === 'awaiting-external-smoke' && previous.manifestSha256 === args.hash && previous.stagingPaymentTest === request.stagingPaymentTest, 'RELEASE_REMOTE_APPLY_MUST_SUCCEED_FIRST');
      const pointer = join(args.directory, 'current'), next = join(args.directory, `current-${args.hash}`);
      requireRelease(!existsSync(next) && (!existsSync(pointer) || lstatSync(pointer).isSymbolicLink()), 'RELEASE_ACTIVE_POINTER_REFUSED');
      symlinkSync(`releases/${args.hash}`, next); renameSync(next, pointer);
      writeFileSync(receiptPath, JSON.stringify({ ...previous, result: 'active', externalSmokeConfirmedByWorkflow: true, activatedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
      unlinkSync(lockPath);
      return;
    }
    writeFileSync(images, `WEB_IMAGE=${manifest.web.repository}@${manifest.web.digest}\nAPI_IMAGE=${manifest.api.repository}@${manifest.api.digest}\nAPP_ENV=${request.environment}\n`, { mode: 0o600 });
    const configuration = loadDeployment(config, images), validated = validateDeployment(configuration, { isolated: false, checkFiles: true });
    requireRelease(validated.environment === request.environment && validated.project === project && configuration.APP_PUBLIC_ORIGIN === request.expectedPublicOrigin, 'RELEASE_REMOTE_TARGET_CONFIG_MISMATCH');
    const sharedIngress = validated.ingressMode === 'shared';
    const stagingIntegrations = validated.stagingIntegrations === 'mailpit-s3';
    const compose = ['compose', '--project-name', project, '--env-file', config, '--env-file', images, ...deploymentComposeFiles(release, validated, request).flatMap(file => ['-f', file])];
    run('docker', [...compose, 'config', '--quiet']);
    if (sharedIngress) {
      const facts = run('docker', ['network', 'inspect', '--format', '{"name":{{json .Name}},"internal":{{json .Internal}},"driver":{{json .Driver}}}', validated.ingressNetwork], true).stdout;
      validateSharedIngressNetwork(JSON.parse(facts));
    }
    run('docker', [...compose, 'pull', '--quiet', ...(sharedIngress ? ['postgres', 'migrate', 'api', 'web', ...(stagingIntegrations ? ['mailpit', 's3'] : [])] : [])]);
    for (const kind of ['web', 'api']) {
      const reference = `${manifest[kind].repository}@${manifest[kind].digest}`;
      const revision = run('docker', ['image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', reference], true).stdout.trim();
      requireRelease(revision === manifest.sourceCommit, 'RELEASE_IMAGE_SOURCE_COMMIT_MISMATCH');
    }
    // The backup must have been taken while writers were stopped and kept
    // quiescent. Do not manufacture a receipt or silently stop/resume a live
    // target after an older backup was taken.
    for (const service of ['api', 'web']) {
      const active = run('docker', ['ps', '--filter', `label=com.docker.compose.project=${project}`, '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.ID}}'], true).stdout.trim();
      requireRelease(active === '', 'RELEASE_REQUIRES_APPLICATION_WRITERS_STOPPED');
    }
    // Only PostgreSQL starts before the single owner-role migration command.
    // The web/API are never started as dependencies of the migration.
    if (request.operation === 'deploy') run('docker', [...compose, 'up', '--no-build', '-d', '--wait', '--wait-timeout', '180', 'postgres']);
    const scalar = statement => {
      const value = run('docker', [...compose, 'exec', '-T', 'postgres', 'sh', '-c', 'export PGPASSWORD="$(cat /run/secrets/POSTGRES_MIGRATION_PASSWORD)"; exec psql -X -q -At -v ON_ERROR_STOP=1 -U courses_owner -d "$POSTGRES_DB" -c "$1"', 'release-schema', statement], true).stdout.trim();
      requireRelease(/^[0-9]{1,8}$/u.test(value), 'RELEASE_DATABASE_SCALAR_INVALID'); return Number(value);
    };
    const historyPresent = scalar("SELECT CASE WHEN to_regclass('public.flyway_schema_history') IS NULL THEN 0 ELSE 1 END;") === 1;
    const facts = { historyPresent, version: historyPresent ? scalar("SELECT coalesce(max(version::integer),0) FROM public.flyway_schema_history WHERE success AND version ~ '^[0-9]{1,3}$';") : 0,
      failed: historyPresent ? scalar("SELECT count(*) FROM public.flyway_schema_history WHERE NOT success OR (version IS NOT NULL AND version !~ '^[0-9]{1,3}$');") : 0,
      userTables: scalar("SELECT count(*) FROM pg_tables WHERE schemaname <> 'information_schema' AND schemaname !~ '^pg_';") };
    validateSchemaFacts(facts, manifest, request);
    if (request.operation === 'deploy' && !request.firstInstallEmptyDatabase) {
      requireRelease(/^[a-f0-9]{64}$/u.test(request.migrationBackupReceiptSha256 ?? ''), 'RELEASE_BACKUP_REFERENCE_REQUIRED');
      const backupPath = join(args.directory, 'backups', request.migrationBackupReceiptSha256, 'receipt.json');
      noLinks(backupPath); const stat = lstatSync(backupPath);
      requireRelease(stat.isFile() && stat.size <= MAX_BACKUP_RECEIPT_BYTES && (stat.mode & 0o007) === 0, 'RELEASE_PRIVATE_BACKUP_RECEIPT_REQUIRED');
      validateBackupReceipt(readFileSync(backupPath), request.migrationBackupReceiptSha256, { project, environment: request.environment, database: configuration.POSTGRES_DB });
    }
    if (request.operation === 'deploy') run('docker', [...compose, 'run', '--rm', '--no-deps', 'migrate']);
    if (stagingIntegrations) {
      run('docker', [...compose, 'up', '--no-build', '--no-deps', '-d', '--wait', '--wait-timeout', '180', 'mailpit', 's3']);
      run('docker', [...compose, 'run', '--rm', '--no-deps', 'api', 'storage-bootstrap']);
    }
    run('docker', [...compose, 'up', '--no-build', '--no-deps', '-d', '--wait', '--wait-timeout', '180', 'api', 'web', ...(sharedIngress ? [] : ['caddy'])]);
    writeFileSync(receiptPath, JSON.stringify({ result: 'awaiting-external-smoke', manifestSha256: args.hash, sourceCommit: manifest.sourceCommit, environment: request.environment, operation: request.operation, completedAt: new Date().toISOString(), imageBuildInvoked: false, migrationInvoked: request.operation === 'deploy', observedSchemaVersionBefore: facts.version, firstInstallEmptyDatabaseObserved: request.firstInstallEmptyDatabase === true, rollbackSchemaReviewRequired: request.operation === 'rollback', backupReceiptSha256: request.migrationBackupReceiptSha256, offHostBackupIsOperatorAttestation: request.offHostBackupAttested === true, dataRestored: false, ingressMode: validated.ingressMode, ingressNetwork: validated.ingressNetwork, sharedIngressNetworkValidated: sharedIngress, dedicatedCaddyRequested: !sharedIngress, stagingIntegrations: validated.stagingIntegrations, stagingPaymentTest: validated.stagingPaymentTest }) + '\n', { mode: 0o600 });
  } finally { closeSync(handle); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); console.log(JSON.stringify({ result: 'passed', secretsPrinted: false })); }
  catch (error) { console.error(/^[A-Z_]{1,80}$/u.test(error.code ?? '') ? error.code : 'RELEASE_REMOTE_NOT_VALIDATED'); process.exitCode = 1; }
}
