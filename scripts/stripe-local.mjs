import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import { environment, loopbackPort, root } from './lib/runtime.mjs';
import { installStripeCli, stripeBinary } from './install-stripe-cli.mjs';
import { StripePrivateFileError, syncStripeWebhookSecret } from './lib/stripe-private-env.mjs';

const action = process.argv[2];
const pinned = JSON.parse(readFileSync(join(root, 'infra/tools/stripe-cli.windows.json'), 'utf8'));
const events = 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,refund.created,refund.updated,refund.failed,charge.refunded';
const privateSecret = join(root, '.runtime/stripe-webhook-secret.txt');
const equal = (left, right) => { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };
class LocalFailure extends Error { constructor(code) { super(code); this.code = code; } }

function privateConfiguration() {
  const file = join(root, '.env.local');
  if (spawnSync('git', ['check-ignore', '-q', '--', file], { cwd: root, windowsHide: true }).status !== 0) throw new LocalFailure('ENV_NOT_IGNORED');
  const privateSource = readFileSync(file, 'utf8'), fromFile = parseEnv(privateSource), env = environment();
  for (const name of ['STRIPE_SECRET_KEY', 'STRIPE_ACCOUNT_ID', 'STRIPE_WEBHOOK_SECRET']) if ((env[name] ?? '') !== (fromFile[name] ?? '')) throw new LocalFailure('ENV_OVERRIDE_CONFLICT');
  if (env.APP_ENV !== 'local' || (env.STRIPE_MODE ?? 'TEST').toUpperCase() !== 'TEST' || !/^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY ?? '')) throw new LocalFailure('PRIVATE_TEST_KEY_REQUIRED');
  if (!/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_ACCOUNT_ID ?? '') || (env.STRIPE_API_BASE ?? 'https://api.stripe.com') !== 'https://api.stripe.com') throw new LocalFailure('MERCHANT_CONFIGURATION_INVALID');
  const source = readFileSync(join(root, 'apps/api/src/main/java/com/chatgptcourses/payments/config/StripeSettings.java'), 'utf8');
  if (!source.includes(`API_VERSION="${pinned.expectedApiVersion}"`)) throw new LocalFailure('API_VERSION_PIN_MISMATCH');
  loopbackPort(env.APP_PUBLIC_ORIGIN, 'APP_PUBLIC_ORIGIN');
  return { env, privateSource, forwardTo: new URL('/api/v1/webhooks/stripe', env.APP_PUBLIC_ORIGIN).href };
}

async function verifyMerchant(env) {
  let response;
  try { response = await fetch('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': pinned.expectedApiVersion }, redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new LocalFailure('STRIPE_ACCOUNT_NETWORK_UNAVAILABLE'); }
  if (!response.ok) { await response.body?.cancel(); throw new LocalFailure(`STRIPE_ACCOUNT_HTTP_${response.status}`); }
  const payload = await response.json();
  if (payload.id !== env.STRIPE_ACCOUNT_ID) throw new LocalFailure('STRIPE_ACCOUNT_MISMATCH');
  const report = { verifiedAt: new Date().toISOString(), httpStatus: response.status, testKey: true, configuredAccountMatchesStripe: true, requestedApiVersion: pinned.expectedApiVersion, externalAccountReadExecuted: true, paymentCreated: false, secretValuesPrinted: false };
  mkdirSync(join(root, '.runtime'), { recursive: true });
  writeFileSync(join(root, 'docs/evidence/P12-stripe-account-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Compte Stripe vérifié : clé TEST et compte configuré concordants. Aucun paiement créé.');
}

function cliEnvironment(env) {
  const safe = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) if (env[name]) safe[name] = env[name];
  return { ...safe, STRIPE_API_KEY: env.STRIPE_SECRET_KEY, STRIPE_DEVICE_NAME: 'courses-local-test' };
}

function saveSecret(value) {
  if (!/^whsec_[A-Za-z0-9]{8,}$/.test(value)) throw new LocalFailure('SIGNING_SECRET_NOT_CONFIRMED');
  writeFileSync(privateSecret, value + '\n', { mode: 0o600 });
}

async function receiveSecret(env, { manualCopy = true } = {}) {
  const child = spawn(stripeBinary, ['listen', '--print-secret', '--latest', '--events-from', '@self', '--events', events, '--skip-update'], { cwd: root, env: cliEnvironment(env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', oversized = false;
  const consume = chunk => { if (output.length + chunk.length <= 65_536) output += chunk.toString('utf8'); else { oversized = true; child.kill(); } };
  child.stdout.on('data', consume); child.stderr.on('data', consume);
  const timeout = setTimeout(() => child.kill(), 30_000);
  const code = await new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('close', resolve); }); clearTimeout(timeout);
  const values = [...new Set(output.match(/whsec_[A-Za-z0-9]{8,}/g) ?? [])]; output = '';
  if (code !== 0 || oversized || values.length !== 1) throw new LocalFailure('CLI_SIGNING_SECRET_UNAVAILABLE');
  saveSecret(values[0]);
  writeFileSync(join(root, 'docs/evidence/P12-stripe-cli-check.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), cliVersion: pinned.version, archiveSha256Verified: true, officialChecksumManifestVerified: true, configuredAccountPreviouslyVerified: true, testMode: true, signingSecretRetrieved: true, secretStoredInIgnoredFile: true, secretValuesPrinted: false, forwardingListenerStarted: false, checkoutCreated: false }, null, 2) + '\n');
  console.log('Secret du listener enregistré dans .runtime/stripe-webhook-secret.txt, sans affichage.');
  if (manualCopy) console.log('Copiez sa valeur dans STRIPE_WEBHOOK_SECRET du fichier .env.local ; la clé existante y reste intacte.');
  return values[0];
}

async function listen({ env, forwardTo }) {
  if (!/^whsec_[A-Za-z0-9]{8,}$/.test(env.STRIPE_WEBHOOK_SECRET ?? '')) throw new LocalFailure('FILL_WEBHOOK_SECRET_FIRST');
  // listen cannot pin a snapshot version. --latest is checked against the exact
  // application pin on every Ready; Spring independently checks every event.
  const args = ['listen', '--latest', '--events-from', '@self', '--events', events, '--forward-to', forwardTo, '--skip-update'];
  const child = spawn(stripeBinary, args, { cwd: root, env: cliEnvironment(env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let line = '', versionConfirmed = false, secretConfirmed = false, failure = null, announced = false, stoppedByUser = false;
  const stop = () => { stoppedByUser = true; child.kill(); };
  const fail = code => { failure ??= code; child.kill(); };
  const readyTimeout = setTimeout(() => fail('LISTENER_READY_NOT_CONFIRMED'), 30_000);
  function consume(chunk) {
    line += chunk.toString('utf8');
    if (line.length > 65_536) return fail('LISTENER_OUTPUT_BOUND');
    let at;
    while ((at = line.search(/[\r\n]/)) >= 0) {
      const current = line.slice(0, at).replace(/\u001b\[[0-9;]*m/g, ''); line = line.slice(at + 1);
      const version = current.match(/API Version\s*\[([A-Za-z0-9_.-]+)\]/i)?.[1];
      if (version) { versionConfirmed = version === pinned.expectedApiVersion; if (!versionConfirmed) return fail('LISTENER_API_VERSION_MISMATCH'); }
      const secret = current.match(/whsec_[A-Za-z0-9]{8,}/)?.[0];
      if (secret) { saveSecret(secret); secretConfirmed = equal(secret, env.STRIPE_WEBHOOK_SECRET); if (!secretConfirmed) return fail('LISTENER_SECRET_MISMATCH'); }
      if (versionConfirmed && secretConfirmed && !announced) { announced = true; clearTimeout(readyTimeout); console.log(`Listener TEST prêt, API ${pinned.expectedApiVersion}, transfert vers ${forwardTo}. Ctrl+C pour arrêter.`); }
      const event = current.match(/checkout\.session\.(?:completed|async_payment_succeeded|async_payment_failed|expired)|refund\.(?:created|updated|failed)|charge\.refunded/)?.[0];
      const status = current.match(/\[([1-5][0-9]{2})\]/)?.[1];
      if (announced && (event || status)) console.log(`Webhook TEST : ${event ?? 'transfert'}${status ? ` HTTP ${status}` : ''}.`);
      // All other CLI output is discarded, including raw errors and credentials.
    }
  }
  child.stdout.on('data', consume); child.stderr.on('data', consume);
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const code = await new Promise(resolve => { child.once('error', () => { failure = 'CLI_START_FAILED'; resolve(-1); }); child.once('close', resolve); });
  clearTimeout(readyTimeout); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); line = '';
  if (stoppedByUser && !failure) { console.log('Listener Stripe arrêté.'); return; }
  if (failure || !announced) throw new LocalFailure(failure ?? 'LISTENER_NOT_READY');
  if (code !== 0) throw new LocalFailure('LISTENER_STOPPED');
}

async function main() {
  if (!['check', 'secret', 'sync-secret', 'listen', 'plan'].includes(action) || process.argv.length !== 3) throw new LocalFailure('EXPECTED_CHECK_SECRET_SYNC_LISTEN_OR_PLAN');
  const configuration = privateConfiguration();
  if (action === 'plan') {
    console.log(JSON.stringify({ mode: 'TEST', cliVersion: pinned.version, expectedEventApiVersion: pinned.expectedApiVersion, forwardTo: configuration.forwardTo, events: events.split(','), webhookSecretConfigured: /^whsec_[A-Za-z0-9]{8,}$/.test(configuration.env.STRIPE_WEBHOOK_SECRET ?? ''), stripeEnabled: configuration.env.STRIPE_ENABLED === 'true', rawCommand: `stripe listen --latest --events-from "@self" --events ${events} --forward-to ${configuration.forwardTo} --skip-update`, apiKeyTransport: 'private child environment only', credentialsPrinted: false, listenerStarted: false }, null, 2)); return;
  }
  if (action === 'listen' && !/^whsec_[A-Za-z0-9]{8,}$/.test(configuration.env.STRIPE_WEBHOOK_SECRET ?? '')) throw new LocalFailure('FILL_WEBHOOK_SECRET_FIRST');
  await installStripeCli(); await verifyMerchant(configuration.env);
  if (action === 'secret') await receiveSecret(configuration.env);
  if (action === 'sync-secret') {
    const secret = await receiveSecret(configuration.env, { manualCopy: false });
    const receipt = syncStripeWebhookSecret(configuration.privateSource, secret);
    writeFileSync(join(root, 'docs/evidence/P12-stripe-env-sync-check.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), testMode: true, configuredAccountPreviouslyVerified: true, webhookSecretUpdated: receipt.updated, otherValuesPreserved: receipt.otherValuesPreserved, previousSecretBackedUp: receipt.previousSecretBackedUp, secretValuesPrinted: false }, null, 2) + '\n');
    console.log('STRIPE_WEBHOOK_SECRET synchronisé ; clé, compte, mode et autres paramètres conservés.');
    if (receipt.backupFile) console.log(`Ancienne valeur conservée dans le fichier privé ${receipt.backupFile}.`);
    console.log('Redémarrez Spring pour charger ce secret, puis lancez stripe:listen.');
  }
  if (action === 'listen') await listen(configuration);
}
main().catch(error => { console.error(`Stripe local : ${error instanceof LocalFailure || error instanceof StripePrivateFileError ? error.code : 'OPERATION_NOT_CONFIRMED'}. Aucune valeur secrète affichée.`); process.exitCode = 1; });
