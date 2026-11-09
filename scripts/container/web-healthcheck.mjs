import { installWebRuntimeLogging, loadStagingPassword } from './web-entrypoint.mjs';

installWebRuntimeLogging();

try {
  const textPort = process.env.PORT ?? '3000';
  if (!/^[1-9][0-9]{0,4}$/.test(textPort) || Number(textPort) > 65535) throw new Error('Invalid local web port.');
  const headers = { Accept: 'text/plain' };
  if (process.env.APP_ENV === 'staging') {
    loadStagingPassword();
    const username = process.env.STAGING_BASIC_USERNAME;
    if (!username || !/^[A-Za-z0-9._-]{3,80}$/.test(username)) throw new Error('Invalid staging username.');
    headers.Authorization = `Basic ${Buffer.from(`${username}:${process.env.STAGING_BASIC_PASSWORD}`, 'utf8').toString('base64')}`;
  }
  // Dynamic robots exercises the real Next server, runtime config and staging
  // perimeter without coupling web health to PostgreSQL or upstream API health.
  const response = await fetch(`http://127.0.0.1:${textPort}/robots.txt`, { headers, redirect: 'error', signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/plain' || !response.body) throw new Error('Web health response unavailable.');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let text = '', size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16384) { await reader.cancel(); throw new Error('Web health response exceeds its bound.'); } text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); }
  finally { reader.releaseLock(); }
  if (!/^User-Agent:/im.test(text) || !/^Disallow:/im.test(text)) throw new Error('Web health response is not robots metadata.');
} catch {
  // Never print authentication headers, secret values, paths or response bodies.
  console.error('Web health check failed.');
  process.exitCode = 1;
}
