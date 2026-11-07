import assert from 'node:assert/strict';
import { environment } from './lib/runtime.mjs';

const env = environment();
const origin = env.APP_PUBLIC_ORIGIN || 'http://localhost:3000';
for (const locale of ['fr', 'en']) {
  const response = await fetch(`${origin}/${locale}`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `Page ${locale} indisponible`);
  const html = await response.text();
  assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`));
  console.log(`OK page ${locale}`);
}
const health = await fetch(`${origin}/api/v1/system/health`, { signal: AbortSignal.timeout(10_000) });
if (process.argv.includes('--expect-api-unavailable')) {
  assert.ok([502, 503, 504].includes(health.status));
  const problem = await health.json();
  assert.ok(['API_UNAVAILABLE', 'SERVICE_UNAVAILABLE'].includes(problem.code));
  console.log('OK pages disponibles et panne API explicitement signalée, sans données de remplacement');
  process.exit(0);
}
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: 'UP' });
console.log('OK Spring/PostgreSQL via le proxy de même origine');
const missing = await fetch(`${origin}/api/v1/system/unknown`, { signal: AbortSignal.timeout(10_000) });
assert.equal(missing.status, 404);
assert.match(missing.headers.get('content-type'), /application\/problem\+json/);
const problem = await missing.json();
assert.equal(problem.status, 404);
assert.equal(typeof problem.code, 'string');
assert.equal(typeof problem.traceId, 'string');
assert.equal(problem.stackTrace, undefined);
assert.equal(problem.exception, undefined);
console.log('OK erreur API 404 structurée sans détail interne');
