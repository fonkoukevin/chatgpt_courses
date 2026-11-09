import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { Agent, request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { inspect } from 'node:util';
import { decodeStagingPassword } from '../container/web-entrypoint.mjs';

const transportCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const ownCodes = new Set(['HTTPS_CONFIGURATION_INVALID', 'HTTPS_REQUEST_INVALID', 'HTTPS_TIMEOUT', 'HTTPS_RESPONSE_TOO_LARGE', 'HTTPS_TRANSPORT_FAILED', 'HTTPS_RESPONSE_INVALID', 'HTTPS_JSON_INVALID', 'HTTPS_UTF8_INVALID']);
function failure(code) { const safe = ownCodes.has(code) || transportCodes.has(code) ? code : 'HTTPS_TRANSPORT_FAILED'; const error = new Error(safe); error.code = safe; return error; }

function readBounded(file, bound) {
  let descriptor;
  try {
    descriptor = openSync(file, 'r'); if (!fstatSync(descriptor).isFile()) throw failure('HTTPS_CONFIGURATION_INVALID');
    const bytes = Buffer.alloc(bound + 1); let at = 0;
    while (at < bytes.length) { const size = readSync(descriptor, bytes, at, bytes.length - at, null); if (!size) break; at += size; }
    if (at > bound) throw failure('HTTPS_CONFIGURATION_INVALID'); return bytes.subarray(0, at);
  } catch { throw failure('HTTPS_CONFIGURATION_INVALID'); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function originOf(value) {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw failure('HTTPS_CONFIGURATION_INVALID'); return url; }
  catch { throw failure('HTTPS_CONFIGURATION_INVALID'); }
}
function destination(origin, path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\#\r\n]/.test(path)) throw failure('HTTPS_REQUEST_INVALID');
  const value = new URL(path, origin); if (value.origin !== origin) throw failure('HTTPS_REQUEST_INVALID'); return value;
}

/** Volatile only: neither values nor authentication state are written to disk. */
export class CookieJar {
  #values = new Map();
  constructor(origin) { Object.defineProperty(this, 'origin', { value: originOf(origin).origin, enumerable: true }); }
  ingest(lines, path = '/') {
    const url = destination(this.origin, path), lastSlash = url.pathname.lastIndexOf('/'), defaultPath = lastSlash > 0 ? url.pathname.slice(0, lastSlash) : '/';
    for (const line of lines ?? []) {
      if (typeof line !== 'string' || line.length > 8192 || /[\r\n\0]/.test(line)) continue;
      const [pair, ...parts] = line.split(';'), split = pair.indexOf('='); if (split < 1) continue;
      const name = pair.slice(0, split).trim(), value = pair.slice(split + 1).trim(); if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) continue;
      const attrs = new Map(parts.map(part => { const at = part.indexOf('='); return [part.slice(0, at < 0 ? undefined : at).trim().toLowerCase(), at < 0 ? true : part.slice(at + 1).trim()]; }));
      const domain = typeof attrs.get('domain') === 'string' ? attrs.get('domain').replace(/^\./, '').toLowerCase() : url.hostname;
      if (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`)) continue;
      const cookiePath = typeof attrs.get('path') === 'string' && attrs.get('path').startsWith('/') ? attrs.get('path') : defaultPath;
      const age = attrs.get('max-age'); if (typeof age === 'string' && /^-?\d+$/.test(age) && !Number.isSafeInteger(Number(age))) continue;
      const expires = typeof age === 'string' && /^-?\d+$/.test(age) ? Date.now() + Number(age) * 1000
        : typeof attrs.get('expires') === 'string' && Number.isFinite(Date.parse(attrs.get('expires'))) ? Date.parse(attrs.get('expires')) : null;
      const key = `${domain}\n${cookiePath}\n${name}`;
      if (expires !== null && expires <= Date.now()) { this.#values.delete(key); continue; }
      this.#values.set(key, { name, value, domain, path: cookiePath, hostOnly: !attrs.has('domain'), secure: attrs.has('secure'), httpOnly: attrs.has('httponly'), sameSite: typeof attrs.get('samesite') === 'string' ? attrs.get('samesite').toLowerCase() : null, expires });
    }
  }
  #matching(path) {
    const url = destination(this.origin, path), now = Date.now();
    return [...this.#values.values()].filter(cookie => (cookie.expires === null || cookie.expires > now)
      && (cookie.hostOnly ? cookie.domain === url.hostname : cookie.domain === url.hostname || url.hostname.endsWith(`.${cookie.domain}`))
      && (url.pathname === cookie.path || url.pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : `${cookie.path}/`)))
      .sort((a, b) => b.path.length - a.path.length);
  }
  header(path = '/') { return this.#matching(path).map(cookie => `${cookie.name}=${cookie.value}`).join('; '); }
  get(name, path = '/') { const value = this.#matching(path).find(cookie => cookie.name === name); return value ? { ...value } : null; }
  clear() { this.#values.clear(); }
  toJSON() { return { volatile: true, cookies: this.#values.size }; }
  [inspect.custom]() { return this.toJSON(); }
}

/** TLS validation and hostname verification stay enabled, including with a private CA. */
export function createHTTPSClient(options) {
  if (!options || Object.keys(options).some(key => !['origin', 'caFile', 'basicUsername', 'basicPasswordFile', 'localLoopback', 'cookieJar'].includes(key))) throw failure('HTTPS_CONFIGURATION_INVALID');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw failure('HTTPS_CONFIGURATION_INVALID');
  const url = originOf(options.origin), origin = url.origin;
  if (options.localLoopback !== undefined && typeof options.localLoopback !== 'boolean') throw failure('HTTPS_CONFIGURATION_INVALID');
  if (options.localLoopback && !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+localhost$/i.test(url.hostname)) throw failure('HTTPS_CONFIGURATION_INVALID');
  let authorization, ca;
  if (options.basicUsername !== undefined || options.basicPasswordFile !== undefined) {
    if (!/^[A-Za-z0-9._-]{3,80}$/.test(options.basicUsername ?? '') || !options.basicPasswordFile) throw failure('HTTPS_CONFIGURATION_INVALID');
    let password; try { password = decodeStagingPassword(readBounded(options.basicPasswordFile, 1026)); } catch { throw failure('HTTPS_CONFIGURATION_INVALID'); }
    authorization = `Basic ${Buffer.from(`${options.basicUsername}:${password}`, 'utf8').toString('base64')}`;
  }
  if (options.caFile) { ca = readBounded(options.caFile, 512 * 1024); const text = ca.toString('ascii'); if (!text.includes('-----BEGIN CERTIFICATE-----') || text.includes('PRIVATE KEY')) throw failure('HTTPS_CONFIGURATION_INVALID'); }
  const jar = options.cookieJar ?? new CookieJar(origin); if (!(jar instanceof CookieJar) || jar.origin !== origin) throw failure('HTTPS_CONFIGURATION_INVALID');
  const lookup = options.localLoopback ? (hostname, settings, callback) => {
    if (hostname !== url.hostname) return callback(failure('HTTPS_REQUEST_INVALID'));
    if (settings.all) callback(null, [{ address: '127.0.0.1', family: 4 }]); else callback(null, '127.0.0.1', 4);
  } : undefined;
  let agent; try { agent = new Agent({ keepAlive: true, maxSockets: 4, rejectUnauthorized: true, minVersion: 'TLSv1.2', ca, proxyEnv: {} }); } catch { throw failure('HTTPS_CONFIGURATION_INVALID'); }
  const client = {
    origin, jar, basicConfigured: Boolean(authorization),
    request(path, input = {}) {
      return new Promise((resolve, reject) => {
        let target, method, body, headers, maxBytes, timeoutMs;
        try {
          target = destination(origin, path); method = input.method ?? 'GET';
          if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method) || Object.keys(input).some(key => !['method', 'headers', 'body', 'json', 'form', 'sendBasic', 'sendCookies', 'maxBytes', 'timeoutMs'].includes(key))) throw failure('HTTPS_REQUEST_INVALID');
          if ([input.body, input.json, input.form].filter(value => value !== undefined).length > 1) throw failure('HTTPS_REQUEST_INVALID');
          maxBytes = input.maxBytes ?? 2 * 1024 * 1024; timeoutMs = input.timeoutMs ?? 10000;
          if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw failure('HTTPS_REQUEST_INVALID');
          headers = { accept: '*/*', 'accept-encoding': 'identity' };
          for (const [name, value] of Object.entries(input.headers ?? {})) { const key = name.toLowerCase(); if (['host', 'authorization', 'cookie'].includes(key)) throw failure('HTTPS_REQUEST_INVALID'); headers[key] = value; }
          if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.origin ??= origin;
          if (authorization && input.sendBasic !== false) headers.authorization = authorization;
          if (input.sendCookies !== false && jar.header(path)) headers.cookie = jar.header(path);
          body = input.json !== undefined ? Buffer.from(JSON.stringify(input.json)) : input.form !== undefined ? Buffer.from(new URLSearchParams(input.form).toString()) : input.body !== undefined ? Buffer.from(input.body) : null;
          if (input.json !== undefined) headers['content-type'] ??= 'application/json';
          if (input.form !== undefined) headers['content-type'] ??= 'application/x-www-form-urlencoded';
          if (body) headers['content-length'] = String(body.length);
        } catch { reject(failure('HTTPS_REQUEST_INVALID')); return; }
        let settled = false, timer;
        const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
        let request;
        try { request = httpsRequest(target, { method, headers, agent, lookup, servername: isIP(url.hostname) ? undefined : url.hostname, rejectUnauthorized: true }, response => {
          const parts = []; let size = 0;
          response.on('error', () => finish(failure('HTTPS_TRANSPORT_FAILED')));
          response.on('aborted', () => finish(failure('HTTPS_TRANSPORT_FAILED')));
          response.on('data', bytes => { size += bytes.length; if (size > maxBytes) { request.destroy(failure('HTTPS_RESPONSE_TOO_LARGE')); return; } parts.push(bytes); });
          response.on('end', () => {
            const bytes = Buffer.concat(parts); jar.ingest(response.headers['set-cookie'], path);
            const value = { status: response.statusCode, headers: response.headers, body: bytes,
              text() { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw failure('HTTPS_UTF8_INVALID'); } },
              json() { try { return JSON.parse(value.text()); } catch { throw failure('HTTPS_JSON_INVALID'); } },
              toJSON() { return { status: response.statusCode, bytes: bytes.length }; }, [inspect.custom]() { return value.toJSON(); } };
            finish(null, value);
          });
        }); } catch { finish(failure('HTTPS_REQUEST_INVALID')); return; }
        request.on('error', error => finish(ownCodes.has(error.code) ? error : failure(error.code)));
        timer = setTimeout(() => request.destroy(failure('HTTPS_TIMEOUT')), timeoutMs); timer.unref();
        if (body) request.write(body); request.end();
      });
    },
    close() { agent.destroy(); jar.clear(); },
    toJSON() { return { tlsVerificationRequired: true, volatileCookies: true }; }, [inspect.custom]() { return client.toJSON(); },
  };
  return client;
}
export const requestHTTPS = (client, path, options) => client.request(path, options);
