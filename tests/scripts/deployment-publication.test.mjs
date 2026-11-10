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
});
