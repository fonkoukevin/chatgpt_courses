import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import { createConfig, lint } from '@redocly/openapi-core';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = join(root, 'docs/api/openapi.yaml');
const generated = join(root, 'apps/web/src/lib/api/generated');
const pins = { '@hey-api/openapi-ts': '0.99.0', '@redocly/openapi-core': '2.76.0', typescript: '6.0.3' };
const action = process.argv[2];

function inside(parent, child) {
  const path = relative(parent, child);
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

async function assertVersions() {
  for (const [name, expected] of Object.entries(pins)) {
    const metadata = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'));
    if (metadata.version !== expected) throw new Error(`${name} ${expected} requis ; version installée ${metadata.version}. Exécuter npm ci.`);
  }
}

async function validate() {
  const config = await createConfig({
    // Shared DTOs and precondition conventions are deliberately not attached to
    // invented operations. Validate correctness rather than component usage.
    extends: [],
    rules: {
      struct: 'error',
      'no-unresolved-refs': 'error',
      'operation-operationId': 'error',
      'operation-operationId-unique': 'error',
      'operation-summary': 'error',
      'security-defined': 'error',
    },
  });
  const problems = await lint({ ref: contract, config });
  for (const problem of problems) {
    console.error(`${problem.severity}: ${problem.ruleId}: ${problem.message}`);
  }
  if (problems.length) throw new Error(`Contrat OpenAPI invalide : ${problems.length} problème(s).`);
  console.log('OpenAPI 3.1 validé par Redocly (structure, références, identifiants des opérations).');
}

async function files(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const names = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Lien symbolique inattendu dans le client généré : ${name}`);
    if (entry.isDirectory()) names.push(...await files(join(directory, entry.name), name));
    else names.push(name);
  }
  return names.sort();
}

async function generate(directory) {
  await createClient({
    input: contract,
    output: { path: directory, tsConfigPath: join(root, 'apps/web/tsconfig.json') },
    plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'],
    logs: { level: 'warn' },
  });
  // The pinned bundled transport uses four explicit `any` annotations. Keep
  // unknown network data unknown, and put the generated generic assertion at
  // the transport boundary. The application still validates every response.
  // Exact matches deliberately fail if an upgraded template needs review.
  const changes = {
    'client/client.gen.ts': [
      ['body?: any;', 'body?: BodyInit | null;'],
      ["const request: Client['request'] = async (options) => {", "const request = (async (options: Parameters<Client['request']>[0]) => {"],
      ['body: getValidRequestBody(opts),', 'body: getValidRequestBody(opts) as BodyInit | null | undefined,'],
      ['let emptyData: any;', 'let emptyData: unknown;'],
      ['let data: any;', 'let data: unknown;'],
      ['  };\n\n  const makeMethodFn', "  }) as Client['request'];\n\n  const makeMethodFn"],
    ],
    'core/serverSentEvents.gen.ts': [
      ['yield data as any;', "yield data as (TData extends Record<string, unknown> ? TData[keyof TData] : TData);"],
    ],
  };
  for (const [name, replacements] of Object.entries(changes)) {
    const path = join(directory, name);
    let content = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
    for (const [before, after] of replacements) {
      if (content.split(before).length !== 2) throw new Error(`Gabarit du transport modifié : ${name}. Revoir les annotations strictes.`);
      content = content.replace(before, after);
    }
    await writeFile(path, content);
  }
  const source = (await readFile(contract, 'utf8')).replaceAll('\r\n', '\n');
  await writeFile(join(directory, '.generation.json'), `${JSON.stringify({
    source: 'docs/api/openapi.yaml', sha256: createHash('sha256').update(source).digest('hex'), tools: pins,
    sourceNormalization: 'UTF-8/LF', transportAnnotations: 'unknown-boundary-v1',
  }, null, 2)}\n`);
}

async function check(directory) {
  const expected = await files(directory);
  const committed = await files(generated);
  const different = [];
  for (const name of new Set([...expected, ...committed])) {
    const [fresh, existing] = await Promise.all([
      readFile(join(directory, name), 'utf8').catch(() => null),
      readFile(join(generated, name), 'utf8').catch(() => null),
    ]);
    if (fresh?.replaceAll('\r\n', '\n') !== existing?.replaceAll('\r\n', '\n')) different.push(name);
  }
  if (different.length) throw new Error(`Client généré divergent (${different.join(', ')}). Exécuter npm run api:generate et versionner le résultat.`);
  console.log(`Client généré à jour : ${expected.length} fichiers identiques, aucun fichier supplémentaire.`);
}

async function test(directory) {
  const sources = (await readdir(join(root, 'tests/api'))).filter((name) => name.endsWith('.test.ts')).sort();
  const program = ts.createProgram(sources.map((name) => join(root, 'tests/api', name)), {
    strict: true, noEmitOnError: true, skipLibCheck: true, esModuleInterop: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: ['node'], typeRoots: [join(root, 'node_modules/@types')], rootDir: root, outDir: directory,
  });
  const result = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name, getCurrentDirectory: () => root, getNewLine: () => '\n',
    }));
    throw new Error('Le client et ses tests TypeScript ne compilent pas.');
  }
  const execution = spawnSync(process.execPath, ['--test', ...sources.map((name) => join(directory, 'tests/api', name.replace(/\.ts$/, '.js')))], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  });
  if (execution.error) throw execution.error;
  if (execution.status !== 0) throw new Error('Échec des tests du client API.');
}

let temporary;
try {
  if (!['validate', 'generate', 'check', 'test'].includes(action)) throw new Error('Usage : node scripts/api-contract.mjs validate|generate|check|test');
  await assertVersions();
  await validate();
  if (action !== 'validate') {
    temporary = await mkdtemp(join(tmpdir(), 'courses-api-contract-'));
    if (action === 'test') await test(temporary);
    else {
      await generate(temporary);
      if (action === 'check') await check(temporary);
      else {
        if (!inside(root, generated)) throw new Error('Destination de génération hors du dépôt.');
        // This directory contains only reproducible artifacts; custom code lives beside it.
        await rm(generated, { recursive: true, force: true });
        await mkdir(dirname(generated), { recursive: true });
        await cp(temporary, generated, { recursive: true });
        console.log('Types, SDK et transport fetch générés depuis docs/api/openapi.yaml.');
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Échec du contrat API.');
  process.exitCode = 1;
} finally {
  if (temporary) {
    if (!inside(tmpdir(), temporary)) throw new Error('Répertoire temporaire inattendu ; nettoyage refusé.');
    await rm(temporary, { recursive: true, force: true });
  }
}
