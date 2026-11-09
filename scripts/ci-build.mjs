import { readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { digest, regularOwnedFile, writePublicJson, inside } from './ci-sanitize.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const magic = Buffer.from('COURSES_CI_BUILD_V1\n');
const maximum = 512 * 1024 * 1024;
const nextFiles = new Set(['BUILD_ID', 'app-path-routes-manifest.json', 'build-manifest.json', 'export-marker.json', 'fallback-build-manifest.json', 'images-manifest.json', 'next-minimal-server.js.nft.json', 'next-server.js.nft.json', 'package.json', 'prerender-manifest.json', 'required-server-files.js', 'required-server-files.json', 'routes-manifest.json', 'turbopack']);
const nextDirs = new Set(['server', 'static', 'build']);
export function allowedBuildPath(kind, path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_@+.,()[\]~$% -]+(?:\/[A-Za-z0-9_@+.,()[\]~$% -]+)*$/u.test(path) || path.split('/').some(part => part === '.' || part === '..' || /^\.env(?:\.|$)/iu.test(part) || /(?:^|\.)log$/iu.test(part))) return false;
  if (kind === 'api') return path === 'chatgpt-courses-api.jar';
  return kind === 'web' && (nextFiles.has(path) || nextDirs.has(path.split('/')[0]) && path.includes('/'));
}
function sourceDirectory(base, kind) { return join(base, kind === 'api' ? 'apps/api/target' : 'apps/web/.next'); }
function filesAt(base, kind) {
  const directory = sourceDirectory(base, kind), files = [];
  if (!inside(base, directory)) throw new Error('CI_BUILD_SOURCE_OUTSIDE_ROOT');
  for (let current = directory; resolve(current) !== resolve(base); current = dirname(current)) if (lstatSync(current).isSymbolicLink()) throw new Error('CI_BUILD_SYMLINK_REFUSED');
  function visit(current) {
    for (const name of readdirSync(current).toSorted()) {
      const path = join(current, name), entry = lstatSync(path), part = relative(directory, path).replaceAll('\\', '/');
      if (/^\.env(?:\.|$)/iu.test(name)) throw new Error('CI_BUILD_SECRET_FILENAME_REFUSED');
      if (entry.isSymbolicLink()) throw new Error('CI_BUILD_SYMLINK_REFUSED');
      if (entry.isDirectory()) {
        if (current === directory && kind === 'web' && !nextDirs.has(name)) continue;
        if (kind !== 'web') continue;
        if (!nextDirs.has(part.split('/')[0])) throw new Error('CI_BUILD_DIRECTORY_REFUSED');
        visit(path);
      } else if (entry.isFile() && allowedBuildPath(kind, part)) files.push(part);
      else if (current !== directory || nextFiles.has(name)) throw new Error('CI_BUILD_FILE_REFUSED');
    }
  }
  if (lstatSync(directory).isSymbolicLink()) throw new Error('CI_BUILD_SYMLINK_REFUSED');
  visit(directory);
  if (kind === 'web' && (!files.includes('BUILD_ID') || !files.some(path => path.startsWith('server/')) || !files.some(path => path.startsWith('static/')))) throw new Error('CI_WEB_BUILD_INCOMPLETE');
  if (kind === 'api' && files.length !== 1) throw new Error('CI_API_BUILD_INCOMPLETE');
  return { directory, files };
}
export function packBuild(base, kind, commit, output) {
  if (!['api', 'web'].includes(kind) || !/^[a-f0-9]{40}$/u.test(commit)) throw new Error('CI_BUILD_IDENTITY_REQUIRED');
  const { directory, files } = filesAt(base, kind);
  const chunks = files.map(path => readFileSync(regularOwnedFile(directory, join(directory, path))));
  if (chunks.reduce((sum, bytes) => sum + bytes.length, 0) > maximum) throw new Error('CI_BUILD_TOO_LARGE');
  const buildId = kind === 'web' ? readFileSync(join(directory, 'BUILD_ID'), 'utf8').trim() : null;
  if (buildId !== null && !/^[A-Za-z0-9_-]{1,100}$/u.test(buildId)) throw new Error('CI_BUILD_ID_INVALID');
  const manifest = { schemaVersion: 1, kind, commit, node: '24.22.2', java: '21.0.13+9', buildId,
    files: files.map((path, index) => ({ path, bytes: chunks[index].length, sha256: digest(chunks[index]) })) };
  const metadata = Buffer.from(JSON.stringify(manifest)), length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(metadata.length));
  const archive = gzipSync(Buffer.concat([magic, length, metadata, ...chunks]), { level: 6 });
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, archive, { mode: 0o600 });
  writePublicJson(`${output}.json`, { ...manifest, archiveSha256: digest(archive) });
  return { manifest, archiveSha256: digest(archive), bytes: archive.length };
}
export function restoreBuild(base, kind, commit, archiveFile, expectedSha256) {
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new Error('CI_EXPECTED_ARCHIVE_HASH_REQUIRED');
  const archive = readFileSync(archiveFile);
  if (archive.length > maximum || digest(archive) !== expectedSha256) throw new Error('CI_ARCHIVE_HASH_MISMATCH');
  const bytes = gunzipSync(archive, { maxOutputLength: maximum + 4 * 1024 * 1024 });
  if (!bytes.subarray(0, magic.length).equals(magic) || bytes.length < magic.length + 8) throw new Error('CI_ARCHIVE_FORMAT_REFUSED');
  const size = Number(bytes.readBigUInt64BE(magic.length)), start = magic.length + 8;
  if (!Number.isSafeInteger(size) || size < 1 || size > 4 * 1024 * 1024 || start + size > bytes.length) throw new Error('CI_ARCHIVE_METADATA_REFUSED');
  const manifest = JSON.parse(bytes.toString('utf8', start, start + size));
  if (manifest.schemaVersion !== 1 || manifest.kind !== kind || manifest.commit !== commit || manifest.node !== '24.22.2' || manifest.java !== '21.0.13+9' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 30000) throw new Error('CI_ARCHIVE_IDENTITY_MISMATCH');
  const directory = sourceDirectory(base, kind), seen = new Set(); let offset = start + size;
  if (existsSync(directory)) throw new Error('CI_BUILD_DESTINATION_MUST_BE_ABSENT');
  // Validate every byte/path before creating any output. No tar extraction, links,
  // absolute paths, metadata restoration or executable hooks are involved.
  for (const file of manifest.files) {
    if (!allowedBuildPath(kind, file.path) || seen.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > maximum || !/^[a-f0-9]{64}$/u.test(file.sha256) || offset + file.bytes > bytes.length || digest(bytes.subarray(offset, offset + file.bytes)) !== file.sha256) throw new Error('CI_ARCHIVE_FILE_REFUSED');
    seen.add(file.path); offset += file.bytes;
  }
  if (offset !== bytes.length || kind === 'api' && (seen.size !== 1 || !seen.has('chatgpt-courses-api.jar')) || kind === 'web' && (!seen.has('BUILD_ID') || ![...seen].some(path => path.startsWith('server/')) || ![...seen].some(path => path.startsWith('static/')))) throw new Error('CI_ARCHIVE_CONTENT_REFUSED');
  for (let current = dirname(directory); current !== dirname(current); current = dirname(current)) if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('CI_RESTORE_PARENT_SYMLINK_REFUSED');
  offset = start + size;
  mkdirSync(directory, { recursive: true });
  for (const file of manifest.files) { const path = join(directory, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes.subarray(offset, offset + file.bytes), { mode: 0o600, flag: 'wx' }); offset += file.bytes; }
  if (kind === 'web' && readFileSync(join(directory, 'BUILD_ID'), 'utf8').trim() !== manifest.buildId) throw new Error('CI_RESTORED_BUILD_ID_MISMATCH');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, kind, expected] = process.argv.slice(2), commit = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error('CI_SOURCE_COMMIT_REQUIRED');
  const archive = join(root, '.runtime/ci-builds', `${kind}.ci-build.gz`);
  if (action === 'pack') {
    const result = packBuild(root, kind, commit, archive);
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `sha256=${result.archiveSha256}\n`, { flag: 'a' });
    console.log(JSON.stringify({ kind, archiveSha256: result.archiveSha256, files: result.manifest.files.length, bytes: result.bytes }));
  } else if (action === 'restore') { const result = restoreBuild(root, kind, commit, archive, expected); console.log(JSON.stringify({ kind, restoredFiles: result.files.length })); }
  else throw new Error('CI_BUILD_ACTION_REQUIRED');
}
