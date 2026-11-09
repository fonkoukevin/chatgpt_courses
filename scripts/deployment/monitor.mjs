import { statfsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHTTPSClient } from './http.mjs';

export function parseMonitorArgs(args) {
  const names = new Set(['origin', 'ca-file', 'basic-username', 'basic-password-file', 'local-loopback', 'backup-receipt', 'disk-path', 'max-backup-age-seconds', 'min-disk-free-bytes']);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const raw = args[i];
    if (!raw.startsWith('--') || !names.has(raw.slice(2)) || !args[i + 1]) throw new Error('MONITOR_ARGUMENTS_INVALID');
    const key = raw.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(options, key)) throw new Error('MONITOR_DUPLICATE_ARGUMENT');
    const value = args[i + 1];
    if (key === 'localLoopback') {
      if (!['true', 'false'].includes(value)) throw new Error('MONITOR_BOOLEAN_INVALID');
      options[key] = value === 'true';
    } else if (['maxBackupAgeSeconds', 'minDiskFreeBytes'].includes(key)) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('MONITOR_THRESHOLD_INVALID');
      options[key] = Number(value);
    } else options[key] = value;
  }
  if (!options.origin || !options.backupReceipt) throw new Error('MONITOR_ORIGIN_AND_RECEIPT_REQUIRED');
  return options;
}

export async function observe({ origin, caFile, basicUsername, basicPasswordFile, localLoopback = false, backupReceipt, diskPath = '.', maxBackupAgeSeconds = 86400, minDiskFreeBytes = 5 * 1024 ** 3 }) {
  if (![maxBackupAgeSeconds, minDiskFreeBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('MONITOR_THRESHOLD_INVALID');
  const alerts = [], client = createHTTPSClient({ origin, caFile, basicUsername, basicPasswordFile, localLoopback });
  try {
    const response = await client.request('/api/v1/system/health', { timeoutMs: 10000 });
    if (response.status !== 200 || response.json()?.status !== 'UP') alerts.push('HTTP_UNAVAILABLE');
  } catch { alerts.push('HTTP_UNAVAILABLE'); } finally { client.close(); }
  let backupAgeSeconds = null;
  try {
    const receipt = JSON.parse(readFileSync(backupReceipt, 'utf8'));
    backupAgeSeconds = Math.floor((Date.now() - Date.parse(receipt.createdAt)) / 1000);
    if (!Number.isFinite(backupAgeSeconds) || backupAgeSeconds < 0 || backupAgeSeconds > maxBackupAgeSeconds || receipt.result !== 'passed' || receipt.authenticatedEncryption !== true) alerts.push('BACKUP_STALE_OR_INVALID');
  } catch { alerts.push('BACKUP_RECEIPT_MISSING'); }
  let freeBytes = null;
  try {
    const disk = statfsSync(diskPath, { bigint: true });
    freeBytes = Number(disk.bavail * disk.bsize);
    if (freeBytes < minDiskFreeBytes) alerts.push('DISK_SPACE_LOW');
  } catch { alerts.push('DISK_CHECK_UNAVAILABLE'); }
  return { observedAt: new Date().toISOString(), httpAvailable: !alerts.includes('HTTP_UNAVAILABLE'), backupAgeSeconds, diskFreeBytes: freeBytes, alerts, externalNotificationSent: false, externalHostLossDetectionObserved: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await observe(parseMonitorArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (result.alerts.length) process.exitCode = 2;
  } catch { console.error('MONITOR_OBSERVATION_FAILED'); process.exitCode = 1; }
}
