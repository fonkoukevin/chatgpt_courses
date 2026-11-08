import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { root } from '../../scripts/lib/runtime.mjs';
import { syncStripeWebhookSecret } from '../../scripts/lib/stripe-private-env.mjs';

// Synthetic data only; never load or change the real private configuration.
const oldSecret = 'whsec_' + 'a'.repeat(32), nextSecret = 'whsec_' + 'b'.repeat(32);
const base = join(root, '.runtime', 'stripe-private-env-tests', randomUUID());
mkdirSync(base, { recursive: true });
function fixture(source) {
  const directory = join(base, randomUUID());
  mkdirSync(directory);
  const file = join(directory, '.env.local');
  writeFileSync(file, source);
  return { directory, read: () => readFileSync(file, 'utf8') };
}

test('changes only the webhook field and backs up its prior value, preserving CRLF and comments', () => {
  const source = ['# keep this comment', 'STRIPE_SECRET_KEY="placeholder-not-a-key"', 'STRIPE_ACCOUNT_ID=acct_fixture',
    'STRIPE_MODE=TEST', 'STRIPE_ENABLED=true', `STRIPE_WEBHOOK_SECRET = "${oldSecret}" # keep this too`, 'UNRELATED="same value"', ''].join('\r\n');
  const target = fixture(source), receipt = syncStripeWebhookSecret(source, nextSecret, target.directory);
  assert.equal(target.read().replace(nextSecret, `"${oldSecret}"`), source);
  const { STRIPE_WEBHOOK_SECRET: beforeSecret, ...before } = parseEnv(source);
  const { STRIPE_WEBHOOK_SECRET: afterSecret, ...after } = parseEnv(target.read());
  assert.equal(beforeSecret, oldSecret);
  assert.equal(afterSecret, nextSecret);
  assert.deepEqual(after, before);
  assert.equal(readFileSync(join(target.directory, receipt.backupFile), 'utf8'), oldSecret + '\n');
});

test('fills an empty field without inventing a prior backup or changing LF', () => {
  const source = 'STRIPE_MODE=TEST\nSTRIPE_WEBHOOK_SECRET=\n# final comment\n', target = fixture(source);
  const receipt = syncStripeWebhookSecret(source, nextSecret, target.directory);
  assert.equal(target.read(), source.replace('SECRET=\n', `SECRET=${nextSecret}\n`));
  assert.equal(receipt.previousSecretBackedUp, false);
  assert.equal(receipt.backupFile, null);
});

test('refuses a source changed since it was read without overwriting it', () => {
  const source = `STRIPE_WEBHOOK_SECRET=${oldSecret}\n`, changed = source + '# later edit\n', target = fixture(changed);
  assert.throws(() => syncStripeWebhookSecret(source, nextSecret, target.directory), { code: 'ENV_CHANGED_DURING_OPERATION' });
  assert.equal(target.read(), changed);
});

test('refuses ambiguous duplicate fields and missing fields without changing either file', () => {
  for (const source of [`STRIPE_WEBHOOK_SECRET=${oldSecret}\nSTRIPE_WEBHOOK_SECRET=\n`, 'STRIPE_MODE=TEST\n']) {
    const target = fixture(source);
    assert.throws(() => syncStripeWebhookSecret(source, nextSecret, target.directory), { code: 'WEBHOOK_FIELD_AMBIGUOUS' });
    assert.equal(target.read(), source);
  }
});

test('refuses a multiline value without leaving a partial replacement', () => {
  const source = `STRIPE_WEBHOOK_SECRET="${oldSecret}\ncontinued"\nSTRIPE_MODE=TEST\n`, target = fixture(source);
  assert.throws(() => syncStripeWebhookSecret(source, nextSecret, target.directory), { code: 'WEBHOOK_FIELD_FORMAT_UNSUPPORTED' });
  assert.equal(target.read(), source);
});
