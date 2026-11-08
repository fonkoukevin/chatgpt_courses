import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrapStorage } from './lib/storage-bootstrap.mjs';
import { localEnvironment, loopbackPort, root, runtimeDir } from './lib/runtime.mjs';

const file = join(root, '.env.local'), original = readFileSync(file, 'utf8');
const env = localEnvironment();
const s3Port = env.S3_PORT || '8333';
if (!/^\d+$/.test(s3Port) || Number(s3Port) < 1 || Number(s3Port) > 65535) throw new Error('S3_PORT invalide.');
const defaults = {
  S3_ENDPOINT: env.S3_ENDPOINT || `http://127.0.0.1:${s3Port}`,
  S3_EXTERNAL_ENDPOINT: env.S3_EXTERNAL_ENDPOINT || `http://127.0.0.1:${s3Port}`,
  S3_PUBLIC_BUCKET: env.S3_PUBLIC_BUCKET || 'courses-editorial-local',
  S3_PRIVATE_BUCKET: env.S3_PRIVATE_BUCKET || 'courses-private-local',
  S3_REGION: env.S3_REGION || 'us-east-1',
  S3_PATH_STYLE: 'true', STORAGE_ENABLED: 'true',
};
for (const key of ['S3_ENDPOINT', 'S3_EXTERNAL_ENDPOINT']) loopbackPort(defaults[key], key);
loopbackPort(env.APP_PUBLIC_ORIGIN, 'APP_PUBLIC_ORIGIN');
bootstrapStorage({ ...env, ...defaults });

let updated = original;
for (const [key, value] of Object.entries(defaults)) {
  if (/[\r\n]/.test(value)) throw new Error('Configuration locale invalide.');
  const line = new RegExp(`^${key}=.*$`, 'm');
  updated = line.test(updated) ? updated.replace(line, () => `${key}=${value}`) : `${updated.trimEnd()}\n${key}=${value}\n`;
}
if (readFileSync(file, 'utf8') !== original) throw new Error('Configuration modifiée pendant la préparation ; relancer sans écraser les changements.');
if (updated !== original) {
  mkdirSync(runtimeDir, { recursive: true });
  const temporary = join(runtimeDir, `storage-env-${randomUUID()}.tmp`);
  writeFileSync(temporary, updated, { flag: 'wx', mode: 0o600 });
  if (readFileSync(file, 'utf8') !== original) throw new Error('Configuration modifiée pendant la préparation ; relancer sans écraser les changements.');
  renameSync(temporary, file);
}
console.log('Stockage local configuré et activé dans .env.local. Buckets privés et données existantes conservés.');
