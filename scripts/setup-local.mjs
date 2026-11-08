import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, runtimeDir } from './lib/runtime.mjs';

const file = join(root, '.env.local');
if (!existsSync(file)) {
  const password = randomBytes(32).toString('hex');
  const accessKey = randomBytes(16).toString('hex');
  const secretKey = randomBytes(32).toString('hex');
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  const content = example.replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${password}`)
    .replace(/^S3_ACCESS_KEY=.*$/m, `S3_ACCESS_KEY=${accessKey}`)
    .replace(/^S3_SECRET_KEY=.*$/m, `S3_SECRET_KEY=${secretKey}`)
    .replace(/^NOTIFICATION_OUTBOX_KEY=.*$/m, `NOTIFICATION_OUTBOX_KEY=${randomBytes(32).toString('base64')}`);
  writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
  console.log('.env.local créé avec des secrets aléatoires. Aucune valeur affichée.');
} else console.log('.env.local conservé. Aucune valeur existante écrasée.');

// Upgrade only an absent/blank local key. Existing provider keys and user edits are preserved.
const original = readFileSync(file, 'utf8');
if (!/^NOTIFICATION_OUTBOX_KEY=.+$/m.test(original)) {
  const line = `NOTIFICATION_OUTBOX_KEY=${randomBytes(32).toString('base64')}`;
  const upgraded = /^NOTIFICATION_OUTBOX_KEY=.*$/m.test(original)
    ? original.replace(/^NOTIFICATION_OUTBOX_KEY=.*$/m, line) : `${original.trimEnd()}\n\n# Clé locale outbox durable P10.\n${line}\n`;
  mkdirSync(runtimeDir, { recursive: true });
  const temporary = join(runtimeDir, `local-env-${randomUUID()}.tmp`);
  writeFileSync(temporary, upgraded, { flag: 'wx', mode: 0o600 });
  if (readFileSync(file, 'utf8') !== original) throw new Error('Configuration locale modifiée pendant la préparation ; aucune valeur remplacée. Relancer setup:local.');
  renameSync(temporary, file);
  console.log('Clé locale de chiffrement outbox ajoutée. Aucune valeur affichée.');
}

process.loadEnvFile(file);
const secretDir = join(root, 'infra/secrets');
const secretFile = join(secretDir, 's3.local.json');
if (!existsSync(secretFile)) {
  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('S3_ACCESS_KEY et S3_SECRET_KEY requis dans .env.local pour préparer le profil S3.');
  }
  mkdirSync(secretDir, { recursive: true });
  writeFileSync(secretFile, JSON.stringify({ identities: [{ name: 'local-app', credentials: [{
    accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY,
  }], actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'] }] }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Configuration S3 locale créée dans infra/secrets (ignorée par Git).');
} else console.log('Configuration S3 locale conservée.');
