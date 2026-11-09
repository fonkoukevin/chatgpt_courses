import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');
function requirePlan(condition, code) { if (!condition) throw new Error(code); }
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const fields = `request delete
resp_headers delete
user_id delete
err_trace delete
error delete
first_error delete
msg replace COURSES_PROXY_EVENT`;
function logger(name, namespace) {
  return ` log ${name} {
  include ${namespace}
  output stdout
  format filter {
   wrap json
   fields {
${fields.split('\n').map(line => `    ${line}`).join('\n')}
   }
  }
 }\n`;
}
function site(domain, name, upstream, files) {
  return `
${domain} {
 header {
  -Server
  Strict-Transport-Security "max-age=31536000"
  X-Content-Type-Options nosniff
  Referrer-Policy no-referrer
  X-Robots-Tag "noindex, nofollow, noarchive"
  Cache-Control no-store
 }
 ${files ? 'request_body {\n  max_size 10485760\n }' : '@api path /api/v1 /api/v1/*\n request_body @api {\n  max_size 65536\n }'}
 log ${name} {
  output stdout
  format filter {
   wrap json
   fields {
${fields.split('\n').map(line => `    ${line}`).join('\n')}
   }
  }
 }
 reverse_proxy ${upstream} {
  header_up -Forwarded
  header_up -X-Forwarded-For
  transport http {
   dial_timeout 3s
   response_header_timeout 35s
  }
 }
}
`;
}

/** Produces a candidate only. Never writes/reloads the shared proxy configuration. */
export function sharedCaddyCandidate(existing, { domain, filesDomain, expectedSha256 }) {
  requirePlan(typeof existing === 'string' && Buffer.byteLength(existing) <= 1024 * 1024 && /^[a-f0-9]{64}$/u.test(expectedSha256) && digest(existing) === expectedSha256, 'INGRESS_CURRENT_HASH_MISMATCH');
  requirePlan(domainPattern.test(domain) && domainPattern.test(filesDomain) && domain !== filesDomain && domain.startsWith('staging.') && filesDomain === `files-${domain}`, 'INGRESS_STAGING_DOMAINS_REQUIRED');
  requirePlan(!existing.toLowerCase().includes(domain) && !existing.toLowerCase().includes(filesDomain) && !/courses_stage(?:_files)?/u.test(existing), 'INGRESS_COURSES_ALREADY_PRESENT');
  const opening = /^(?:\uFEFF)?(?:(?:[ \t]*#[^\n]*|[ \t]*)\r?\n)*[ \t]*\{[ \t]*\r?\n/u.exec(existing);
  requirePlan(opening, 'INGRESS_FIRST_GLOBAL_BLOCK_REQUIRED');
  const global = logger('courses_stage_errors', 'http.log.error.courses_stage') + logger('courses_stage_files_errors', 'http.log.error.courses_stage_files');
  const suffix = site(domain, 'courses_stage', 'courses-staging-web:3000', false) + site(filesDomain, 'courses_stage_files', 'courses-staging-s3:8333', true);
  return existing.slice(0, opening[0].length) + global + existing.slice(opening[0].length) + suffix;
}

function adapt(container, input) {
  const result = spawnSync('docker', ['exec', '-i', container, 'caddy', 'adapt', '--config', '-', '--adapter', 'caddyfile'], { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000, windowsHide: true });
  requirePlan(!result.error && result.status === 0, 'INGRESS_CADDY_ADAPT_FAILED');
  return JSON.parse(result.stdout);
}
const canonical = value => JSON.stringify(value);
function hostRoutes(configuration) {
  return Object.values(configuration.apps?.http?.servers ?? {}).flatMap(server => server.routes ?? []).filter(route => route.match?.some(match => match.host?.length));
}
const namespacePrefix = (prefix, value) => value === prefix || value.startsWith(`${prefix}.`);
function namespaces(value, include) {
  if (value === undefined) return [];
  requirePlan(Array.isArray(value) && value.every(item => typeof item === 'string' && (include && item === '*' || /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/u.test(item))), 'INGRESS_LOGGER_NAMESPACE_POLICY_UNKNOWN');
  return value;
}
function receivesNamespace(logger, namespace) {
  requirePlan(logger && typeof logger === 'object' && !Array.isArray(logger), 'INGRESS_LOGGER_NAMESPACE_POLICY_UNKNOWN');
  const includes = namespaces(logger.include, true), excludes = namespaces(logger.exclude, false);
  const branches = includes.length ? includes : ['*'];
  return branches.some(include => {
    if (include !== '*' && !namespacePrefix(include, namespace) && !namespacePrefix(namespace, include)) return false;
    // A narrower include can still receive descendants of our namespace.
    const branch = include !== '*' && namespacePrefix(namespace, include) ? include : namespace;
    return !excludes.some(exclude => namespacePrefix(exclude, branch));
  });
}
export function inspectSharedCandidate(before, after) {
  const original = hostRoutes(before), candidate = hostRoutes(after);
  requirePlan(original.length > 0 && original.every(route => candidate.some(value => canonical(value) === canonical(route))), 'INGRESS_EXISTING_ROUTES_CHANGED');
  const logs = after.logging?.logs;
  requirePlan(logs && logs.default && typeof logs.default === 'object' && !Array.isArray(logs.default), 'INGRESS_DEFAULT_LOGGER_REQUIRED');
  requirePlan(logs.default.level !== 'DEBUG' && logs.default.level !== 'TRACE', 'INGRESS_DEBUG_LOGGING_UNSAFE');
  const owned = new Map(['courses_stage', 'courses_stage_files'].flatMap(name => [[name, `http.log.access.${name}`], [`${name}_errors`, `http.log.error.${name}`]]));
  for (const name of ['courses_stage', 'courses_stage_files']) {
    const runtimeNamespace = `http.log.error.${name}`, accessNamespace = `http.log.access.${name}`;
    for (const [item, namespace] of [[logs[name], accessNamespace], [logs[`${name}_errors`], runtimeNamespace]]) {
      const include = item && namespaces(item.include, true), exclude = item && namespaces(item.exclude, false);
      requirePlan(include?.length === 1 && include[0] === namespace && exclude.length === 0, 'INGRESS_NAMED_LOGGER_REQUIRED');
      const filters = item.encoder?.fields;
      requirePlan(item.encoder?.format === 'filter' && item.encoder?.wrap?.format === 'json'
        && ['request', 'resp_headers', 'user_id', 'err_trace', 'error', 'first_error'].every(field => filters?.[field]?.filter === 'delete')
        && filters?.msg?.filter === 'replace' && filters.msg.value === 'COURSES_PROXY_EVENT', 'INGRESS_PRIVATE_LOG_FILTER_REQUIRED');
    }
  }
  for (const [name, logger] of Object.entries(logs)) {
    if (owned.has(name)) continue;
    requirePlan([...owned.values()].every(namespace => !receivesNamespace(logger, namespace)), name === 'default' ? 'INGRESS_DEFAULT_LOGGER_DUPLICATION' : 'INGRESS_ADDITIONAL_LOGGER_DUPLICATION');
  }
  for (const server of Object.values(after.apps?.http?.servers ?? {})) requirePlan(!server.logs?.should_log_credentials, 'INGRESS_CREDENTIAL_LOGGING_UNSAFE');
  return { existingHostRoutesPreserved: original.length, candidateHostRoutes: candidate.length, namedAccessAndRuntimeFilters: true, defaultDuplicateLoggingExcluded: true, additionalDuplicateLoggingExcluded: true };
}

export function planSharedIngress(options) {
  const current = resolve(options.current), directory = resolve(options.outputDirectory);
  requirePlan(isAbsolute(options.current) && isAbsolute(options.outputDirectory) && realpathSync(current) === current && lstatSync(current).isFile() && !lstatSync(current).isSymbolicLink(), 'INGRESS_REGULAR_CURRENT_FILE_REQUIRED');
  requirePlan(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/u.test(options.caddyContainer), 'INGRESS_CONTAINER_INVALID');
  const existing = readFileSync(current, 'utf8'), content = sharedCaddyCandidate(existing, options);
  const checks = inspectSharedCandidate(adapt(options.caddyContainer, existing), adapt(options.caddyContainer, content));
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  writeFileSync(join(directory, 'Caddyfile.before'), existing, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(directory, 'Caddyfile.candidate'), content, { flag: 'wx', mode: 0o600 });
  const result = { result: 'prepared', originalSha256: digest(existing), candidateSha256: digest(content), ...checks, syntaxAdapted: true, provisionValidateExecuted: false, originalWritten: false, proxyReloaded: false, networkChanged: false, deployed: false };
  writeFileSync(join(directory, 'plan.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2), options = {}, names = { '--current': 'current', '--output-directory': 'outputDirectory', '--caddy-container': 'caddyContainer', '--domain': 'domain', '--files-domain': 'filesDomain', '--expected-sha256': 'expectedSha256' };
    requirePlan(command === 'plan' && args.length === 12, 'INGRESS_PLAN_ARGUMENTS_INVALID');
    for (let index = 0; index < args.length; index += 2) { requirePlan(names[args[index]] && args[index + 1] && options[names[args[index]]] === undefined, 'INGRESS_PLAN_ARGUMENTS_INVALID'); options[names[args[index]]] = args[index + 1]; }
    console.log(JSON.stringify(planSharedIngress(options)));
  } catch (error) { console.error(/^[A-Z_]{1,90}$/u.test(error.message) ? error.message : 'INGRESS_PLAN_FAILED'); process.exitCode = 1; }
}
