import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { safeReleaseFailure, inspectRegistryReadOnly, readImageBuildDiagnostic } from './release-diagnostics.mjs';
import { cleanupApprovedTestPackage } from './approved-test-cleanup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shaPattern = /^[a-f0-9]{64}$/u, commitPattern = /^[a-f0-9]{40}$/u;
// The backup bundle may describe 100,000 encrypted objects plus its three
// fixed files. Its pretty-printed receipt can exceed the 16 MiB inventory.
export const MAX_BACKUP_RECEIPT_BYTES = 32 * 1024 * 1024;
const bundleFiles = ['infra/compose/compose.deployment.yml', 'infra/compose/compose.staging.yml', 'infra/compose/compose.shared-ingress.yml', 'infra/compose/compose.staging-integrations.yml', 'infra/compose/compose.staging-payment-test.yml', 'infra/caddy/Caddyfile', 'infra/caddy/routes.caddy', 'infra/postgres/init-roles.sh', 'scripts/deployment/config.mjs', 'scripts/deployment/release.mjs', 'scripts/deployment/release-apply.mjs', 'scripts/deployment/release-diagnostics.mjs', 'scripts/deployment/approved-test-cleanup.mjs'];
export function requireRelease(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).toSorted().join(',') === keys.toSorted().join(',');
export function repository(value) {
  const match = typeof value === 'string' && value.match(/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([1-9][0-9]{0,4}))?\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/u);
  requireRelease(match && value.length <= 200 && !value.includes('..') && (match[1].includes('.') || match[1] === 'localhost' || match[2]) && (!match[2] || Number(match[2]) <= 65535), 'RELEASE_REPOSITORY_REQUIRED');
  return value;
}
function expectedSourceVisibility(env) {
  const expected = env.EXPECTED_SOURCE_VISIBILITY || 'private';
  requireRelease(['private', 'public'].includes(expected), 'RELEASE_SOURCE_VISIBILITY_INVALID');
  return expected;
}
export function validateSourceRepository(value, env) {
  const expected = expectedSourceVisibility(env);
  requireRelease(value?.full_name === env.GITHUB_REPOSITORY && value.visibility === expected && value.private === (expected === 'private'), 'RELEASE_SOURCE_VISIBILITY_MISMATCH');
  return expected;
}
export function expectedImageVisibility(env) {
  const expected = env.EXPECTED_IMAGE_VISIBILITY === undefined || env.EXPECTED_IMAGE_VISIBILITY === '' ? 'private' : env.EXPECTED_IMAGE_VISIBILITY;
  requireRelease(['private', 'public'].includes(expected), 'RELEASE_IMAGE_VISIBILITY_INVALID');
  return expected;
}
export function ghcrConfiguration(env) {
  requireRelease(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/u.test(env.GITHUB_REPOSITORY ?? '') && !env.GITHUB_REPOSITORY.includes('..'), 'RELEASE_GHCR_REPOSITORY_CONTEXT_REQUIRED');
  const imageVisibility = expectedImageVisibility(env);
  if (imageVisibility === 'public') requireRelease(env.GITHUB_REPOSITORY === 'fonkoukevin/chatgpt_courses' && expectedSourceVisibility(env) === 'public', 'RELEASE_PUBLIC_IMAGES_REQUIRE_PUBLIC_SOURCE');
  const expectedRepository = imageVisibility === 'private' ? `ghcr.io/${env.GITHUB_REPOSITORY.toLowerCase()}-private` : 'ghcr.io/fonkoukevin/chatgpt_courses';
  requireRelease(repository(env.IMAGE_REPOSITORY) === expectedRepository, 'RELEASE_GHCR_SOURCE_NAMESPACE_REQUIRED');
  requireRelease(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/u.test(env.GITHUB_ACTOR ?? ''), 'RELEASE_GHCR_ACTOR_REQUIRED');
  return { registry: 'ghcr.io', imageRepository: env.IMAGE_REPOSITORY, username: env.GITHUB_ACTOR, sourceUrl: `https://github.com/${env.GITHUB_REPOSITORY}`, sourceVisibility: expectedSourceVisibility(env), imageVisibility };
}
function jobToken(env) {
  requireRelease(typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length >= 20 && env.GITHUB_TOKEN.length <= 4096 && !/\s/u.test(env.GITHUB_TOKEN), 'RELEASE_JOB_TOKEN_REQUIRED');
  return env.GITHUB_TOKEN;
}
async function responseJson(response, maximum, code) {
  const text = await response.text(); requireRelease(Buffer.byteLength(text, 'utf8') <= maximum, code);
  try { return JSON.parse(text); } catch { requireRelease(false, code); }
}
async function requireRegistryDenial(response) {
  requireRelease([401, 403].includes(response.status), 'RELEASE_GHCR_PRIVACY_UNVERIFIED');
  const body = await responseJson(response, 16384, 'RELEASE_GHCR_PRIVACY_UNVERIFIED');
  requireRelease(Array.isArray(body?.errors) && body.errors.length >= 1 && body.errors.length <= 10 && body.errors.every(error => ['DENIED', 'UNAUTHORIZED'].includes(error?.code)), 'RELEASE_GHCR_PRIVACY_UNVERIFIED');
}
export async function requireGhcrAnonymousReadDenied(image, request = fetch) {
  requireRelease(/^ghcr\.io\/[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+\/(?:web|api)$/u.test(image), 'RELEASE_GHCR_IMAGE_REQUIRED');
  const options = { redirect: 'error', signal: AbortSignal.timeout(15000) };
  const name = image.slice('ghcr.io/'.length), tokenUrl = `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${name}:pull`)}`;
  const authorization = await request(tokenUrl, options);
  if ([401, 403].includes(authorization.status)) return requireRegistryDenial(authorization);
  requireRelease(authorization.ok, 'RELEASE_GHCR_PRIVACY_UNVERIFIED');
  const anonymousToken = (await responseJson(authorization, 16384, 'RELEASE_GHCR_PRIVACY_UNVERIFIED'))?.token;
  requireRelease(typeof anonymousToken === 'string' && anonymousToken.length >= 1 && anonymousToken.length <= 8192 && !/\s/u.test(anonymousToken), 'RELEASE_GHCR_PRIVACY_UNVERIFIED');
  const listing = await request(`https://ghcr.io/v2/${name}/tags/list?n=1`, { ...options, headers: { Authorization: `Bearer ${anonymousToken}` } });
  requireRelease(!listing.ok, 'RELEASE_GHCR_PRIVATE_PACKAGE_REQUIRED');
  await requireRegistryDenial(listing);
}
export async function requireGhcrAnonymousDigestReadable(image, digest, request = fetch) {
  requireRelease(/^ghcr\.io\/[a-z0-9][a-z0-9-]*\/[a-z0-9_.-]+\/(?:web|api)$/u.test(image), 'RELEASE_GHCR_IMAGE_REQUIRED');
  requireRelease(/^sha256:[a-f0-9]{64}$/u.test(digest ?? ''), 'RELEASE_IMAGE_DIGEST_REQUIRED');
  const name = image.slice('ghcr.io/'.length), options = { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000) };
  const authorization = await request(`https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${name}:pull`)}`, options);
  requireRelease(authorization.status === 200, 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED');
  const token = (await responseJson(authorization, 16384, 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED'))?.token;
  requireRelease(typeof token === 'string' && token.length > 0 && token.length <= 8192 && !/\s/u.test(token), 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED');
  const mediaTypes = ['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json', 'application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'];
  const response = await request(`https://ghcr.io/v2/${name}/manifests/${digest}`, { ...options, headers: { Authorization: `Bearer ${token}`, Accept: mediaTypes.join(', ') } });
  const maximum = 4 * 1024 * 1024, length = response.headers?.get('content-length');
  requireRelease(response.status === 200 && response.headers?.get('docker-content-digest') === digest
    && mediaTypes.includes(response.headers?.get('content-type')?.split(';')[0].trim().toLowerCase())
    && (length === null || /^\d{1,10}$/u.test(length ?? '') && Number(length) <= maximum), 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED');
  const reader = response.body?.getReader(); requireRelease(reader, 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED');
  const hash = createHash('sha256'); let bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
      requireRelease(bytes <= maximum, 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED'); hash.update(part.value); }
    requireRelease(bytes > 0 && `sha256:${hash.digest('hex')}` === digest, 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED');
  } finally { try { await reader.cancel(); } catch { /* Never publish provider body or cancellation details. */ } reader.releaseLock(); }
}
export async function requireGhcrPackage(env, kind, { allowMissing = false, digest, request = fetch } = {}) {
  const { imageRepository, imageVisibility } = ghcrConfiguration(env);
  requireRelease(!allowMissing || imageVisibility === 'public', 'RELEASE_GHCR_PRIVATE_PACKAGE_REQUIRED');
  requireRelease(['web', 'api'].includes(kind), 'RELEASE_GHCR_IMAGE_REQUIRED');
  const [, owner, ...packagePath] = imageRepository.split('/'), packageName = `${packagePath.join('/')}/${kind}`;
  // This documented authenticated-user endpoint supports installation tokens.
  // An unavailable capability is a blocker, never permission to use a broad PAT.
  const metadata = await request(`https://api.github.com/user/packages/container/${encodeURIComponent(packageName)}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jobToken(env)}`, 'X-GitHub-Api-Version': '2026-03-10' },
    redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  if (metadata.status === 404 && allowMissing && digest === undefined) return 'absent';
  requireRelease(metadata.status === 200, 'RELEASE_GHCR_PACKAGE_METADATA_UNAVAILABLE');
  const value = await responseJson(metadata, 256 * 1024, 'RELEASE_GHCR_PACKAGE_METADATA_UNAVAILABLE');
  requireRelease(value?.name === packageName && value.package_type === 'container' && typeof value.owner?.login === 'string' && value.owner.login.toLowerCase() === owner.toLowerCase(), 'RELEASE_GHCR_PACKAGE_IDENTITY_MISMATCH');
  requireRelease(value.visibility === imageVisibility, imageVisibility === 'private' ? 'RELEASE_GHCR_PRIVATE_PACKAGE_REQUIRED' : 'RELEASE_GHCR_PUBLIC_PACKAGE_REQUIRED');
  requireRelease(value.repository?.full_name === env.GITHUB_REPOSITORY && value.repository?.private === (expectedSourceVisibility(env) === 'private'), 'RELEASE_GHCR_PACKAGE_SOURCE_REQUIRED');
  if (imageVisibility === 'private') await requireGhcrAnonymousReadDenied(`${imageRepository}/${kind}`, request);
  else if (digest !== undefined) await requireGhcrAnonymousDigestReadable(`${imageRepository}/${kind}`, digest, request);
  return imageVisibility;
}
export async function requireGhcrPrivatePackage(env, kind, options = {}) {
  requireRelease(expectedImageVisibility(env) === 'private', 'RELEASE_GHCR_PRIVATE_PACKAGE_REQUIRED');
  return requireGhcrPackage(env, kind, options);
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
export function protectedEnvironment(value, expectedName, workflow, branch) {
  const reviewers = value?.protection_rules?.find(rule => rule.type === 'required_reviewers');
  requireRelease(Number.isSafeInteger(value?.id) && value.id > 0 && value.name === expectedName && Number.isFinite(Date.parse(value.created_at)) && value.deployment_branch_policy?.protected_branches === true && value.deployment_branch_policy?.custom_branch_policies === false, 'RELEASE_PROTECTED_ENVIRONMENT_REQUIRED');
  requireRelease(!reviewers || typeof reviewers.prevent_self_review === 'boolean' && Array.isArray(reviewers.reviewers) && reviewers.reviewers.length > 0, 'RELEASE_REVIEWER_RULE_INVALID');
  requireRelease(Number.isFinite(Date.parse(workflow?.created_at)) && Date.parse(value.created_at) <= Date.parse(workflow.created_at), 'RELEASE_ENVIRONMENT_MUST_PREEXIST');
  requireRelease(branch?.protected === true, 'RELEASE_DEFAULT_BRANCH_MUST_BE_PROTECTED');
  return { reviewersConfigured: Boolean(reviewers), preventSelfReview: reviewers?.prevent_self_review ?? null, adminBypassUiObserved: false };
}
export function validateBackupReceipt(bytes, expectedHash, target) {
  requireRelease(Buffer.isBuffer(bytes) && bytes.length <= MAX_BACKUP_RECEIPT_BYTES, 'RELEASE_BACKUP_RECEIPT_SIZE_INVALID');
  requireRelease(shaPattern.test(expectedHash ?? '') && sha256(bytes) === expectedHash, 'RELEASE_BACKUP_RECEIPT_HASH_MISMATCH');
  const receipt = JSON.parse(bytes.toString('utf8'));
  requireRelease(receipt.result === 'passed' && receipt.authenticatedEncryption === true && receipt.project === target.project && receipt.environment === target.environment && receipt.database === target.database, 'RELEASE_BACKUP_RECEIPT_TARGET_MISMATCH');
}
export function validateSchemaFacts(facts, manifest, request) {
  requireRelease(typeof facts.historyPresent === 'boolean' && [facts.version, facts.failed, facts.userTables].every(value => Number.isSafeInteger(value) && value >= 0) && facts.failed === 0 && facts.version <= manifest.schema.max, 'RELEASE_DATABASE_SCHEMA_NOT_COMPATIBLE');
  if (request.operation === 'rollback') requireRelease(facts.historyPresent && facts.version >= manifest.schema.min && request.rollbackSchemaReviewed === true && request.currentSchemaVersion === facts.version && request.firstInstallEmptyDatabase !== true, 'RELEASE_ROLLBACK_SCHEMA_REVIEW_REQUIRED');
  else if (request.firstInstallEmptyDatabase) requireRelease(!facts.historyPresent && facts.version === 0 && facts.userTables === 0, 'RELEASE_FIRST_INSTALL_REQUIRES_EMPTY_DATABASE');
  else requireRelease(facts.historyPresent && facts.version > 0 && request.offHostBackupAttested === true, 'RELEASE_EXISTING_DATABASE_BACKUP_REQUIRED');
}
export function stagingPaymentTestFlag(env) {
  const value = env.STAGING_PAYMENT_TEST === undefined || env.STAGING_PAYMENT_TEST === '' ? 'false' : env.STAGING_PAYMENT_TEST;
  requireRelease(typeof value === 'string' && ['true', 'false'].includes(value), 'RELEASE_STAGING_PAYMENT_TEST_INVALID');
  requireRelease(value !== 'true' || env.TARGET_ENVIRONMENT === 'staging', 'RELEASE_PAYMENT_TEST_STAGING_ONLY');
  return value === 'true';
}
export function targetConfiguration(env) {
  requireRelease(['staging', 'production'].includes(env.TARGET_ENVIRONMENT) && env.DEPLOY_TARGET_AUTHORIZED === 'true', 'RELEASE_AUTHORIZED_TARGET_REQUIRED');
  requireRelease(/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/u.test(env.DEPLOY_HOST ?? '') && !env.DEPLOY_HOST.endsWith('.invalid') && !env.DEPLOY_HOST.includes('..') && /^[a-z_][a-z0-9_-]{0,31}$/u.test(env.DEPLOY_USER ?? ''), 'RELEASE_SSH_TARGET_INVALID');
  requireRelease(/^[1-9][0-9]{0,4}$/u.test(env.DEPLOY_PORT ?? '') && Number(env.DEPLOY_PORT) <= 65535, 'RELEASE_SSH_PORT_INVALID');
  const nodePath = env.DEPLOY_NODE_PATH || 'node';
  requireRelease(nodePath === 'node' || typeof nodePath === 'string' && nodePath.length <= 512 && /^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(nodePath) && !nodePath.includes('..') && nodePath.split('/').every(part => part !== '.'), 'RELEASE_NODE_PATH_INVALID');
  requireRelease(/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/u.test(env.DEPLOY_DIRECTORY ?? '') && !['/tmp/releases', '/var/tmp'].includes(env.DEPLOY_DIRECTORY), 'RELEASE_TARGET_DIRECTORY_INVALID');
  let origin; try { origin = new URL(env.DEPLOY_PUBLIC_ORIGIN); } catch { requireRelease(false, 'RELEASE_HTTPS_ORIGIN_REQUIRED'); }
  requireRelease(origin.protocol === 'https:' && origin.origin === env.DEPLOY_PUBLIC_ORIGIN && !origin.username && !origin.password && !origin.hostname.endsWith('.invalid'), 'RELEASE_HTTPS_ORIGIN_REQUIRED');
  return { environment: env.TARGET_ENVIRONMENT, host: env.DEPLOY_HOST, user: env.DEPLOY_USER, port: env.DEPLOY_PORT, directory: env.DEPLOY_DIRECTORY, nodePath, stagingPaymentTest: stagingPaymentTestFlag(env) };
}
function childEnvironment(extra = {}) { return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|USERPROFILE|SystemRoot|TEMP|TMP|LANG|JAVA_HOME)$/u.test(key))), ...extra }; }
function execute(file, args, options = {}) {
  const directory = join(root, '.runtime/deployment/private'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const handle = openSync(join(directory, 'commands.log'), 'a', 0o600);
  try { const result = spawnSync(file, args, { cwd: root, env: childEnvironment(), timeout: 1200000, stdio: ['pipe', handle, handle], windowsHide: true, ...options }); requireRelease(!result.error && result.status === 0, 'RELEASE_COMMAND_FAILED'); return result; }
  finally { closeSync(handle); }
}
function publicReceipt(name, value) {
  const directory = join(root, '.runtime/deployment/public'); mkdirSync(directory, { recursive: true });
  // Preserve the preceding durable intent if the process dies during a later
  // update. Interrupted temporary files are never selected by *.json upload.
  const temporary = join(directory, `.${name}.${randomUUID()}.tmp`);
  writeFileSync(temporary, name === 'release-manifest.json' ? manifestBytes(value) : JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
  renameSync(temporary, join(directory, name));
  if (process.platform !== 'win32') { const handle = openSync(directory, 'r'); try { fsyncSync(handle); } finally { closeSync(handle); } }
}
async function github(path) {
  requireRelease(process.env.GITHUB_API_URL === 'https://api.github.com' && process.env.GITHUB_SERVER_URL === 'https://github.com' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(process.env.GITHUB_REPOSITORY ?? '') && process.env.GITHUB_TOKEN, 'RELEASE_GITHUB_CONTEXT_REQUIRED');
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path ? '/' + path : ''}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2026-03-10' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  requireRelease(response.ok, 'RELEASE_GITHUB_GUARD_UNAVAILABLE');
  const bytes = await response.text(); requireRelease(Buffer.byteLength(bytes) <= 1024 * 1024, 'RELEASE_GITHUB_RESPONSE_TOO_LARGE'); return JSON.parse(bytes);
}
async function guard() {
  const env = process.env, event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  requireRelease(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && event.repository?.fork === false && event.repository.full_name === env.GITHUB_REPOSITORY && env.GITHUB_REF === `refs/heads/${event.repository.default_branch}` && commitPattern.test(env.GITHUB_SHA ?? ''), 'RELEASE_DEFAULT_BRANCH_ONLY');
  requireRelease(['plan', 'publish', 'deploy', 'rollback'].includes(env.RELEASE_OPERATION) && ['staging', 'production'].includes(env.TARGET_ENVIRONMENT), 'RELEASE_OPERATION_INVALID');
  const stagingPaymentTest = stagingPaymentTestFlag(env);
  requireRelease(env.DEPLOY_TARGET_AUTHORIZED === 'true' && /^\d+$/u.test(env.GITHUB_RUN_ID ?? ''), 'RELEASE_AUTHORIZED_TARGET_REQUIRED');
  const environment = await github(`environments/${env.TARGET_ENVIRONMENT}`);
  const workflow = await github(`actions/runs/${env.GITHUB_RUN_ID}`);
  const branch = await github(`branches/${encodeURIComponent(event.repository.default_branch)}`);
  const protections = protectedEnvironment(environment, env.TARGET_ENVIRONMENT, workflow, branch);
  const currentRepository = await github('');
  const sourceVisibility = validateSourceRepository(currentRepository, env);
  const { imageRepository, imageVisibility } = ghcrConfiguration(env);
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
  publicReceipt('guard.json', { result: 'passed', operation: env.RELEASE_OPERATION, environment: env.TARGET_ENVIRONMENT, sourceCommit: source, sourceVisibility, expectedImageVisibility: imageVisibility, stagingPaymentTest, protectedEnvironmentChecked: true, environmentPreexisting: true, defaultBranchProtected: true, defaultBranchOnly: true, ...protections, registryOrTargetMutationExecuted: false });
}
function verifiedVisibilityReceipt(imageVisibility) {
  return { expectedImageVisibility: imageVisibility, observedImageVisibility: imageVisibility,
    packageMetadataPrivateVerified: imageVisibility === 'private', packageMetadataPublicVerified: imageVisibility === 'public',
    anonymousPackageReadDenied: imageVisibility === 'private', anonymousPackageReadAllowed: imageVisibility === 'public',
    anonymousDigestReadVerified: imageVisibility === 'public', packageSourceLinkVerified: true };
}
async function publish() {
  const env = process.env;
  const progress = { schemaVersion: 1, sourceCommit: commitPattern.test(env.GITHUB_SHA ?? '') ? env.GITHUB_SHA : null, stage: 'GUARD', guardPassed: false,
    expectedImageVisibility: null,
    images: Object.fromEntries(['web', 'api'].map(kind => [kind, { pushAttempted: false, pushConfirmed: false, digestConfirmed: false, metadataVerified: false, observedVisibility: null, anonymousRead: null }])), temporaryCredentialsCreated: false, temporaryCredentialsRemoved: false };
  const stage = value => { progress.stage = value; publicReceipt('publication-progress.json', progress); };
  let registryContext, buildDiagnosticPath;
  try {
    stage('GUARD'); await guard(); progress.guardPassed = true; stage('CONFIGURATION');
    requireRelease(env.RELEASE_OPERATION === 'publish' && /^\d+$/u.test(env.GITHUB_RUN_ID ?? '') && /^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'RELEASE_PUBLICATION_CONFIGURATION_REQUIRED');
    const { imageRepository, registry, username, sourceUrl, imageVisibility } = ghcrConfiguration(env), token = jobToken(env);
    progress.expectedImageVisibility = imageVisibility;
    registryContext = { owner: env.GITHUB_REPOSITORY.split('/')[0], repositoryName: env.GITHUB_REPOSITORY.split('/')[1], imageRepository, token };
    requireRelease(['', 'false', 'true'].includes(env.APPROVED_TEST_PACKAGE_CLEANUP ?? ''), 'RELEASE_APPROVED_TEST_CLEANUP_FLAG_INVALID');
    requireRelease(imageVisibility !== 'public' || env.APPROVED_TEST_PACKAGE_CLEANUP !== 'true', 'RELEASE_PUBLIC_IMAGES_CLEANUP_FORBIDDEN');
    // Private destinations must already have an established private policy.
    // Only the explicit public contract permits an initial publication.
    for (const kind of ['web', 'api']) { stage(`CHECK_EXISTING_${kind.toUpperCase()}`); await requireGhcrPackage(env, kind, { allowMissing: imageVisibility === 'public' }); }
    if (env.APPROVED_TEST_PACKAGE_CLEANUP === 'true') {
      stage('APPROVED_TEST_CLEANUP');
      await cleanupApprovedTestPackage({ approvedTestCleanup: true, environment: env.TARGET_ENVIRONMENT,
        guardPassed: progress.guardPassed, sourceRepository: env.GITHUB_REPOSITORY, imageRepository, token },
      { record: async value => publicReceipt('approved-test-cleanup.json', value) });
    }
    const dockerConfig = mkdtempSync(join(tmpdir(), 'courses-release-registry-'));
    progress.temporaryCredentialsCreated = true;
    const dockerEnv = childEnvironment({ DOCKER_CONFIG: dockerConfig });
    let canonical, manifestSha256;
    try {
      stage('REGISTRY_LOGIN');
      execute('docker', ['login', registry, '--username', username, '--password-stdin'], { env: dockerEnv, input: token });
      stage('IMAGE_BUILD');
      buildDiagnosticPath = join(root, `.runtime/deployment/build-diagnostic-${randomUUID()}.json`);
      execute(process.execPath, [join(root, 'scripts/deployment/images.mjs'), 'build', '--commit', env.GITHUB_SHA, '--source-url', sourceUrl, '--output', join(root, '.runtime/deployment/build.json'), '--diagnostic-output', buildDiagnosticPath], { env: dockerEnv });
      const manifest = { schemaVersion: 1, sourceCommit: env.GITHUB_SHA, web: null, api: null, schema: { min: 19, max: 19 } };
      for (const kind of ['web', 'api']) {
        const tag = `${imageRepository}/${kind}:sha-${env.GITHUB_SHA}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
        stage(`LABEL_${kind.toUpperCase()}`);
        const label = execute('docker', ['image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.source"}}', `courses-${kind}:${env.GITHUB_SHA}`], { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }).stdout.trim();
        requireRelease(label === sourceUrl, 'RELEASE_IMAGE_SOURCE_URL_REQUIRED');
        execute('docker', ['image', 'tag', `courses-${kind}:${env.GITHUB_SHA}`, tag], { env: dockerEnv });
        progress.images[kind].pushAttempted = true; stage(`PUSH_${kind.toUpperCase()}`);
        execute('docker', ['image', 'push', tag], { env: dockerEnv });
        progress.images[kind].pushConfirmed = true; stage(`DIGEST_${kind.toUpperCase()}`);
        const inspect = execute('docker', ['image', 'inspect', '--format', '{{json .RepoDigests}}', tag], { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
        const repoDigests = JSON.parse(inspect.stdout);
        requireRelease(Array.isArray(repoDigests) && repoDigests.every(value => typeof value === 'string'), 'RELEASE_PUSHED_DIGEST_NOT_CONFIRMED');
        const matches = repoDigests.filter(value => value.startsWith(`${imageRepository}/${kind}@sha256:`));
        requireRelease(matches.length === 1, 'RELEASE_PUSHED_DIGEST_NOT_CONFIRMED');
        manifest[kind] = { repository: `${imageRepository}/${kind}`, digest: matches[0].split('@')[1] };
        progress.images[kind].digestConfirmed = true; stage(`VERIFY_${kind.toUpperCase()}`);
        await requireGhcrPackage(env, kind, { digest: manifest[kind].digest });
        Object.assign(progress.images[kind], { metadataVerified: true, observedVisibility: imageVisibility, anonymousRead: imageVisibility === 'public' ? 'ALLOWED' : 'DENIED' });
      }
      stage('MANIFEST');
      canonical = validateManifest(manifest, imageRepository); manifestSha256 = sha256(manifestBytes(canonical));
    } finally { requireRelease(dockerConfig.startsWith(join(tmpdir(), 'courses-release-registry-')), 'RELEASE_CREDENTIAL_CLEANUP_REFUSED'); rmSync(dockerConfig, { recursive: true, force: true }); progress.temporaryCredentialsRemoved = true; }
    publicReceipt('release-manifest.json', canonical);
    publicReceipt('publication.json', { result: 'passed', sourceCommit: env.GITHUB_SHA, manifestSha256, registryPublicationExecuted: true, ...verifiedVisibilityReceipt(imageVisibility), credentialMode: 'ephemeral-job-token', temporaryCredentialsRemoved: true, deployed: false, tagsInformationalOnly: true });
    stage('COMPLETE');
    console.log(JSON.stringify({ result: 'published', manifestSha256 }));
  } catch (error) {
    publicReceipt('publication-progress.json', progress);
    const build = progress.stage === 'IMAGE_BUILD' && buildDiagnosticPath ? readImageBuildDiagnostic(buildDiagnosticPath, env.GITHUB_SHA) : null;
    publicReceipt('publication-diagnostic.json', { result: 'failed', ...safeReleaseFailure(error, progress.stage), ...(build ? { build } : {}) });
    // Diagnostic GETs only, after the protected source/environment guard passed.
    // They do not allow a failed publication to continue or follow redirects.
    if (progress.guardPassed && registryContext) {
      try { publicReceipt('registry-inspection.json', await inspectRegistryReadOnly(registryContext)); }
      catch (inspectionError) { publicReceipt('registry-inspection.json', { result: 'unavailable', ...safeReleaseFailure(inspectionError, progress.stage) }); }
    }
    throw error;
  }
}
const quote = text => `'${text.replaceAll("'", "'\\''")}'`;
export function ghcrRemoteScript(env, command) {
  const { username } = ghcrConfiguration(env);
  requireRelease(/^\d+$/u.test(env.GITHUB_RUN_ID ?? '') && typeof command === 'string' && command.length <= 32768, 'RELEASE_GHCR_REMOTE_CONTEXT_REQUIRED');
  return `set -eu
umask 077
test -d /dev/shm && test ! -L /dev/shm
test "$(stat -f -c %T /dev/shm)" = tmpfs
registry_config=$(mktemp -d /dev/shm/courses-ghcr-${env.GITHUB_RUN_ID}-XXXXXX)
cleanup_registry() {
  exit_status=$?
  trap - EXIT HUP INT TERM
  case "$registry_config" in /dev/shm/courses-ghcr-${env.GITHUB_RUN_ID}-??????) ;; *) printf '%s\\n' RELEASE_GHCR_CLEANUP_REFUSED >&2; exit 1 ;; esac
  if [ -L "$registry_config" ] || [ "$(realpath "$registry_config")" != "$registry_config" ]; then printf '%s\\n' RELEASE_GHCR_CLEANUP_REFUSED >&2; exit 1; fi
  docker --config "$registry_config" logout ghcr.io >/dev/null 2>&1 || :
  if ! rm -rf -- "$registry_config"; then printf '%s\\n' RELEASE_GHCR_CLEANUP_FAILED >&2; exit_status=1; fi
  exit "$exit_status"
}
trap cleanup_registry EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
docker --config "$registry_config" login ghcr.io --username ${quote(username)} --password-stdin >/dev/null
export DOCKER_CONFIG="$registry_config"
umask 022
${command}
`;
}
async function deploy() {
  await guard(); const env = process.env, target = targetConfiguration(env), manifest = parseManifest(env.RELEASE_MANIFEST_JSON, env.IMAGE_REPOSITORY, env.EXPECTED_RELEASE_SHA256);
  const token = jobToken(env);
  const imageVisibility = expectedImageVisibility(env);
  for (const kind of ['web', 'api']) await requireGhcrPackage(env, kind, { digest: manifest[kind].digest });
  requireRelease(['deploy', 'rollback'].includes(env.RELEASE_OPERATION) && /^-----BEGIN (?:OPENSSH |RSA )?PRIVATE KEY-----\r?\n/u.test(env.DEPLOY_SSH_PRIVATE_KEY ?? '') && typeof env.DEPLOY_SSH_KNOWN_HOSTS === 'string' && env.DEPLOY_SSH_KNOWN_HOSTS.trim().length > 40, 'RELEASE_SSH_SECRETS_REQUIRED');
  const work = mkdtempSync(join(tmpdir(), 'courses-release-target-')), bundle = join(work, 'bundle'); mkdirSync(bundle);
  const key = join(work, 'key'), known = join(work, 'known_hosts'); writeFileSync(key, env.DEPLOY_SSH_PRIVATE_KEY, { mode: 0o600 }); writeFileSync(known, env.DEPLOY_SSH_KNOWN_HOSTS, { mode: 0o600 });
  const options = ['-i', key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'ForwardAgent=no', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${known}`, '-o', 'ConnectTimeout=15'];
  const host = `${target.user}@${target.host}`, releaseHash = env.EXPECTED_RELEASE_SHA256;
  const ssh = script => execute('ssh', [...options, '-p', target.port, host, 'sh -s'], { input: script });
  try {
    const smokeArgs = [join(root, 'scripts/deployment/smoke.mjs'), '--origin', env.DEPLOY_PUBLIC_ORIGIN, '--stripe-enabled', String(target.stagingPaymentTest)];
    if (target.environment === 'staging') {
      requireRelease(/^[A-Za-z0-9._-]{3,80}$/u.test(env.STAGING_BASIC_USERNAME ?? '') && typeof env.STAGING_BASIC_PASSWORD === 'string' && env.STAGING_BASIC_PASSWORD.length >= 24 && env.STAGING_BASIC_PASSWORD.length <= 256 && !/[\r\n\0:]/u.test(env.STAGING_BASIC_PASSWORD), 'RELEASE_STAGING_SMOKE_SECRET_REQUIRED');
      const basicFile = join(work, 'staging-basic-password'); writeFileSync(basicFile, env.STAGING_BASIC_PASSWORD, { mode: 0o600 });
      smokeArgs.push('--basic-username', env.STAGING_BASIC_USERNAME, '--basic-password-file', basicFile);
    }
    for (const path of bundleFiles) {
      const type = execute('git', ['ls-tree', manifest.sourceCommit, '--', path], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' }).stdout;
      requireRelease(/^100(?:644|755) blob /u.test(type), 'RELEASE_SOURCE_FILE_NOT_REGULAR');
      const bytes = execute('git', ['show', `${manifest.sourceCommit}:${path}`], { stdio: ['pipe', 'pipe', 'pipe'] }).stdout;
      mkdirSync(dirname(join(bundle, path)), { recursive: true }); writeFileSync(join(bundle, path), bytes, { mode: 0o644 });
    }
    writeFileSync(join(bundle, 'release-manifest.json'), manifestBytes(manifest), { mode: 0o644 });
    const request = { operation: env.RELEASE_OPERATION, environment: target.environment, stagingPaymentTest: target.stagingPaymentTest, imageRepository: env.IMAGE_REPOSITORY, manifestSha256: releaseHash, expectedPublicOrigin: env.DEPLOY_PUBLIC_ORIGIN, currentSchemaVersion: env.CURRENT_SCHEMA_VERSION ? Number(env.CURRENT_SCHEMA_VERSION) : null, rollbackSchemaReviewed: env.ROLLBACK_SCHEMA_REVIEWED === 'true', firstInstallEmptyDatabase: env.FIRST_INSTALL_EMPTY_DATABASE === 'true', offHostBackupAttested: env.OFF_HOST_BACKUP_ATTESTED === 'true', migrationBackupReceiptSha256: env.MIGRATION_BACKUP_RECEIPT_SHA256 || null };
    writeFileSync(join(bundle, 'release-request.json'), JSON.stringify(request) + '\n', { mode: 0o644 });
    const archive = join(work, 'release.tar'); execute('tar', ['-C', bundle, '-cf', archive, '--', ...bundleFiles, 'release-manifest.json', 'release-request.json']);
    const bundleHash = sha256(readFileSync(archive)), upload = `${target.directory}/incoming/${releaseHash}-${env.GITHUB_RUN_ID}.tar`;
    ssh(`set -eu\numask 077\ntest -d ${quote(target.directory)}\ntest ! -L ${quote(target.directory)}\ntest "$(realpath ${quote(target.directory)})" = ${quote(target.directory)}\ntest ! -L ${quote(target.directory + '/incoming')}\nmkdir -p ${quote(target.directory + '/incoming')}\n`);
    execute('scp', [...options, '-P', target.port, archive, `${host}:${upload}`]);
    const releaseDirectory = `${target.directory}/releases/${releaseHash}`;
    const applyScript = `test "$(sha256sum ${quote(upload)} | cut -d ' ' -f 1)" = ${quote(bundleHash)}\ntest ! -L ${quote(target.directory + '/releases')}\ntest ! -L ${quote(releaseDirectory)}\nmkdir -p ${quote(releaseDirectory)}\ntest "$(realpath ${quote(releaseDirectory)})" = ${quote(releaseDirectory)}\ntest -z "$(find ${quote(releaseDirectory)} -type l -print -quit)"\ntar -xf ${quote(upload)} -C ${quote(releaseDirectory)}\n${quote(target.nodePath)} ${quote(releaseDirectory + '/scripts/deployment/release-apply.mjs')} apply --root ${quote(target.directory)} --release ${quote(releaseHash)}\nrm -f ${quote(upload)}\n`;
    execute('ssh', [...options, '-p', target.port, host, `sh -c ${quote(ghcrRemoteScript(env, applyScript))}`], { input: token });
    execute(process.execPath, smokeArgs);
    ssh(`set -eu\n${quote(target.nodePath)} ${quote(releaseDirectory + '/scripts/deployment/release-apply.mjs')} activate --root ${quote(target.directory)} --release ${quote(releaseHash)}\n`);
    publicReceipt('deployment.json', { result: 'passed', environment: target.environment, operation: env.RELEASE_OPERATION, sourceCommit: manifest.sourceCommit, manifestSha256: releaseHash, bundleSha256: bundleHash, credentialMode: 'ephemeral-job-token-tmpfs', ...verifiedVisibilityReceipt(imageVisibility), migrationInvoked: env.RELEASE_OPERATION === 'deploy', imageBuildInvoked: false, healthSmokePassed: true, activePointerUpdated: true, dataRestoreInvoked: false });
    console.log(JSON.stringify({ result: 'deployed', environment: target.environment, manifestSha256: releaseHash }));
  } finally { requireRelease(work.startsWith(join(tmpdir(), 'courses-release-target-')), 'RELEASE_PRIVATE_CLEANUP_REFUSED'); rmSync(work, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const action = process.argv[2]; if (action === 'guard') await guard(); else if (action === 'publish') await publish(); else if (action === 'deploy') await deploy(); else throw new Error('RELEASE_ACTION_REQUIRED'); }
  catch (error) { const code = /^[A-Z_]{1,80}$/u.test(error.code ?? '') ? error.code : 'RELEASE_NOT_VALIDATED'; publicReceipt('failure.json', { result: 'failed', code, automaticRollback: false }); console.error(code); process.exitCode = 1; }
}
