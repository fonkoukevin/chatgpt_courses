import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { root, windows } from './lib/runtime.mjs';

if (!windows || process.arch !== 'x64') {
  throw new Error('Ce bootstrap cible Windows x64. La CI Linux utilise setup-node et setup-java aux versions verrouillées.');
}
const downloads = join(root, '.tools/downloads');
mkdirSync(downloads, { recursive: true });

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function install({ name, url, sha256, archive, destination, binary }) {
  if (existsSync(binary)) { console.log(`${name} déjà disponible dans .tools ; installation conservée.`); return; }
  const archivePath = join(downloads, archive);
  if (!existsSync(archivePath) || await digest(archivePath) !== sha256) {
    console.log(`Téléchargement officiel : ${name}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Téléchargement ${name} : HTTP ${response.status}`);
    const partial = `${archivePath}.partial`;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    if (await digest(partial) !== sha256) throw new Error(`Checksum SHA-256 invalide pour ${name}.`);
    renameSync(partial, archivePath);
  }
  mkdirSync(destination, { recursive: true });
  const extracted = spawnSync('tar.exe', ['-xf', archivePath, '-C', destination], { stdio: 'inherit', windowsHide: true });
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0 || !existsSync(binary)) throw new Error(`Extraction ${name} échouée.`);
  console.log(`${name} installé dans .tools après vérification SHA-256.`);
}

await install({
  name: 'Node 24.22.2 / npm 11.19.1',
  url: 'https://nodejs.org/dist/v24.22.2/node-v24.22.2-win-x64.zip',
  sha256: 'ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2',
  archive: 'node-v24.22.2-win-x64.zip', destination: join(root, '.tools'),
  binary: join(root, '.tools/node-v24.22.2-win-x64/node.exe'),
});
await install({
  name: 'Temurin JDK 21.0.13+9',
  url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_x64_windows_hotspot_21.0.13_9.zip',
  sha256: 'a4dbaa05fca4bd89d84584e58c459bd732efebb1722af80ab13c6516832004f9',
  archive: 'OpenJDK21U-jdk_x64_windows_hotspot_21.0.13_9.zip', destination: join(root, '.tools/jdk'),
  binary: join(root, '.tools/jdk/jdk-21.0.13+9/bin/java.exe'),
});
console.log('Étape suivante : .\\scripts\\courses.cmd ci puis .\\scripts\\courses.cmd run setup:local');
