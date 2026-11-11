import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const probe = fileURLToPath(new URL('../fixtures/deployment/publication-probe.mjs', import.meta.url));
function publication(scenario) {
  const allowed = /^(?:PATH|Path|HOME|USERPROFILE|TEMP|TMP|TMPDIR|SystemRoot|SYSTEMROOT|LANG)$/u;
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key))), NODE_OPTIONS: '' };
  const child = spawnSync(process.execPath, [probe, JSON.stringify(scenario)], { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(child.error, undefined, 'The isolated publication probe must finish.');
  const line = child.stdout.split(/\r?\n/u).find(value => value.startsWith('PUBLICATION_PROBE '));
  assert.ok(line, 'The real publication CLI must return its captured outcome.');
  const result = JSON.parse(line.slice('PUBLICATION_PROBE '.length));
  assert.equal(child.status, result.exitCode);
  assert.equal(child.stdout.includes('SYNTHETIC_EPHEMERAL_JOB_TOKEN_42'), false);
  return result;
}

test('an absent or public web or API package blocks publication before credentials, cleanup, build and push', () => {
  for (const kind of ['web', 'api']) for (const visibility of ['absent', 'public']) {
    const result = publication({ [kind]: visibility, cleanup: true });
    assert.equal(result.exitCode, 1);
    assert.equal(result.progress.stage, `CHECK_EXISTING_${kind.toUpperCase()}`);
    assert.equal(result.failure.code, visibility === 'absent' ? 'RELEASE_GHCR_PACKAGE_METADATA_UNAVAILABLE' : 'RELEASE_GHCR_PRIVATE_PACKAGE_REQUIRED');
    assert.deepEqual(result.commands, []);
    assert.equal(result.credentialsCreated, 0);
    assert.equal(result.progress.temporaryCredentialsCreated, false);
    assert.ok(result.methods.every(method => method === 'GET'));
    assert.deepEqual(Object.values(result.progress.images).map(image => image.pushAttempted), [false, false]);
    assert.equal(result.publication, undefined);
  }
});

test('both existing private packages pass before login and build and remain checked after their simulated pushes', () => {
  const result = publication({});
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.checksBeforeFirstCommand, ['web', 'api']);
  assert.deepEqual(result.packageReads, ['web', 'api', 'web', 'api']);
  assert.deepEqual(result.commands, ['LOGIN', 'BUILD', 'INSPECT', 'TAG', 'PUSH', 'INSPECT', 'INSPECT', 'TAG', 'PUSH', 'INSPECT']);
  assert.equal(result.credentialsCreated, 1);
  assert.equal(result.credentialsRemoved, 1);
  assert.equal(result.progress.stage, 'COMPLETE');
  assert.deepEqual(Object.values(result.progress.images).map(image => image.metadataVerified), [true, true]);
  assert.equal(result.publication.result, 'passed');
  assert.equal(result.publication.packageMetadataPrivateVerified, true);
  assert.equal(result.publication.anonymousPackageReadDenied, true);
  assert.equal(result.publication.expectedImageVisibility, 'private');
  assert.equal(result.publication.observedImageVisibility, 'private');
  assert.equal(result.publication.packageMetadataPublicVerified, false);
  assert.equal(result.publication.anonymousPackageReadAllowed, false);
});

test('publication includes only a validated matching build diagnostic and still removes credentials before reporting failure', () => {
  const result = publication({ mode: 'public', buildFailure: true });
  assert.equal(result.exitCode, 1); assert.equal(result.progress.stage, 'IMAGE_BUILD');
  assert.equal(result.diagnostic.build.failureCode, 'IMAGE_WEB_BUILD_FAILED');
  assert.deepEqual(result.diagnostic.build.observedCauses, ['DOCKER_HUB_RATE_LIMIT']);
  assert.equal(result.progress.temporaryCredentialsRemoved, true); assert.equal(result.credentialsRemoved, 1);
  assert.deepEqual(result.commands, ['LOGIN', 'BUILD']); assert.equal(result.publication, undefined);
  const contaminated = publication({ mode: 'public', buildFailure: true, badBuildDiagnostic: true });
  assert.equal(contaminated.exitCode, 1); assert.equal(contaminated.diagnostic.build, undefined);
  assert.equal(JSON.stringify(contaminated).includes('SYNTHETIC_PRIVATE_NEVER_PUBLISH'), false);
  assert.equal(contaminated.progress.temporaryCredentialsRemoved, true);
});

test('explicit public initial and existing packages publish only after exact anonymous digest verification', () => {
  for (const initial of [false, true]) {
    const result = publication({ mode: 'public', ...(initial ? { web: 'absent', api: 'absent' } : {}) });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.checksBeforeFirstCommand, ['web', 'api']);
    assert.deepEqual(result.packageReads, ['web', 'api', 'web', 'api']);
    assert.equal(result.progress.stage, 'COMPLETE');
    assert.equal(result.publication.expectedImageVisibility, 'public');
    assert.equal(result.publication.observedImageVisibility, 'public');
    assert.equal(result.publication.packageMetadataPrivateVerified, false);
    assert.equal(result.publication.anonymousPackageReadDenied, false);
    assert.equal(result.publication.packageMetadataPublicVerified, true);
    assert.equal(result.publication.anonymousPackageReadAllowed, true);
    assert.equal(result.publication.anonymousDigestReadVerified, true);
    const reads = result.anonymousReads.filter(row => row.path.includes('/manifests/'));
    assert.deepEqual(reads.map(row => row.path), ['web', 'api'].map(kind => `/v2/fonkoukevin/chatgpt_courses/${kind}/manifests/${result.digest}`));
    assert.ok(reads.every(row => row.authorization === 'ANONYMOUS'));
    assert.ok(result.anonymousReads.every(row => row.authorization !== 'OTHER'));
  }
});

test('public publication refuses private source, wrong existing visibility, metadata denial and the old cleanup flag before mutation', () => {
  const cases = [
    [{ sourcePrivate: true }, 'RELEASE_PUBLIC_IMAGES_REQUIRE_PUBLIC_SOURCE'],
    [{ web: 'private' }, 'RELEASE_GHCR_PUBLIC_PACKAGE_REQUIRED'],
    [{ api: 'private' }, 'RELEASE_GHCR_PUBLIC_PACKAGE_REQUIRED'],
    [{ web: 'forbidden' }, 'RELEASE_GHCR_PACKAGE_METADATA_UNAVAILABLE'],
    [{ api: 'forbidden' }, 'RELEASE_GHCR_PACKAGE_METADATA_UNAVAILABLE'],
    [{ cleanup: true }, 'RELEASE_PUBLIC_IMAGES_CLEANUP_FORBIDDEN'],
  ];
  for (const [scenario, code] of cases) {
    const result = publication({ mode: 'public', ...scenario });
    assert.equal(result.exitCode, 1); assert.equal(result.failure.code, code);
    assert.deepEqual(result.commands, []); assert.equal(result.credentialsCreated, 0);
    assert.ok(result.methods.every(method => method === 'GET'));
    assert.equal(result.publication, undefined);
  }
});

test('wrong postpush visibility or anonymous digest stops before API push and never produces a successful receipt', () => {
  for (const scenario of [{ postVisibility: 'private' }, { wrongDigestBody: true }, { wrongDigestHeader: true }]) {
    const result = publication({ mode: 'public', ...scenario });
    assert.equal(result.exitCode, 1); assert.equal(result.progress.stage, 'VERIFY_WEB');
    assert.equal(result.failure.code, scenario.postVisibility ? 'RELEASE_GHCR_PUBLIC_PACKAGE_REQUIRED' : 'RELEASE_GHCR_PUBLIC_DIGEST_UNVERIFIED');
    assert.equal(result.progress.images.web.pushConfirmed, true);
    assert.equal(result.progress.images.web.metadataVerified, false);
    assert.equal(result.progress.images.api.pushAttempted, false);
    assert.equal(result.progress.temporaryCredentialsRemoved, true);
    assert.equal(result.publication, undefined);
  }
});
