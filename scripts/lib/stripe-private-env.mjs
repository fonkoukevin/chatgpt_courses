import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { root } from './runtime.mjs';

export class StripePrivateFileError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/** Explicit local action; replace one field, preserving other bytes and rejecting detected edits. */
export function syncStripeWebhookSecret(expectedSource, secret, directory = root) {
  directory = resolve(directory);
  if (directory !== root && !directory.startsWith(root + sep)) throw new StripePrivateFileError('PRIVATE_DIRECTORY_INVALID');
  if (!/^whsec_[A-Za-z0-9]{8,}$/.test(secret)) throw new StripePrivateFileError('SIGNING_SECRET_NOT_CONFIRMED');
  const file = join(directory, '.env.local');
  if (readFileSync(file, 'utf8') !== expectedSource) throw new StripePrivateFileError('ENV_CHANGED_DURING_OPERATION');
  const entries = expectedSource.match(/^[ \t]*(?:export[ \t]+)?STRIPE_WEBHOOK_SECRET[ \t]*=/gm) ?? [];
  if (entries.length !== 1) throw new StripePrivateFileError('WEBHOOK_FIELD_AMBIGUOUS');
  const pattern = /^([ \t]*(?:export[ \t]+)?STRIPE_WEBHOOK_SECRET[ \t]*=[ \t]*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^#'"\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/m;
  if (!pattern.test(expectedSource)) throw new StripePrivateFileError('WEBHOOK_FIELD_FORMAT_UNSUPPORTED');
  const updated = expectedSource.replace(pattern, (_line, prefix, comment) => prefix + secret + comment);
  const before = parseEnv(expectedSource), after = parseEnv(updated);
  if (after.STRIPE_WEBHOOK_SECRET !== secret || Object.keys(before).some(key => key !== 'STRIPE_WEBHOOK_SECRET' && before[key] !== after[key])) throw new StripePrivateFileError('OTHER_ENVIRONMENT_VALUES_MUST_BE_PRESERVED');
  const id = randomUUID(), temp = join(directory, `.env.local.${id}.pending`), privateDirectory = join(directory, '.runtime');
  mkdirSync(privateDirectory, { recursive: true });
  const backup = join(privateDirectory, `stripe-webhook-secret.before-sync-${id}.txt`);
  try {
    writeFileSync(temp, updated, { flag: 'wx', mode: 0o600 });
    if (readFileSync(file, 'utf8') !== expectedSource) throw new StripePrivateFileError('ENV_CHANGED_DURING_OPERATION');
    if (before.STRIPE_WEBHOOK_SECRET) writeFileSync(backup, before.STRIPE_WEBHOOK_SECRET + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temp, file);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
  return { updated: true, otherValuesPreserved: true, previousSecretBackedUp: Boolean(before.STRIPE_WEBHOOK_SECRET), backupFile: before.STRIPE_WEBHOOK_SECRET ? relative(directory, backup) : null };
}
