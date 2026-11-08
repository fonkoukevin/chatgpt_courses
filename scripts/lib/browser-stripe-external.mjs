import { spawn, spawnSync } from 'node:child_process';
import { root } from './runtime.mjs';
import { installStripeCli, stripeBinary } from '../install-stripe-cli.mjs';

const version = '2026-10-28.endive';
const eventTypes = 'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

/** Avoid sending recipe events to another listener of this workspace, notably dev3000. */
export function assertExternalStripeListenerIsolation() {
  if (process.platform !== 'win32') throw new Error('External Stripe listener isolation is verified only on native Windows.');
  const script = "$tasks = @(Get-CimInstance Win32_Process -Filter \"Name='stripe.exe'\" -ErrorAction Stop | Where-Object { $_.ExecutablePath -eq $env:COURSES_STRIPE_BINARY -and $_.CommandLine -match '\\blisten\\b' -and $_.CommandLine -match '--forward-to' }); Write-Output $tasks.Count";
  const safe = { COURSES_STRIPE_BINARY: stripeBinary };
  for (const name of ['SystemRoot', 'WINDIR', 'USERPROFILE', 'TEMP', 'TMP']) if (process.env[name]) safe[name] = process.env[name];
  safe.PATH = process.env.PATH ?? process.env.Path;
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { env: safe, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (result.status !== 0 || !/^\d+$/.test(result.stdout.trim())) throw new Error('Workspace Stripe listener isolation could not be verified.');
  if (Number(result.stdout.trim()) !== 0) throw new Error('Arrêtez les autres écoutes Stripe de ce dépôt avant la recette externe ; aucun paiement ni processus existant modifié.');
}

/** Explicit external TEST recipe. Raw provider output and credentials never enter public evidence. */
export async function createBrowserExternalStripe(env) {
  if (env.APP_ENV !== 'test' || env.STRIPE_MODE !== 'TEST' || !/^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY ?? '')
    || !/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_ACCOUNT_ID ?? '') || env.STRIPE_API_BASE !== 'https://api.stripe.com') {
    throw new Error('External Stripe recipe requires the configured TEST merchant and official API.');
  }
  const origin = new URL(env.APP_PUBLIC_ORIGIN);
  if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:' || ['3000', '8080'].includes(origin.port)) throw new Error('Dedicated loopback origin required.');
  async function stripeGet(path) {
    const response = await fetch('https://api.stripe.com' + path, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': version }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('External TEST Stripe read failed; provider payload discarded.'); }
    return await response.json();
  }
  const account = await stripeGet('/v1/account');
  if (account.id !== env.STRIPE_ACCOUNT_ID) throw new Error('External TEST Stripe merchant mismatch.');
  await installStripeCli();
  const cliEnv = {};
  for (const name of ['SystemRoot', 'WINDIR', 'PATH', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY']) if (env[name]) cliEnv[name] = env[name];
  Object.assign(cliEnv, { STRIPE_API_KEY: env.STRIPE_SECRET_KEY, STRIPE_DEVICE_NAME: 'courses-p12-external-test' });
  let buffer = '', apiConfirmed = false, secret = null, ready = false, stopped = false, failure = null, forwards = 0, successfulForwards = 0, replayRequests = 0;
  const deliveredEvents = new Map();
  const acknowledgedEvents = new Map();
  const child = spawn(stripeBinary, ['listen', '--latest', '--events-from', '@self', '--events', eventTypes, '--forward-to', new URL('/api/v1/webhooks/stripe', origin).href, '--skip-update'],
    { cwd: root, env: cliEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let readyResolve, readyReject;
  const readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const fail = code => { failure ??= code; readyReject(new Error(code)); child.kill(); };
  function consume(chunk) {
    buffer += chunk.toString('utf8');
    if (buffer.length > 65536) return fail('External Stripe output bound exceeded.');
    let at;
    while ((at = buffer.search(/[\r\n]/)) >= 0) {
      const line = buffer.slice(0, at).replace(/\u001b\[[0-9;]*m/g, ''); buffer = buffer.slice(at + 1);
      const announcedVersion = line.match(/API Version\s*\[([A-Za-z0-9_.-]+)\]/i)?.[1];
      if (announcedVersion) { if (announcedVersion !== version) return fail('External Stripe API version mismatch.'); apiConfirmed = true; }
      const announcedSecret = line.match(/whsec_[A-Za-z0-9]{8,}/)?.[0];
      if (announcedSecret) { if (secret && secret !== announcedSecret) return fail('External Stripe listener secret changed.'); secret = announcedSecret; }
      if (apiConfirmed && secret && !ready) { ready = true; readyResolve(); }
      const eventId = line.match(/\b(evt_[A-Za-z0-9]+)\b/)?.[1], type = line.match(/checkout\.session\.(?:completed|async_payment_succeeded|async_payment_failed|expired)/)?.[0];
      if (eventId && type) deliveredEvents.set(eventId, type);
      const status = line.match(/\[([1-5][0-9]{2})\]/)?.[1];
      if (ready && status) { forwards++; if (Number(status) >= 200 && Number(status) < 300) {
        successfulForwards++; if (eventId) acknowledgedEvents.set(eventId, (acknowledgedEvents.get(eventId) ?? 0) + 1);
      } }
    }
  }
  child.stdout.on('data', consume); child.stderr.on('data', consume);
  const exit = new Promise(resolve => {
    child.once('error', () => { fail('External Stripe CLI could not start.'); resolve(); });
    child.once('close', () => { if (!stopped) fail('External Stripe listener stopped unexpectedly.'); resolve(); });
  });
  const timer = setTimeout(() => fail('External Stripe listener readiness timed out.'), 30000);
  try { await readyPromise; }
  catch (error) { stopped = true; child.kill(); await exit; throw error; }
  finally { clearTimeout(timer); }
  Object.assign(env, { STRIPE_ENABLED: 'true', STRIPE_WEBHOOK_SECRET: secret, COMMERCE_ENABLED: 'true', COMMERCE_ALLOWED_CURRENCIES: 'EUR', PAYMENT_INBOX_ENABLED: 'false', API_TIMEOUT_MS: '30000' });
  return {
    async replay(eventId, orderId) {
      if (failure || stopped || !deliveredEvents.has(eventId) || !uuid.test(orderId)) throw new Error('Only an observed event from this TEST recipe may be replayed.');
      const event = await stripeGet('/v1/events/' + eventId);
      // A GET Event retains its historical source version. Stripe renders the
      // delivery for the CLI destination; Spring independently verifies its pin.
      if (event.livemode !== false || event.data?.object?.metadata?.order_id !== orderId || event.id !== eventId) throw new Error('External Stripe event references do not match the TEST order.');
      const acknowledgementsBefore = acknowledgedEvents.get(eventId) ?? 0;
      const replay = spawn(stripeBinary, ['events', 'resend', eventId, '--confirm'], { cwd: root, env: cliEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
      const timeout = setTimeout(() => replay.kill(), 30000);
      const code = await new Promise(resolve => { replay.once('error', () => resolve(-1)); replay.once('close', resolve); }); clearTimeout(timeout);
      if (code !== 0) throw new Error('External TEST event replay not confirmed.');
      const until = Date.now() + 30000;
      while (!failure && (acknowledgedEvents.get(eventId) ?? 0) <= acknowledgementsBefore && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100));
      if (failure || (acknowledgedEvents.get(eventId) ?? 0) <= acknowledgementsBefore) throw new Error('External TEST event replay HTTP acknowledgement not confirmed.');
      replayRequests++;
      const object = event.data.object;
      return { eventId, externalReplayRequested: true, replayHttpAcknowledged: true, testMode: true, sessionId: object.id,
        paymentIntentId: typeof object.payment_intent === 'string' && /^pi_[A-Za-z0-9]+$/.test(object.payment_intent) ? object.payment_intent : null,
        eventType: event.type, sourceEventApiVersion: /^[A-Za-z0-9_.-]{1,100}$/.test(event.api_version ?? '') ? event.api_version : null, amountMinor: object.amount_total, currency: object.currency, metadataOrderMatches: true };
    },
    async expireUnused(proof) {
      if (!proof?.sessionId) {
        if (proof?.checkoutOperationExists || proof?.checkoutOperationLookupFailed) throw new Error('Provider session cleanup cannot be confirmed without its reference.');
        return { sessionCreated: false, testMode: true };
      }
      if (!/^cs_test_[A-Za-z0-9]+$/.test(proof.sessionId) || !uuid.test(proof.orderId) || !uuid.test(proof.operationId)) throw new Error('Identified TEST session required for cleanup.');
      const session = await stripeGet('/v1/checkout/sessions/' + proof.sessionId);
      if (session.livemode !== false || session.metadata?.order_id !== proof.orderId || session.metadata?.operation_id !== proof.operationId) throw new Error('TEST session cleanup ownership mismatch.');
      const result = { sessionId: session.id, testMode: true, paid: session.payment_status === 'paid', unusedSessionExpired: session.status === 'expired' };
      if (session.status !== 'open' || session.payment_status !== 'unpaid') return { ...result, sessionRetained: session.status !== 'expired' };
      const response = await fetch('https://api.stripe.com/v1/checkout/sessions/' + session.id + '/expire', { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Stripe-Version': version }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Unused TEST session expiration not confirmed.'); }
      const expired = await response.json();
      if (expired.id !== session.id || expired.status !== 'expired' || expired.livemode !== false) throw new Error('Unused TEST expiration state differs.');
      return { ...result, unusedSessionExpired: true, sessionRetained: false };
    },
    observation: () => ({ externalStripe: true, testMode: true, accountVerified: true, apiVersion: version, listenerReady: ready, listenerStopped: stopped, listenerHealthy: !failure,
      deliveredEventIds: [...deliveredEvents.keys()], forwards, successfulForwards, replayRequests, secretValuesPrinted: false }),
    async stop() { stopped = true; child.kill(); await exit; buffer = ''; secret = null; },
  };
}
