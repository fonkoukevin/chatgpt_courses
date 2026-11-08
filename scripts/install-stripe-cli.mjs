import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { root, windows } from './lib/runtime.mjs';

const pinned = JSON.parse(readFileSync(join(root, 'infra/tools/stripe-cli.windows.json'), 'utf8'));
export const stripeBinary = join(root, '.tools/stripe', pinned.version, 'stripe.exe');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function installStripeCli() {
  if (!windows || process.arch !== 'x64') throw new Error('Stripe CLI portable : Windows x64 natif requis.');
  const directory = join(root, '.tools/stripe', pinned.version), marker = join(directory, 'installation.json');
  if (existsSync(stripeBinary)) {
    if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).binarySha256 !== sha256(readFileSync(stripeBinary))) throw new Error('Installation Stripe CLI existante non vérifiée ; aucun fichier remplacé.');
    return;
  }
  const official = new URL(pinned.url), checksums = new URL(pinned.checksumsUrl);
  if ([official, checksums].some(url => url.origin !== 'https://github.com' || !url.pathname.startsWith(`/stripe/stripe-cli/releases/download/v${pinned.version}/`))) throw new Error('Source Stripe CLI officielle requise.');
  const response = await fetch(checksums, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Sommes Stripe CLI indisponibles : HTTP ${response.status}.`);
  const checksumBytes = Buffer.from(await response.arrayBuffer());
  if (sha256(checksumBytes) !== pinned.checksumsSha256) throw new Error('SHA-256 du manifeste Stripe CLI non conforme.');
  const entry = checksumBytes.toString('utf8').split(/\r?\n/).find(line => line.trim().endsWith(pinned.archive));
  if (!entry || entry.trim().split(/\s+/)[0] !== pinned.sha256) throw new Error('Archive absente du manifeste officiel épinglé.');
  const download = await fetch(official, { signal: AbortSignal.timeout(120_000) });
  if (!download.ok) throw new Error(`Archive Stripe CLI indisponible : HTTP ${download.status}.`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (sha256(bytes) !== pinned.sha256) throw new Error('SHA-256 de l’archive Stripe CLI non conforme.');
  const downloads = join(root, '.tools/downloads'); mkdirSync(downloads, { recursive: true });
  const archive = join(downloads, pinned.archive); writeFileSync(archive, bytes);
  const listing = spawnSync('tar.exe', ['-tf', archive], { encoding: 'utf8', windowsHide: true });
  if (listing.status !== 0 || listing.stdout.split(/\r?\n/).filter(Boolean).some(name => name !== 'stripe.exe')) throw new Error('Contenu inattendu de l’archive Stripe CLI ; aucune extraction.');
  mkdirSync(directory, { recursive: true });
  const extracted = spawnSync('tar.exe', ['-xf', archive, '-C', directory], { windowsHide: true, stdio: 'pipe' });
  if (extracted.status !== 0 || !existsSync(stripeBinary)) throw new Error('Extraction Stripe CLI non confirmée.');
  const version = spawnSync(stripeBinary, ['version'], { windowsHide: true, encoding: 'utf8' });
  if (version.status !== 0 || !version.stdout.includes(pinned.version)) throw new Error('Version Stripe CLI installée non conforme.');
  writeFileSync(marker, JSON.stringify({ version: pinned.version, archiveSha256: pinned.sha256, checksumsSha256: pinned.checksumsSha256, binarySha256: sha256(readFileSync(stripeBinary)) }, null, 2) + '\n');
  console.log(`Stripe CLI ${pinned.version} installé localement ; archive et manifeste SHA-256 vérifiés.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await installStripeCli();
}
