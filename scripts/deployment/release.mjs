import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shaPattern = /^[a-f0-9]{64}$/u, commitPattern = /^[a-f0-9]{40}$/u;
const bundleFiles = ['infra/compose/compose.deployment.yml', 'infra/compose/compose.staging.yml', 'infra/caddy/Caddyfile', 'infra/caddy/routes.caddy', 'infra/postgres/init-roles.sh', 'scripts/deployment/config.mjs', 'scripts/deployment/release.mjs', 'scripts/deployment/release-apply.mjs'];
export function requireRelease(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).toSorted().join(',') === keys.toSorted().join(',');
export function repository(value) {
  const match = typeof value === 'string' && value.match(/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([1-9][0-9]{0,4}))?\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/u);
  requireRelease(match && value.length <= 200 && !value.includes('..') && (match[1].includes('.') || match[1] === 'localhost' || match[2]) && (!match[2] || Number(match[2]) <= 65535), 'RELEASE_REPOSITORY_REQUIRED');
  return value;
}
export function validateManifest(value, imageRepository) {
  const prefix = repository(imageRepository);
  requireRelease(exact(value, ['schemaVersion', 'sourceCommit', 'web', 'api', 'schema']) && value.schemaVersion === 1 && commitPattern.test(value.sourceCommit) && exact(value.schema, ['min', 'max']) && value.schema.min === 19 && value.schema.max === 19, 'RELEASE_MANIFEST_INVALID');
  for (const kind of ['web', 'api']) requireRelease(exact(value[kind], ['repository', 'digest']) && value[kind].repository === `${prefix}/${kind}` && /^sha256:[a-f0-9]{64}$/u.test(value[kind].digest), 'RELEASE_IMAGE_DIGEST_REQUIRED');
  return { schemaVersion: 1, sourceCommit: value.sourceCommit, web: { repository: value.web.repository, digest: value.web.digest }, api: { repository: value.api.repository, digest: value.api.digest }, schema: { min: value.schema.min, max: value.schema.max } };
}
export const manifestBytes = manifest => Buffer.from(JSON.stringify(manifest) + '\n');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseManifest(text, imageRepository, expectedHash) {
  requireRelease(typeof text === 'string' && Buffer.byteLength(text, 'utf8') <= 4096 && shaPattern.test(expectedHash ?? ''), 'RELEASE_MANIFEST_AND_HASH_REQUIRED');
  const value = validateManifest(JSON.parse(text), imageRepository);
  requireRelease(text.trim() === JSON.stringify(value), 'RELEASE_CANONICAL_MANIFEST_REQUIRED');
  requireRelease(sha256(manifestBytes(value)) === expectedHash, 'RELEASE_MANIFEST_HASH_MISMATCH');
  return value;
}
export function protectedEnvironment(value) {
  const reviewers = value?.protection_rules?.find(rule => rule.type === 'required_reviewers');
  requireRelease(reviewers && reviewers.prevent_self_review === true && Array.isArray(reviewers.reviewers) && reviewers.reviewers.length > 0 && value.can_admins_bypass === false && (value.deployment_branch_policy?.protected_branches === true || value.deployment_branch_policy?.custom_branch_policies === true), 'RELEASE_PROTECTED_ENVIRONMENT_REQUIRED');
}
export function validateBackupReceipt(bytes, expectedHash, target) {
  requireRelease(Buffer.isBuffer(bytes) && bytes.length <= 65536 && shaPattern.test(expectedHash ?? '') && sha256(bytes) === expectedHash, 'RELEASE_BACKUP_RECEIPT_HASH_MISMATCH');
  const receipt = JSON.parse(bytes.toString('utf8'));
  requireRelease(receipt.result === 'passed' && receipt.authenticatedEncryption === true && receipt.project === target.project && receipt.environment === target.environment && receipt.database === target.database, 'RELEASE_BACKUP_RECEIPT_TARGET_MISMATCH');
}
export function validateSchemaFacts(facts, manifest, request) {
  requireRelease(typeof facts.historyPresent === 'boolean' && [facts.version, facts.failed, facts.userTables].every(value => Number.isSafeInteger(value) && value >= 0) && facts.failed === 0 && facts.version <= manifest.schema.max, 'RELEASE_DATABASE_SCHEMA_NOT_COMPATIBLE');
  if (request.operation === 'rollback') requireRelease(facts.historyPresent && facts.version >= manifest.schema.min && request.rollbackSchemaReviewed === true && request.currentSchemaVersion === facts.version && request.firstInstallEmptyDatabase !== true, 'RELEASE_ROLLBACK_SCHEMA_REVIEW_REQUIRED');
  else if (request.firstInstallEmptyDatabase) requireRelease(!facts.historyPresent && facts.version === 0 && facts.userTables === 0, 'RELEASE_FIRST_INSTALL_REQUIRES_EMPTY_DATABASE');
  else requireRelease(facts.historyPresent && facts.version > 0 && request.offHostBackupAttested === true, 'RELEASE_EXISTING_DATABASE_BACKUP_REQUIRED');
}
export function targetConfiguration(env) {
  requireRelease(['staging', 'production'].includes(env.TARGET_ENVIRONMENT) && env.DEPLOY_TARGET_AUTHORIZED === 'true', 'RELEASE_AUTHORIZED_TARGET_REQUIRED');
  requireRelease(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/u.test(env.DEPLOY_HOST ?? '') && !env.DEPLOY_HOST.endsWith('.invalid') && !env.DEPLOY_HOST.includes('..') && /^[a-z_][a-z0-9_-]{0,31}$/u.test(env.DEPLOY_USER ?? ''), 'RELEASE_SSH_TARGET_INVALID');
  requireRelease(/^[1-9][0-9]{0,4}$/u.test(env.DEPLOY_PORT ?? '') && Number(env.DEPLOY_PORT) <= 65535, 'RELEASE_SSH_PORT_INVALID');
  requireRelease(/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/u.test(env.DEPLOY_DIRECTORY ?? '') && !['/tmp/releases', '/var/tmp'].includes(env.DEPLOY_DIRECTORY), 'RELEASE_TARGET_DIRECTORY_INVALID');
  let origin; try { origin = new URL(env.DEPLOY_PUBLIC_ORIGIN); } catch { requireRelease(false, 'RELEASE_HTTPS_ORIGIN_REQUIRED'); }
  requireRelease(origin.protocol === 'https:' && origin.origin === env.DEPLOY_PUBLIC_ORIGIN && !origin.username && !origin.password && !origin.hostname.endsWith('.invalid'), 'RELEASE_HTTPS_ORIGIN_REQUIRED');
  return { environment: env.TARGET_ENVIRONMENT, host: env.DEPLOY_HOST, user: env.DEPLOY_USER, port: env.DEPLOY_PORT, directory: env.DEPLOY_DIRECTORY };
}
function childEnvironment(extra = {}) { return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USERPROFILE|SystemRoot|TEMP|TMP|LANG|JAVA_HOME)$/u.test(key))), ...extra }; }
function execute(file, args, options = {}) {
  const directory = join(root, '.runtime/deployment/private'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const handle = openSync(join(directory, 'commands.log'), 'a', 0o600);
  try { const result = spawnSync(file, args, { cwd: root, env: childEnvironment(), timeout: 1200000, stdio: ['pipe', handle, handle], windowsHide: true, ...options }); requireRelease(!result.error && result.status === 0, 'RELEASE_COMMAND_FAILED'); return result; }
  finally { closeSync(handle); }
}
function publicReceipt(name, value) { const directory = join(root, '.runtime/deployment/public'); mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, name), name === 'release-manifest.json' ? manifestBytes(value) : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
async function github(path) {
  requireRelease(process.env.GITHUB_API_URL === 'https://api.github.com' && process.env.GITHUB_SERVER_URL === 'https://github.com' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(process.env.GITHUB_REPOSITORY ?? '') && process.env.GITHUB_TOKEN, 'RELEASE_GITHUB_CONTEXT_REQUIRED');
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2026-03-10' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  requireRelease(response.ok, 'RELEASE_GITHUB_GUARD_UNAVAILABLE');
  const bytes = await response.text(); requireRelease(Buffer.byteLength(bytes) <= 1024 * 1024, 'RELEASE_GITHUB_RESPONSE_TOO_LARGE'); return JSON.parse(bytes);
}
async function guard() {
  const env = process.env, event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  requireRelease(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event.repository?.fork === false && event.repository.full_name === env.GITHUB_REPOSITORY && env.GITHUB_REF === `refs/heads/${event.repository.default_branch}` && commitPattern.test(env.GITHUB_SHA ?? ''), 'RELEASE_DEFAULT_BRANCH_ONLY');
  requireRelease(['plan', 'publish', 'deploy', 'rollback'].includes(env.RELEASE_OPERATION) && ['staging', 'production'].includes(env.TARGET_ENVIRONMENT), 'RELEASE_OPERATION_INVALID');
  protectedEnvironment(await github(`environments/${env.TARGET_ENVIRONMENT}`));
  const imageRepository = repository(env.IMAGE_REPOSITORY);
  if (env.RELEASE_OPERATION === 'publish') requireRelease(env.TARGET_ENVIRONMENT === 'staging', 'RELEASE_PUBLISH_IN_STAGING_ONLY');
  let manifest;
  if (['deploy', 'rollback'].includes(env.RELEASE_OPERATION)) {
    manifest = parseManifest(env.RELEASE_MANIFEST_JSON, imageRepository, env.EXPECTED_RELEASE_SHA256);
    execute('git', ['merge-base', '--is-ancestor', manifest.sourceCommit, env.GITHUB_SHA]);
    targetConfiguration(env);
    if (env.TARGET_ENVIRONMENT === 'production') requireRelease(env.APPROVED_STAGING_RELEASE_SHA256 === env.EXPECTED_RELEASE_SHA256, 'RELEASE_SAME_STAGING_DIGESTS_REQUIRED');
    if (env.RELEASE_OPERATION === 'rollback') requireRelease(env.ROLLBACK_SCHEMA_REVIEWED === 'true' && /^[1-9][0-9]{0,2}$/u.test(env.CURRENT_SCHEMA_VERSION ?? '') && Number(env.CURRENT_SCHEMA_VERSION) >= manifest.schema.min && Number(env.CURRENT_SCHEMA_VERSION) <= manifest.schema.max, 'RELEASE_ROLLBACK_SCHEMA_REVIEW_REQUIRED');
    else requireRelease(env.FIRST_INSTALL_EMPTY_DATABASE === 'true' || shaPattern.test(env.MIGRATION_BACKUP_RECEIPT_SHA256 ?? '') && env.OFF_HOST_BACKUP_ATTESTED === 'true', 'RELEASE_MIGRATION_BACKUP_REFERENCE_REQUIRED');
    publicReceipt('release-manifest.json', manifest);
  }
  const source = manifest?.sourceCommit ?? env.GITHUB_SHA;
  if (env.RELEASE_OPERATION !== 'plan') {
    const runs = await github(`actions/workflows/ci.yml/runs?head_sha=${source}&status=success&per_page=100`);
    requireRelease(runs.workflow_runs?.some(run => run.head_sha === source && run.head_branch === event.repository.default_branch && run.head_repository?.full_name === env.GITHUB_REPOSITORY && run.event === 'push' && run.conclusion === 'success'), 'RELEASE_SUCCESSFUL_CI_REQUIRED');
  }
  publicReceipt('guard.json', { result: 'passed', operation: env.RELEASE_OPERATION, environment: env.TARGET_ENVIRONMENT, sourceCommit: source, protectedEnvironmentChecked: true, defaultBranchOnly: true, registryOrTargetMutationExecuted: false });
}
async function publish() {
  await guard(); const env = process.env;
  requireRelease(env.RELEASE_OPERATION === 'publish' && env.REGISTRY_USERNAME && env.REGISTRY_TOKEN && /^\d+$/u.test(env.GITHUB_RUN_ID ?? '') && /^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'RELEASE_PUBLICATION_CONFIGURATION_REQUIRED');
  const imageRepository = repository(env.IMAGE_REPOSITORY), registry = imageRepository.split('/')[0];
  const dockerConfig = mkdtempSync(join(tmpdir(), 'courses-release-registry-'));
  const dockerEnv = childEnvironment({ DOCKER_CONFIG: dockerConfig });
  try {
    execute('docker', ['login', registry, '--username', env.REGISTRY_USERNAME, '--password-stdin'], { env: dockerEnv, input: env.REGISTRY_TOKEN });
    execute(process.execPath, [join(root, 'scripts/deployment/images.mjs'), 'build', '--commit', env.GITHUB_SHA, '--output', join(root, '.runtime/deployment/build.json')], { env: dockerEnv });
    const manifest = { schemaVersion: 1, sourceCommit: env.GITHUB_SHA, web: null, api: null, schema: { min: 19, max: 19 } };
    for (const kind of ['web', 'api']) {
      const tag = `${imageRepository}/${kind}:sha-${env.GITHUB_SHA}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
      execute('docker', ['image', 'tag', `courses-${kind}:${env.GITHUB_SHA}`, tag], { env: dockerEnv });
      execute('docker', ['image', 'push', tag], { env: dockerEnv });
      const inspect = execute('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', tag], { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
      const matches = JSON.parse(inspect.stdout).filter(value => value.startsWith(`${imageRepository}/${kind}@sha256:`));
      requireRelease(matches.length === 1, 'RELEASE_PUSHED_DIGEST_NOT_CONFIRMED');
      manifest[kind] = { repository: `${imageRepository}/${kind}`, digest: matches[0].split('@')[1] };
    }
    const canonical = validateManifest(manifest, imageRepository), manifestSha256 = sha256(manifestBytes(canonical));
    publicReceipt('release-manifest.json', canonical);
    publicReceipt('publication.json', { result: 'passed', sourceCommit: env.GITHUB_SHA, manifestSha256, registryPublicationExecuted: true, deployed: false, tagsInformationalOnly: true });
    console.log(JSON.stringify({ result: 'published', manifestSha256 }));
  } finally { requireRelease(dockerConfig.startsWith(join(tmpdir(), 'courses-release-registry-')), 'RELEASE_CREDENTIAL_CLEANUP_REFUSED'); rmSync(dockerConfig, { recursive: true, force: true }); }
}
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
async function deploy() {
  await guard(); const env = process.env, target = targetConfiguration(env), manifest = parseManifest(env.RELEASE_MANIFEST_JSON, env.IMAGE_REPOSITORY, env.EXPECTED_RELEASE_SHA256);
  requireRelease(['deploy', 'rollback'].includes(env.RELEASE_OPERATION) && /^-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----\r?\n/u.test(env.DEPLOY_SSH_PRIVATE_KEY ?? '') && typeof env.DEPLOY_SSH_KNOWN_HOSTS === 'string' && env.DEPLOY_SSH_KNOWN_HOSTS.trim().length > 40, 'RELEASE_SSH_SECRETS_REQUIRED');
  const work = mkdtempSync(join(tmpdir(), 'courses-release-target-')), bundle = join(work, 'bundle'); mkdirSync(bundle);
  const key = join(work, 'key'), known = join(work, 'known_hosts'); writeFileSync(key, env.DEPLOY_SSH_PRIVATE_KEY, { mode: 0o600 }); writeFileSync(known, env.DEPLOY_SSH_KNOWN_HOSTS, { mode: 0o600 });
  const options = ['-i', key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ForwardAgent=no', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${known}`, '-o', 'ConnectTimeout=15'];
  const host = `${target.user}@${target.host}`, releaseHash = env.EXPECTED_RELEASE_SHA256;
  const ssh = script => execute('ssh', [...options, '-p', target.port, host, 'sh -s'], { input: script });
  try {
    for (const path of bundleFiles) {
      const type = execute('git', ['ls-tree', manifest.sourceCommit, '--', path], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }).stdout;
      requireRelease(/^100(?:644|755) blob /u.test(type), 'RELEASE_SOURCE_FILE_NOT_REGULAR');
      const bytes = execute('git', ['show', `${manifest.sourceCommit}:${path}`], { stdio: ['pipe', 'pipe', 'pipe'] }).stdout;
      mkdirSync(dirname(join(bundle, path)), { recursive: true }); writeFileSync(join(bundle, path), bytes, { mode: 0o644 });
    }
    writeFileSync(join(bundle, 'release-manifest.json'), manifestBytes(manifest), { mode: 0o644 });
    const request = { operation: env.RELEASE_OPERATION, environment: target.environment, imageRepository: env.IMAGE_REPOSITORY, manifestSha256: releaseHash, expectedPublicOrigin: env.DEPLOY_PUBLIC_ORIGIN, currentSchemaVersion: env.CURRENT_SCHEMA_VERSION ? Number(env.CURRENT_SCHEMA_VERSION) : null, rollbackSchemaReviewed: env.ROLLBACK_SCHEMA_REVIEWED === 'true', firstInstallEmptyDatabase: env.FIRST_INSTALL_EMPTY_DATABASE === 'true', offHostBackupAttested: env.OFF_HOST_BACKUP_ATTESTED === 'true', migrationBackupReceiptSha256: env.MIGRATION_BACKUP_RECEIPT_SHA256 || null };
    writeFileSync(join(bundle, 'release-request.json'), JSON.stringify(request) + '\n', { mode: 0o644 });
    const archive = join(work, 'release.tar'); execute('tar', ['-C', bundle, '-cf', archive, '--', ...bundleFiles, 'release-manifest.json', 'release-request.json']);
    const bundleHash = sha256(readFileSync(archive)), upload = `${target.directory}/incoming/${releaseHash}-${env.GITHUB_RUN_ID}.tar`;
    ssh(`set -eu\numask 077\ntest -d ${quote(target.directory)}\ntest ! -L ${quote(target.directory)}\ntest "$(realpath ${quote(target.directory)})" = ${quote(target.directory)}\ntest ! -L ${quote(target.directory + '/incoming')}\nmkdir -p ${quote(target.directory + '/incoming')}\n`);
    execute('scp', [...options, '-P', target.port, archive, `${host}:${upload}`]);
    const releaseDirectory = `${target.directory}/releases/${releaseHash}`;
    ssh(`set -eu\numask 022\ntest "$(sha256sum ${quote(upload)} | cut -d ' ' -f 1)" = ${quote(bundleHash)}\ntest ! -L ${quote(target.directory + '/releases')}\ntest ! -L ${quote(releaseDirectory)}\nmkdir -p ${quote(releaseDirectory)}\ntest "$(realpath ${quote(releaseDirectory)})" = ${quote(releaseDirectory)}\ntest -z "$(find ${quote(releaseDirectory)} -type l -print -quit)"\ntar -xf ${quote(upload)} -C ${quote(releaseDirectory)}\nnode ${quote(releaseDirectory + '/scripts/deployment/release-apply.mjs')} apply --root ${quote(target.directory)} --release ${quote(releaseHash)}\nrm -f ${quote(upload)}\n`);
    execute(process.execPath, [join(root, 'scripts/deployment/smoke.mjs'), '--origin', env.DEPLOY_PUBLIC_ORIGIN], { env: childEnvironment({ STAGING_BASIC_USERNAME: env.STAGING_BASIC_USERNAME ?? '', STAGING_BASIC_PASSWORD: env.STAGING_BASIC_PASSWORD ?? '' }) });
    ssh(`set -eu\nnode ${quote(releaseDirectory + '/scripts/deployment/release-apply.mjs')} activate --root ${quote(target.directory)} --release ${quote(releaseHash)}\n`);
    publicReceipt('deployment.json', { result: 'passed', environment: target.environment, operation: env.RELEASE_OPERATION, sourceCommit: manifest.sourceCommit, manifestSha256: releaseHash, bundleSha256: bundleHash, migrationInvoked: env.RELEASE_OPERATION === 'deploy', imageBuildInvoked: false, healthSmokePassed: true, activePointerUpdated: true, dataRestoreInvoked: false });
    console.log(JSON.stringify({ result: 'deployed', environment: target.environment, manifestSha256: releaseHash }));
  } finally { requireRelease(work.startsWith(join(tmpdir(), 'courses-release-target-')), 'RELEASE_PRIVATE_CLEANUP_REFUSED'); rmSync(work, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const action = process.argv[2]; if (action === 'guard') await guard(); else if (action === 'publish') await publish(); else if (action === 'deploy') await deploy(); else throw new Error('RELEASE_ACTION_REQUIRED'); }
  catch (error) { const code = /^[A-Z_]{1,80}$/u.test(error.code ?? '') ? error.code : 'RELEASE_NOT_VALIDATED'; publicReceipt('failure.json', { result: 'failed', code, automaticRollback: false }); console.error(code); process.exitCode = 1; }
}
