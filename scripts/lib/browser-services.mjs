import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bootstrapStorage } from './storage-bootstrap.mjs';

const label = 'com.chatgptcourses.browser-run';
const images = {
  s3: 'chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59',
  mailpit: 'axllent/mailpit:v1.33.0@sha256:9b3a463be15354c0f0eba91697d80e3e0d8a5623ef0e627cacc836bc17fd5231',
};
function docker(args, options = {}) {
  const r = spawnSync('docker', args, { windowsHide: true, encoding: 'utf8', timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'], ...options });
  if (r.error || r.status !== 0) throw new Error('Service Docker de recette indisponible ; aucun service partagé modifié.');
  return r.stdout.trim();
}
function hostPort(id, port) {
  const binding = docker(['port', id, `${port}/tcp`]);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Le service de recette doit rester en boucle locale.');
  return binding.split(':')[1];
}
async function healthy(id, command) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const r = spawnSync('docker', ['exec', id, ...command], { windowsHide: true, timeout: Math.max(1, Math.min(5000, deadline - Date.now())), stdio: 'ignore' });
    if (!r.error && r.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Le service isolé ne devient pas sain.');
}

// Docker cp accepts a tar stream. Fix the mode inside the isolated container,
// independently of Windows/POSIX host permissions; the host copy stays private.
function readableContainerConfig(id, json) {
  const bytes = Buffer.from(json), header = Buffer.alloc(512);
  if (bytes.length > 64 * 1024) throw new Error('Configuration de recette trop grande.');
  header.write('browser-s3.json', 0); header.write('0000444\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
  header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263);
  const checksum = header.reduce((sum, value) => sum + value, 0); header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  const archive = Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512 + 1024)]);
  docker(['cp', '-', `${id}:/tmp`], { input: archive });
}

export async function createBrowserServices(env, directory, runId, onCreate) {
  const records = [];
  async function create(kind, args, prepare, check) {
    const record = { kind, id: null, name: `courses-browser-${kind}-${randomUUID()}`, runId, image: images[kind], stopped: false };
    records.push(record); onCreate(records);
    record.id = docker(['create', '--rm', '--name', record.name, '--label', `${label}=${runId}`, ...args]);
    if (!/^[a-f0-9]{64}$/.test(record.id)) throw new Error('Identité du service isolé non confirmée.');
    if (prepare) prepare(record.id);
    docker(['start', record.id]);
    await healthy(record.id, check); onCreate(records);
    return record;
  }
  try {
    const accessKey = randomBytes(16).toString('hex'), secretKey = randomBytes(32).toString('hex');
    const auth = join(directory, 's3-test.json');
    const configuration = JSON.stringify({ identities: [{ name: 'browser-test', credentials: [{ accessKey, secretKey }],
      actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'] }] });
    writeFileSync(auth, configuration, { mode: 0o600, flag: 'wx' });
    const s3 = await create('s3', ['--mount', 'type=tmpfs,destination=/data', '--publish', '127.0.0.1::8333', images.s3,
      'server', '-dir=/data', '-ip=127.0.0.1', '-ip.bind=0.0.0.0', '-master.volumeSizeLimitMB=64', '-master.telemetry=false',
      // Two buckets plus the periodic filer journal: 3 collections × growth 7, with 3 spare slots.
      '-volume.max=24', '-filer', '-s3', '-s3.port=8333', '-s3.port.iceberg=0', '-s3.port.lance=0', '-s3.config=/tmp/browser-s3.json'],
    (id) => readableContainerConfig(id, configuration), ['curl', '--fail', '--silent', 'http://127.0.0.1:8333/healthz']);
    const mail = await create('mailpit', ['--mount', 'type=tmpfs,destination=/data', '--env', 'MP_DATABASE=/data/mailpit.db',
      '--env', 'MP_MAX_MESSAGES=100', '--publish', '127.0.0.1::1025', '--publish', '127.0.0.1::8025', images.mailpit], null, ['/mailpit', 'readyz']);
    Object.assign(env, { STORAGE_ENABLED: 'true', S3_ENDPOINT: `http://127.0.0.1:${hostPort(s3.id, 8333)}`,
      S3_EXTERNAL_ENDPOINT: `http://127.0.0.1:${hostPort(s3.id, 8333)}`, S3_REGION: 'us-east-1', S3_PATH_STYLE: 'true',
      S3_ACCESS_KEY: accessKey, S3_SECRET_KEY: secretKey, S3_PUBLIC_BUCKET: 'browser-editorial', S3_PRIVATE_BUCKET: 'browser-private',
      MAIL_MODE: 'smtp', MAIL_FROM: 'noreply@browser.courses.invalid', MAIL_HOST: '127.0.0.1', MAIL_PORT: hostPort(mail.id, 1025), MAIL_HTTP_PORT: hostPort(mail.id, 8025),
      MAIL_USERNAME: '', MAIL_PASSWORD: '', MAIL_SMTP_AUTH: 'false', MAIL_SMTP_STARTTLS: 'false', MAIL_SMTP_STARTTLS_REQUIRED: 'false', MAIL_SMTP_SSL: 'false',
      NOTIFICATION_OUTBOX_KEY: randomBytes(32).toString('base64'),
      NOTIFICATION_OUTBOX_ENABLED: 'true' });
    delete env.STRIPE_SECRET_KEY; delete env.STRIPE_WEBHOOK_SECRET;
    bootstrapStorage(env);
    return records;
  } catch (error) {
    const failures = [];
    for (const record of records.toReversed()) { try { stopBrowserService(record); } catch (e) { failures.push(e); } }
    if (failures.length) throw new AggregateError([error, ...failures], 'Services isolés partiellement arrêtés ; manifeste conservé.');
    throw error;
  }
}

export function stopBrowserService(record) {
  if (!record || record.stopped) return;
  const found = docker(['container', 'ls', '--all', '--no-trunc', '--filter', record.id ? `id=${record.id}` : `name=^/${record.name}$`, '--format', '{{.ID}}']);
  if (!found) { record.stopped = true; return; }
  if (!/^[a-f0-9]{64}$/.test(found) || (record.id && found !== record.id)) throw new Error('Service isolé non identifié pour son arrêt.');
  if (docker(['inspect', '--format', `{{ index .Config.Labels "${label}" }}`, found]) !== record.runId) throw new Error('Arrêt refusé : propriété du service non confirmée.');
  const status = docker(['inspect', '--format', '{{.State.Status}}', found]);
  if (status === 'created') docker(['rm', found]); // Owned temporary container that never started; no volume removal.
  else { if (status === 'paused') docker(['unpause', found]); docker(['stop', '--time', '10', found]); }
  if (docker(['container', 'ls', '--all', '--no-trunc', '--filter', `id=${found}`, '--format', '{{.ID}}'])) throw new Error('Arrêt du service isolé non confirmé.');
  record.stopped = true;
}

export function setBrowserServicePaused(record, paused) {
  if (!record || record.kind !== 'mailpit' || record.stopped || !/^[a-f0-9]{64}$/.test(record.id ?? '')) throw new Error('Mailpit isolé non disponible pour cette vérification.');
  if (docker(['inspect', '--format', `{{ index .Config.Labels "${label}" }}`, record.id]) !== record.runId) throw new Error('Contrôle refusé : propriété du service non confirmée.');
  const status = docker(['inspect', '--format', '{{.State.Status}}', record.id]);
  if (!['running', 'paused'].includes(status)) throw new Error('État Mailpit isolé incompatible avec cette vérification.');
  if (paused && status === 'running' || !paused && status === 'paused') docker([paused ? 'pause' : 'unpause', record.id]);
  if (docker(['inspect', '--format', '{{.State.Status}}', record.id]) !== (paused ? 'paused' : 'running')) throw new Error('Pause/reprise du Mailpit isolé non confirmée.');
  record.paused = paused;
}

// Operational diagnostics contain counts/booleans only. Raw provider logs,
// object keys, URLs and credentials are never written to an evidence file.
export function observeBrowserStorage(record) {
  if (!record || record.kind !== 's3' || record.stopped || !/^[a-f0-9]{64}$/.test(record.id ?? '')) return { available: false };
  if (docker(['inspect', '--format', `{{ index .Config.Labels "${label}" }}`, record.id]) !== record.runId) throw new Error('Observation refusée : propriété du service non confirmée.');
  const command = JSON.parse(docker(['inspect', '--format', '{{json .Config.Cmd}}', record.id]));
  const configured = command.find((value) => /^-volume\.max=\d+$/.test(value));
  const topology = JSON.parse(docker(['exec', record.id, 'curl', '--fail', '--silent', 'http://127.0.0.1:9333/dir/status']));
  const max = [], free = [], collections = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'Max' && Number.isSafeInteger(item)) max.push(item);
      if (key === 'Free' && Number.isSafeInteger(item)) free.push(item);
      if (key.toLowerCase() === 'collection' && typeof item === 'string') collections.add(item);
      if (item && typeof item === 'object') walk(item);
    }
  }
  walk(topology);
  const logs = spawnSync('docker', ['logs', record.id], { windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const raw = `${logs.stdout ?? ''}\n${logs.stderr ?? ''}`;
  return { available: true, configuredVolumeMax: configured ? Number(configured.split('=')[1]) : null,
    maxSlots: max, freeSlots: free, collectionCount: collections.size,
    noFreeVolumesObserved: /no free volumes/i.test(raw), noWritableVolumesObserved: /no writable volumes/i.test(raw),
    logsAvailable: !logs.error && logs.status === 0 };
}
