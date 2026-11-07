import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib/runtime.mjs';

const file = join(root, '.env.local');
if (!existsSync(file)) {
  const password = randomBytes(32).toString('hex');
  const accessKey = randomBytes(16).toString('hex');
  const secretKey = randomBytes(32).toString('hex');
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  const content = example.replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${password}`)
    .replace(/^S3_ACCESS_KEY=.*$/m, `S3_ACCESS_KEY=${accessKey}`)
    .replace(/^S3_SECRET_KEY=.*$/m, `S3_SECRET_KEY=${secretKey}`);
  writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
  console.log('.env.local créé avec des secrets aléatoires. Aucune valeur affichée.');
} else console.log('.env.local conservé. Aucune valeur existante écrasée.');

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
