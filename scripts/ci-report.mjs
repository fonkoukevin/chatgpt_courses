import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { steps } from './ci-run.mjs';
import { regularOwnedFile, screenshots, writePublicJson } from './ci-sanitize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedNames = new Set([...Object.keys(steps), ...Object.keys(steps).map(name => `${name}-collection`), 'scripts', 'browsers', 'smoke', 'scripts-collection', 'http-probe', 'release-harness', 'report'].map(name => `${name}.json`));
export function validatePublicReport(directory) {
  function valueAllowed(value, depth = 0) {
    if (depth > 12) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 1e12;
    if (typeof value === 'string') return value.length <= 500 && !/[\r\n<>]|:\/\/|(?:whsec_|sk_(?:test|live)_|pk_(?:test|live)_|Bearer\s|(?:password|cookie|token|authorization)=)|[^\s]+@[^\s]+\.[^\s]+/iu.test(value);
    if (Array.isArray(value)) return value.length <= 30000 && value.every(item => valueAllowed(item, depth + 1));
    return value && typeof value === 'object' && Object.entries(value).every(([key, item]) => /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(key) && valueAllowed(item, depth + 1));
  }
  const files = [];
  if (!existsSync(directory)) throw new Error('CI_PUBLIC_REPORT_MISSING');
  for (const name of readdirSync(directory)) {
    const file = join(directory, name);
    if (lstatSync(file).isSymbolicLink()) throw new Error('CI_PUBLIC_SYMLINK_REFUSED');
    if (name === 'screenshots' && lstatSync(file).isDirectory()) {
      for (const image of readdirSync(file)) { if (!screenshots.includes(image)) throw new Error('CI_PUBLIC_IMAGE_NOT_APPROVED'); regularOwnedFile(directory, join(file, image)); files.push(`screenshots/${image}`); }
    } else {
      if (!allowedNames.has(name) || !lstatSync(file).isFile() || lstatSync(file).size > 4 * 1024 * 1024 || !valueAllowed(JSON.parse(readFileSync(regularOwnedFile(directory, file), 'utf8')))) throw new Error('CI_PUBLIC_DATA_REFUSED');
      files.push(name);
    }
  }
  return files.toSorted();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const job = process.argv[2]; if (!['web', 'api', 'e2e'].includes(job)) throw new Error('CI_JOB_REQUIRED');
    const directory = join(root, '.runtime/ci-public', job);
    // Failed check steps remain failed; this collector only approves publication.
    writePublicJson(join(directory, 'report.json'), { schemaVersion: 1, job, rawLogsPublished: false, providerImagesPublished: false });
    const files = validatePublicReport(directory); console.log(JSON.stringify({ job, approvedFiles: files.length }));
  } catch { console.error('CI_PUBLIC_REPORT_NOT_APPROVED'); process.exitCode = 1; }
}
