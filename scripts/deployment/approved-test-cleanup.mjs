// This module has no CLI and does nothing on import. The guarded manual workflow
// supplies its existing ephemeral GITHUB_TOKEN; no local env, PAT, or fallback.
// GitHub documents installation-token support for DELETE package version, and
// requires the workflow repository to have package admin access. A job's
// packages:write permission alone does not prove that package role.
// https://docs.github.com/en/rest/packages/packages#delete-package-version-for-a-user
// https://docs.github.com/en/packages/learn-github-packages/deleting-and-restoring-a-package#packages-api-support
// That GITHUB_TOKEN deletion capability is documented as public preview.

export const approvedTestCleanupTarget = Object.freeze({
  owner: 'fonkoukevin',
  packageName: 'chatgpt_courses/web',
  sourceRepository: 'fonkoukevin/chatgpt_courses',
  replacementImageRepository: 'ghcr.io/fonkoukevin/chatgpt_courses-private',
  versionId: 1531288133,
  tag: 'sha-f5cef430da472a0f2eecb9f016deb9a8815ee675-42683545119-1',
  digest: 'sha256:1ba45a1d85e42c899cae9d8f1926d6e0e77a46dc93c48e6c4c0125c327d938ad',
});

const target = approvedTestCleanupTarget;
const packageUrl = `https://api.github.com/users/${target.owner}/packages/container/${encodeURIComponent(target.packageName)}`;
const versionUrl = `${packageUrl}/versions/${target.versionId}`;
const inputKeys = ['approvedTestCleanup', 'environment', 'guardPassed', 'sourceRepository', 'imageRepository', 'token'];
const codes = new Set(['APPROVED_TEST_CLEANUP_NOT_APPROVED', 'APPROVED_TEST_CLEANUP_CONTEXT_INVALID',
  'APPROVED_TEST_TRACE_REQUIRED', 'APPROVED_TEST_TRACE_FAILED', 'APPROVED_TEST_PACKAGE_GET_UNCONFIRMED',
  'APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN', 'APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH',
  'APPROVED_TEST_VERSION_GET_UNCONFIRMED', 'APPROVED_TEST_VERSION_IDENTITY_MISMATCH',
  'APPROVED_TEST_DELETE_UNCONFIRMED', 'APPROVED_TEST_DELETION_NOT_VERIFIED',
  'APPROVED_TEST_TRANSPORT_UNCONFIRMED']);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const errorWithProgress = (code, progress) => Object.assign(new Error(code), { code,
  progress: { ...copy(progress), result: 'failed', failureCode: code } });

function validateInput(input, request, record, progress) {
  if (input?.approvedTestCleanup !== true) throw errorWithProgress('APPROVED_TEST_CLEANUP_NOT_APPROVED', progress);
  if (!plainObject(input) || Object.keys(input).toSorted().join(',') !== inputKeys.toSorted().join(',')
    || input.environment !== 'staging' || input.guardPassed !== true
    || input.sourceRepository !== target.sourceRepository || input.imageRepository !== target.replacementImageRepository
    || typeof input.token !== 'string' || input.token.length < 20 || input.token.length > 4096
    || Array.from(input.token).some(char => char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126)
    || typeof request !== 'function') throw errorWithProgress('APPROVED_TEST_CLEANUP_CONTEXT_INVALID', progress);
  if (typeof record !== 'function') throw errorWithProgress('APPROVED_TEST_TRACE_REQUIRED', progress);
}

async function boundedJson(response) {
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!['application/json', 'application/vnd.github+json'].includes(type)) return null;
  const maximum = 262144, length = response.headers.get('content-length');
  if (length !== null && (!/^\d{1,10}$/u.test(length) || Number(length) > maximum)) return null;
  const reader = response.body?.getReader(); if (!reader) return null;
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximum) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(part.value));
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes))); }
    catch { return null; }
  } finally { reader.releaseLock(); }
}

/** Deletes at most ONE immutable version ID, after exact metadata checks.
 * record must durably write the filtered receipt before returning; a failure
 * before DELETE prevents the request. Its pre-request intent deliberately says
 * the mutation may have happened if the process dies without a response receipt.
 * GitHub exposes no compare-and-delete precondition for mutable container tags;
 * the protected manual workflow must exclude concurrent package/tag operations.
 * An initial 404 is not proof of an earlier cleanup and cannot produce success.
 * A 204 plus the subsequent authenticated version GET 404 proves only this
 * version deletion; package residue, registry caches and CDN bytes are separate.
 */
export async function cleanupApprovedTestVersion(input = {}, { request = fetch, record } = {}) {
  const progress = { schemaVersion: 1, operation: 'DELETE_APPROVED_PUBLIC_TEST_VERSION', result: 'in-progress', stage: 'VALIDATE',
    environment: 'staging', owner: target.owner, packageName: target.packageName, versionId: target.versionId,
    tag: target.tag, digest: target.digest, sourceRepository: target.sourceRepository,
    replacementImageRepository: target.replacementImageRepository, packageGetStatus: null,
    packageMetadataVerified: false, versionGetStatus: null, versionMetadataVerified: false,
    deleteAttempted: false, deletionMayHaveOccurred: false, deleteResponseStatus: null,
    deleteAcknowledged: false, verificationGetStatus: null, versionDeletionConfirmed: false,
    packageDeletionRequested: false, otherVersionDeletionRequested: false,
    residualPackageState: 'NOT_INSPECTED', registryAndCdnCacheState: 'NOT_INSPECTED' };
  validateInput(input, request, record, progress);
  let traceFailed = false;
  const fail = code => { throw errorWithProgress(code, progress); };
  const persist = async () => {
    // The callback receives a detached copy, never the token or provider bodies.
    try { await record(copy(progress)); }
    catch { traceFailed = true; fail('APPROVED_TEST_TRACE_FAILED'); }
  };
  const call = async (url, method, statusField, readBody = false) => {
    let response;
    try {
      response = await request(url, { method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${input.token}`, 'X-GitHub-Api-Version': '2026-03-10' } });
      progress[statusField] = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      const value = readBody && response.status === 200 ? await boundedJson(response) : null;
      await persist();
      return { status: progress[statusField], value };
    } finally {
      try { if (response?.body && !response.body.locked) await response.body.cancel(); }
      catch { /* Cancellation details must never enter a receipt. */ }
    }
  };
  try {
    progress.stage = 'PACKAGE_GET'; await persist();
    const pkg = await call(packageUrl, 'GET', 'packageGetStatus', true);
    if (pkg.status === 404) fail('APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN');
    if (pkg.status !== 200) fail('APPROVED_TEST_PACKAGE_GET_UNCONFIRMED');
    if (!(plainObject(pkg.value) && Number.isSafeInteger(pkg.value.id) && pkg.value.id > 0
      && pkg.value.name === target.packageName && pkg.value.package_type === 'container'
      && pkg.value.owner?.login === target.owner && pkg.value.visibility === 'public'
      && pkg.value.repository?.full_name === target.sourceRepository)) fail('APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH');
    progress.packageMetadataVerified = true;
    progress.stage = 'VERSION_GET'; await persist();
    const version = await call(versionUrl, 'GET', 'versionGetStatus', true);
    if (version.status === 404) fail('APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN');
    if (version.status !== 200) fail('APPROVED_TEST_VERSION_GET_UNCONFIRMED');
    const tags = version.value?.metadata?.container?.tags;
    if (!(plainObject(version.value) && version.value.id === target.versionId && version.value.name === target.digest
      && version.value.metadata?.package_type === 'container' && Array.isArray(tags) && tags.length === 1
      && tags[0] === target.tag)) fail('APPROVED_TEST_VERSION_IDENTITY_MISMATCH');
    progress.versionMetadataVerified = true;
    progress.stage = 'DELETE'; progress.deletionMayHaveOccurred = true;
    await persist(); // Mandatory durable intent, before the sole DELETE call.
    progress.deleteAttempted = true;
    const deletion = await call(versionUrl, 'DELETE', 'deleteResponseStatus');
    if (deletion.status !== 204) fail('APPROVED_TEST_DELETE_UNCONFIRMED');
    progress.deleteAcknowledged = true;
    progress.stage = 'VERIFY_VERSION_ABSENCE'; await persist();
    const verification = await call(versionUrl, 'GET', 'verificationGetStatus');
    if (verification.status !== 404) fail('APPROVED_TEST_DELETION_NOT_VERIFIED');
    progress.versionDeletionConfirmed = true; progress.result = 'passed'; progress.stage = 'COMPLETE';
    await persist();
    return copy(progress);
  } catch (error) {
    const code = codes.has(error?.code) ? error.code : 'APPROVED_TEST_TRANSPORT_UNCONFIRMED';
    if (!progress.deleteAttempted) progress.deletionMayHaveOccurred = false;
    progress.result = 'failed'; progress.failureCode = code;
    if (!traceFailed) { try { await record(copy(progress)); } catch { /* Keep the original failure and safe progress in the thrown error. */ } }
    throw errorWithProgress(code, progress);
  }
}
