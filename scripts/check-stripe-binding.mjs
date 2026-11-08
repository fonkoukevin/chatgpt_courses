import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { environment, root, windows } from './lib/runtime.mjs';

async function main() {
  const privateFile = join(root, '.env.local');
  if (!windows || spawnSync('git', ['check-ignore', '-q', '--', privateFile], { cwd: root, windowsHide: true }).status !== 0) throw new Error();
  const fromFile = parseEnv(readFileSync(privateFile, 'utf8')), env = environment();
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_ACCOUNT_ID']) if ((env[name] ?? '') !== (fromFile[name] ?? '')) throw new Error();
  if (env.APP_ENV !== 'local' || !env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || (env.STRIPE_MODE ?? 'TEST').trim().toUpperCase() !== 'TEST') throw new Error();
  const directory = join(root, '.runtime/stripe-config-probe'), jar = join(root, 'apps/api/target/chatgpt-courses-api.jar');
  if (!existsSync(jar) || !env.JAVA_HOME) throw new Error();
  mkdirSync(directory, { recursive: true });
  const compiler = spawnSync(join(env.JAVA_HOME, 'bin/javac.exe'), ['--release', '21', '-d', directory, join(root, 'scripts/probes/StripeConfigProbe.java')], { windowsHide: true, stdio: 'pipe', env: { SystemRoot: process.env.SystemRoot, PATH: env.PATH, JAVA_HOME: env.JAVA_HOME } });
  if (compiler.status !== 0) throw new Error();
  const child = spawn(join(env.JAVA_HOME, 'bin/java.exe'), [`-Dloader.path=${directory}`, '-Dloader.main=StripeConfigProbe', '-cp', jar, 'org.springframework.boot.loader.launch.PropertiesLauncher'], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', oversized = false;
  const consume = chunk => { if (output.length + chunk.length <= 1_048_576) output += chunk.toString('utf8'); else { oversized = true; child.kill(); } };
  child.stdout.on('data', consume); child.stderr.on('data', consume);
  const timeout = setTimeout(() => child.kill(), 300_000);
  const code = await new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('close', resolve); }); clearTimeout(timeout);
  const found = output.match(/^COURSES_STRIPE_BINDING (\{[^\r\n]+\})$/m); output = '';
  if (code !== 0 || !found || oversized) throw new Error();
  const flags = JSON.parse(found[1]);
  if (Object.values(flags).some(value => typeof value !== 'boolean')) throw new Error();
  const report = { verifiedAt: new Date().toISOString(), ...flags, privateFileMatchesProcessEnvironment: true, workersDisabledForProbe: true, temporaryServerStopped: true, externalStripeCalled: false };
  writeFileSync(join(root, 'docs/evidence/P12-private-config-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
main().catch(() => { console.error('Binding Stripe non confirmé. Vérifier le JDK, le JAR construit, PostgreSQL et les paramètres privés TEST. Sorties brutes volontairement non affichées.'); process.exitCode = 1; });
