import { pathToFileURL } from 'node:url';
import { createHTTPSClient } from './http.mjs';

const mime = response => String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
const noStore = response => /(?:^|,)\s*no-store\s*(?:,|$)/i.test(String(response.headers['cache-control'] ?? ''));
function requireCheck(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
function problem(response, status, code) {
  requireCheck(response.status === status && mime(response) === 'application/problem+json' && noStore(response), 'PROBLEM_RESPONSE_INVALID');
  const body = response.json(); requireCheck(body && body.status === status && typeof body.code === 'string' && (!code || body.code === code) && typeof body.traceId === 'string' && !Object.hasOwn(body, 'stackTrace') && !Object.hasOwn(body, 'exception'), 'PROBLEM_BODY_INVALID');
}
function referencedAssets(html, origin) {
  const assets = new Map(), attribute = (tag, name) => new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(tag)?.[1].replaceAll('&amp;', '&');
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0], script = /^<script\b/i.test(tag), css = /^<link\b/i.test(tag) && /(?:^|\s)stylesheet(?:\s|$)/i.test(attribute(tag, 'rel') ?? '');
    const ref = script ? attribute(tag, 'src') : css ? attribute(tag, 'href') : undefined; if (!ref) continue;
    const url = new URL(ref, origin), kind = script ? 'js' : 'css';
    requireCheck(url.origin === origin && url.pathname.startsWith('/_next/static/') && url.pathname.endsWith(`.${kind}`), 'ASSET_REFERENCE_INVALID');
    assets.set(url.pathname + url.search, kind);
  }
  return assets;
}

/** No account, payment, email or business mutation is created by this probe. */
export async function runSmoke(client, { stripeEnabled = false } = {}) {
  const checks = [], assets = new Map(); let current = 'INITIAL_CONFIGURATION';
  const check = async (id, action) => { current = id; const facts = await action(); checks.push({ id, result: 'passed', ...facts }); };
  try {
    requireCheck(typeof stripeEnabled === 'boolean', 'SMOKE_CONFIGURATION_INVALID');
    for (const locale of ['fr', 'en']) await check(`PAGE_${locale.toUpperCase()}`, async () => {
      const response = await client.request(`/${locale}`); requireCheck(response.status === 200 && mime(response) === 'text/html', 'PAGE_RESPONSE_INVALID'); const html = response.text();
      requireCheck(new RegExp(`<html\\b[^>]*\\blang=["']${locale}["']`, 'i').test(html), 'PAGE_LANGUAGE_INVALID');
      for (const [path, kind] of referencedAssets(html, client.origin)) assets.set(path, kind); return { status: 200 };
    });
    await check('SPRING_HEALTH', async () => { const response = await client.request('/api/v1/system/health'); requireCheck(response.status === 200 && mime(response) === 'application/json', 'HEALTH_RESPONSE_INVALID'); const value = response.json(); requireCheck(value && Object.keys(value).length === 1 && value.status === 'UP', 'HEALTH_BODY_INVALID'); return { status: 200, databaseReady: true }; });
    await check('REFERENCED_ASSETS', async () => {
      const kinds = [...assets.values()]; requireCheck(assets.size <= 64 && kinds.includes('js') && kinds.includes('css'), 'ASSET_REFERENCES_MISSING');
      for (const [path, kind] of assets) { const response = await client.request(path); requireCheck(response.status === 200 && (kind === 'js' ? ['application/javascript', 'text/javascript'].includes(mime(response)) : mime(response) === 'text/css') && response.body.length > 0, 'ASSET_RESPONSE_INVALID'); }
      return { javascript: kinds.filter(kind => kind === 'js').length, stylesheets: kinds.filter(kind => kind === 'css').length };
    });
    await check('CSRF_SESSION_COOKIE', async () => {
      const response = await client.request('/api/v1/auth/csrf'); requireCheck(response.status === 200 && mime(response) === 'application/json', 'CSRF_RESPONSE_INVALID'); const value = response.json();
      requireCheck(value && typeof value.token === 'string' && value.token.length > 0 && value.headerName === 'X-CSRF-TOKEN', 'CSRF_BODY_INVALID');
      const session = client.jar.get('SESSION'); requireCheck(session && session.secure && session.httpOnly && session.sameSite === 'lax' && session.path === '/', 'SESSION_COOKIE_FLAGS_INVALID');
      return { status: 200, secure: true, httpOnly: true, sameSiteLax: true, rootPath: true };
    });
    await check('PRIVATE_PROFILE_UNAUTHENTICATED', async () => { const response = await client.request('/api/v1/me/profile'); problem(response, 401, 'AUTHENTICATION_REQUIRED'); return { status: 401, noStore: true }; });
    await check('LOGOUT_MISSING_CSRF', async () => { const response = await client.request('/api/v1/auth/logout', { method: 'POST' }); problem(response, 403, 'CSRF_INVALID'); return { status: 403, noStore: true }; });
    await check('WEBHOOK_EXACT_FAIL_CLOSED', async () => {
      const response = await client.request('/api/v1/webhooks/stripe', { method: 'POST', json: {}, sendBasic: false, sendCookies: false });
      const status = stripeEnabled ? 400 : 503; problem(response, status, stripeEnabled ? 'STRIPE_WEBHOOK_INVALID' : 'PAYMENT_NOT_CONFIGURED');
      return { webhookMode: stripeEnabled ? 'test-configured' : 'disabled', status, requestedWithoutBasic: true, hmacValidated: false };
    });
    await check('WEBHOOK_SHADOW_CSRF', async () => { const response = await client.request('/api/v1/webhooks/stripe/POST', { method: 'POST', json: {} }); problem(response, 403, 'CSRF_INVALID'); return { status: 403, noStore: true }; });
    await check('UNKNOWN_API', async () => { const response = await client.request('/api/v1/system/unknown'); problem(response, 404); return { status: 404, noStore: true }; });
    if (client.basicConfigured) {
      await check('STAGING_BASIC_PERIMETER', async () => { const response = await client.request('/fr', { sendBasic: false, sendCookies: false }); requireCheck(response.status === 401 && noStore(response) && /^Basic\s/i.test(String(response.headers['www-authenticate'] ?? '')), 'STAGING_PERIMETER_INVALID'); return { status: 401, noStore: true }; });
      await check('STAGING_SHADOW_PERIMETER', async () => { const response = await client.request('/api/v1/webhooks/stripe/POST', { method: 'POST', json: {}, sendBasic: false, sendCookies: false }); requireCheck(response.status === 401 && noStore(response), 'STAGING_PERIMETER_INVALID'); return { status: 401, noStore: true }; });
    }
    return { event: 'DEPLOYMENT_SMOKE', result: 'passed', tlsVerified: true, webhookMode: stripeEnabled ? 'test-configured' : 'disabled', checks };
  } catch (error) {
    return { event: 'DEPLOYMENT_SMOKE', result: 'failed', failedCheck: current, code: typeof error.code === 'string' && /^[A-Z_0-9]{1,64}$/.test(error.code) ? error.code : 'SMOKE_CHECK_FAILED', checks };
  }
}

export function smokeArguments(args) {
  const values = {}, known = new Set(['--origin', '--ca-file', '--basic-username', '--basic-password-file', '--local-loopback', '--stripe-enabled']);
  for (let index = 0; index < args.length; index += 2) { const name = args[index], value = args[index + 1]; requireCheck(known.has(name) && value !== undefined && !Object.hasOwn(values, name), 'SMOKE_ARGUMENTS_INVALID'); values[name] = value; }
  requireCheck(Boolean(values['--origin']) && ['true', 'false', undefined].includes(values['--local-loopback']) && ['true', 'false', undefined].includes(values['--stripe-enabled']), 'SMOKE_ARGUMENTS_INVALID');
  return { client: { origin: values['--origin'], ...(values['--ca-file'] ? { caFile: values['--ca-file'] } : {}), ...(values['--basic-username'] ? { basicUsername: values['--basic-username'] } : {}), ...(values['--basic-password-file'] ? { basicPasswordFile: values['--basic-password-file'] } : {}), localLoopback: values['--local-loopback'] === 'true' }, stripeEnabled: values['--stripe-enabled'] === 'true' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let client, result;
  try { const args = smokeArguments(process.argv.slice(2)); client = createHTTPSClient(args.client); result = await runSmoke(client, { stripeEnabled: args.stripeEnabled }); }
  catch (error) { result = { event: 'DEPLOYMENT_SMOKE', result: 'failed', failedCheck: 'INITIAL_CONFIGURATION', code: typeof error.code === 'string' && /^[A-Z_0-9]{1,64}$/.test(error.code) ? error.code : 'SMOKE_CONFIGURATION_INVALID', checks: [] }; }
  finally { client?.close(); }
  process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.result === 'passed' ? 0 : 1;
}
