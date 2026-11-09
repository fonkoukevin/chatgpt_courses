// This module has no CLI and does nothing on import. The guarded manual workflow
// supplies its existing ephemeral GITHUB_TOKEN; no local env, PAT, or fallback.
// GitHub documents installation-token support for DELETE an entire package, and
// requires the workflow repository to have package admin access. A job's
// packages:write permission alone does not prove that package role.
// https://docs.github.com/en/rest/packages/packages#delete-a-package-for-a-user
// https://docs.github.com/en/rest/packages/packages#list-package-versions-for-a-package-owned-by-the-authenticated-user
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
// Only this authenticated-user endpoint documents the state=deleted filter.
// Both lists must succeed with no Link pagination; there is no endpoint fallback.
const versionsUrl = `https://api.github.com/user/packages/container/${encodeURIComponent(target.packageName)}/versions`;
const inputKeys = ['approvedTestCleanup', 'environment', 'guardPassed', 'sourceRepository', 'imageRepository', 'token'];
const codes = new Set(['APPROVED_TEST_CLEANUP_NOT_APPROVED', 'APPROVED_TEST_CLEANUP_CONTEXT_INVALID',
  'APPROVED_TEST_TRACE_REQUIRED', 'APPROVED_TEST_TRACE_FAILED', 'APPROVED_TEST_PACKAGE_GET_UNCONFIRMED',
  'APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN', 'APPROVED_TEST_PACKAGE_IDENTITY_MISMATCH',
  'APPROVED_TEST_VERSION_GET_UNCONFIRMED', 'APPROVED_TEST_VERSION_IDENTITY_MISMATCH',
  'APPROVED_TEST_PACKAGE_VERSION_COUNT_MISMATCH', 'APPROVED_TEST_ACTIVE_VERSIONS_UNCONFIRMED',
  'APPROVED_TEST_DELETED_VERSIONS_UNCONFIRMED', 'APPROVED_TEST_INVENTORY_PAGINATED',
  'APPROVED_TEST_OTHER_VERSIONS_PRESENT',
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

function exactVersion(value) {
  const tags = value?.metadata?.container?.tags;
  return plainObject(value) && value.id === target.versionId && value.name === target.digest
    && value.metadata?.package_type === 'container' && Array.isArray(tags) && tags.length === 1 && tags[0] === target.tag;
}

function deleteErrorCategory(value) {
  // A diagnostic classification of THIS response, never a cause inferred for a
  // previous run. No provider text, code, URL, or body enters a receipt.
  if (!plainObject(value) || typeof value.message !== 'string' || Buffer.byteLength(value.message) > 4096) return 'OTHER';
  if (/\b(?:cannot|can not|can't) delete the last tagged version(?: of a package)?\b/iu.test(value.message)) return 'LAST_TAGGED_VERSION';
  if (/\b(?:more than|over) 5[,.]?000 downloads\b/iu.test(value.message) && /\b(?:cannot|can not|can't|unable)\b/iu.test(value.message)) return 'DOWNLOAD_LIMIT';
  return 'OTHER';
}

/** Explicitly deletes ONE approved package only when its entire observed active
 * inventory is the one immutable target and its deleted inventory is empty.
 * record must durably write the filtered receipt before returning; a failure
 * before DELETE prevents the request. Its pre-request intent deliberately says
 * the mutation may have happened if the process dies without a response receipt.
 * GitHub exposes no compare-and-delete precondition for inventory/tag changes;
 * the protected manual workflow must exclude concurrent package operations.
 * An initial 404 is not proof of an earlier cleanup and cannot produce success.
 * A package DELETE 204 plus authenticated package AND version GET 404 is required.
 * This is a new explicit operation, never a fallback after a version DELETE400.
 * Registry caches, CDN bytes and previously downloaded copies remain separate.
 */
export async function cleanupApprovedTestPackage(input = {}, { request = fetch, record } = {}) {
  const progress = { schemaVersion: 1, operation: 'DELETE_APPROVED_PUBLIC_TEST_PACKAGE', result: 'in-progress', stage: 'VALIDATE',
    environment: 'staging', owner: target.owner, packageName: target.packageName, versionId: target.versionId,
    tag: target.tag, digest: target.digest, sourceRepository: target.sourceRepository,
    replacementImageRepository: target.replacementImageRepository, packageGetStatus: null,
    packageMetadataVerified: false, packageVersionCount: null, versionGetStatus: null, versionMetadataVerified: false,
    activeVersionsGetStatus: null, activeVersionCount: null, activeVersionsPaginationPresent: null,
    deletedVersionsGetStatus: null, deletedVersionCount: null, deletedVersionsPaginationPresent: null,
    packageInventoryVerified: false,
    deleteAttempted: false, deletionMayHaveOccurred: false, deleteResponseStatus: null,
    deleteAcknowledged: false, providerDeleteErrorCategory: 'NONE', packageVerificationGetStatus: null,
    verificationGetStatus: null, packageDeletionConfirmed: false, versionDeletionConfirmed: false,
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
      const value = (readBody && response.status === 200) || (method === 'DELETE' && response.status === 400) ? await boundedJson(response) : null;
      if (method === 'DELETE' && response.status === 400) progress.providerDeleteErrorCategory = deleteErrorCategory(value);
      const paginationPresent = Boolean(response.headers.get('link')?.trim());
      await persist();
      return { status: progress[statusField], value, paginationPresent };
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
    if (Object.hasOwn(pkg.value, 'version_count')) {
      if (pkg.value.version_count !== 1) fail('APPROVED_TEST_PACKAGE_VERSION_COUNT_MISMATCH');
      progress.packageVersionCount = 1;
    }
    progress.packageMetadataVerified = true;
    progress.stage = 'VERSION_GET'; await persist();
    const version = await call(versionUrl, 'GET', 'versionGetStatus', true);
    if (version.status === 404) fail('APPROVED_TEST_INITIAL_ABSENCE_UNPROVEN');
    if (version.status !== 200) fail('APPROVED_TEST_VERSION_GET_UNCONFIRMED');
    if (!exactVersion(version.value)) fail('APPROVED_TEST_VERSION_IDENTITY_MISMATCH');
    progress.versionMetadataVerified = true;
    progress.stage = 'ACTIVE_VERSIONS_GET'; await persist();
    const active = await call(`${versionsUrl}?state=active&per_page=100`, 'GET', 'activeVersionsGetStatus', true);
    progress.activeVersionsPaginationPresent = active.paginationPresent;
    if (active.status !== 200 || !Array.isArray(active.value)) fail('APPROVED_TEST_ACTIVE_VERSIONS_UNCONFIRMED');
    progress.activeVersionCount = active.value.length;
    if (active.paginationPresent) fail('APPROVED_TEST_INVENTORY_PAGINATED');
    if (active.value.length !== 1 || !exactVersion(active.value[0]) || active.value[0].deleted_at != null) fail('APPROVED_TEST_OTHER_VERSIONS_PRESENT');
    progress.stage = 'DELETED_VERSIONS_GET'; await persist();
    const deleted = await call(`${versionsUrl}?state=deleted&per_page=100`, 'GET', 'deletedVersionsGetStatus', true);
    progress.deletedVersionsPaginationPresent = deleted.paginationPresent;
    if (deleted.status !== 200 || !Array.isArray(deleted.value)) fail('APPROVED_TEST_DELETED_VERSIONS_UNCONFIRMED');
    progress.deletedVersionCount = deleted.value.length;
    if (deleted.paginationPresent) fail('APPROVED_TEST_INVENTORY_PAGINATED');
    if (deleted.value.length !== 0) fail('APPROVED_TEST_OTHER_VERSIONS_PRESENT');
    progress.packageInventoryVerified = true;
    progress.stage = 'DELETE_PACKAGE'; progress.packageDeletionRequested = true; progress.deletionMayHaveOccurred = true;
    await persist(); // Mandatory durable intent, before the sole DELETE call.
    progress.deleteAttempted = true;
    const deletion = await call(packageUrl, 'DELETE', 'deleteResponseStatus');
    if (deletion.status !== 204) fail('APPROVED_TEST_DELETE_UNCONFIRMED');
    progress.deleteAcknowledged = true;
    progress.stage = 'VERIFY_PACKAGE_ABSENCE'; await persist();
    const packageVerification = await call(packageUrl, 'GET', 'packageVerificationGetStatus');
    if (packageVerification.status !== 404) fail('APPROVED_TEST_DELETION_NOT_VERIFIED');
    progress.stage = 'VERIFY_VERSION_ABSENCE'; await persist();
    const verification = await call(versionUrl, 'GET', 'verificationGetStatus');
    if (verification.status !== 404) fail('APPROVED_TEST_DELETION_NOT_VERIFIED');
    progress.packageDeletionConfirmed = true; progress.versionDeletionConfirmed = true;
    progress.residualPackageState = 'AUTHENTICATED_GET_404'; progress.result = 'passed'; progress.stage = 'COMPLETE';
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
