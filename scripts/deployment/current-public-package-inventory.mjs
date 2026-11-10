// GET-only diagnostic for one fixed public test package. No CLI activity on import.
// No local env loading, persistent token, Docker, SSH, mutation or token fallback.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const target = Object.freeze({ owner: 'fonkoukevin', name: 'chatgpt_courses-private/web',
  sourceRepository: 'fonkoukevin/chatgpt_courses', diagnosticRepository: 'fonkoukevin/chatgpt_courses',
  versionId: 1538137158, digest: 'sha256:1eab5f2bc954e4736bf3f2c83286f0c0b99035d411b2ad35c4cb36da30df43db',
  tag: 'sha-8138ae03fede797087224c72efa2a50c856e01dd-42877515322-1' });
const encoded = encodeURIComponent(target.name), api = 'https://api.github.com';
const metadataNamed = `${api}/users/${target.owner}/packages/container/${encoded}`;
const metadataUser = `${api}/user/packages/container/${encoded}`;
const versionsBase = `${metadataUser}/versions`;
const maximumPages = 10, perPage = 100, maximumBodyBytes = 524288;
const failureCodes = new Set(['BODY_NOT_APPROVED', 'BODY_LIMIT', 'PAGINATION_NOT_APPROVED', 'PAGINATION_BOUND_EXCEEDED',
  'PACKAGE_IDENTITY_OR_BOUND_MISMATCH', 'VERSION_IDENTITY_OR_BOUND_MISMATCH', 'READ_CAPABILITY_OR_RESOURCE_UNAVAILABLE',
  'DIAGNOSTIC_JOB_CONTEXT_REQUIRED', 'PUBLIC_DIAGNOSTIC_REPOSITORY_REQUIRED', 'CURRENT_DIAGNOSTIC_BRANCH_REQUIRED',
  'METADATA_SNAPSHOT_CHANGED', 'KNOWN_TARGET_MISMATCH', 'VERSION_PAGE_NOT_APPROVED',
  'DUPLICATE_VERSION_OR_SNAPSHOT_CHANGED', 'KNOWN_TARGET_NOT_ACTIVE', 'READ_OR_REPORT_UNAVAILABLE']);
const hash = value => createHash('sha256').update(value).digest('hex');
const validId = value => Number.isSafeInteger(value) && value > 0;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/u.test(value)
  && Number.isFinite(Date.parse(value)) ? value : null;
const stop = code => { const error = new Error(code); error.inventoryCode = code; throw error; };

async function readJson(response) {
  if (!['application/json', 'application/vnd.github+json'].includes(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase())) stop('BODY_NOT_APPROVED');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d{1,9}$/u.test(length) || Number(length) > maximumBodyBytes)) stop('BODY_LIMIT');
  const reader = response.body?.getReader(); if (!reader) stop('BODY_NOT_APPROVED');
  const parts = []; let bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
      if (bytes > maximumBodyBytes) stop('BODY_LIMIT'); parts.push(Buffer.from(part.value)); }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))); }
    catch { stop('BODY_NOT_APPROVED'); }
  } finally { try { await reader.cancel(); } catch { /* No raw transport output. */ } reader.releaseLock(); }
}
function packageFacts(value) {
  if (!validId(value?.id) || value.name !== target.name || value.package_type !== 'container' || value.owner?.login !== target.owner
    || value.visibility !== 'public' || value.repository?.full_name !== target.sourceRepository || value.repository?.private !== false
    || !Number.isSafeInteger(value.version_count) || value.version_count < 1 || value.version_count > maximumPages * perPage) stop('PACKAGE_IDENTITY_OR_BOUND_MISMATCH');
  return { id: value.id, name: target.name, owner: target.owner, sourceRepository: target.sourceRepository,
    visibility: 'public', versionCount: value.version_count, createdAt: timestamp(value.created_at), updatedAt: timestamp(value.updated_at) };
}
function versionFacts(value, state) {
  const tags = value?.metadata?.container?.tags;
  if (!validId(value?.id) || !/^sha256:[a-f0-9]{64}$/u.test(value.name ?? '') || value.metadata?.package_type !== 'container'
    || !Array.isArray(tags) || tags.length > 100 || !tags.every(tag => typeof tag === 'string' && Buffer.byteLength(tag) <= 128)) stop('VERSION_IDENTITY_OR_BOUND_MISMATCH');
  const unexpected = tags.filter(tag => tag !== target.tag);
  return { id: value.id, digest: value.name, state, createdAt: timestamp(value.created_at), updatedAt: timestamp(value.updated_at),
    deletedAt: timestamp(value.deleted_at), tagsCount: tags.length,
    tags: [...(tags.includes(target.tag) ? [{ value: target.tag, expected: true }] : []),
      ...(unexpected.length ? [{ sha256: hash(JSON.stringify(unexpected)), redacted: true, count: unexpected.length }] : [])],
    exactKnownTarget: value.id === target.versionId && value.name === target.digest && tags.length === 1 && tags[0] === target.tag };
}
function linksForPage(header, state, page) {
  if (!header) return false;
  if (header.length > 8192) stop('PAGINATION_NOT_APPROVED');
  const relations = new Map();
  for (const part of header.split(',')) {
    const match = /^\s*<([^<>]+)>;\s*rel="(next|last|prev|first)"\s*$/u.exec(part);
    if (!match || relations.has(match[2])) stop('PAGINATION_NOT_APPROVED');
    let url; try { url = new URL(match[1], versionsBase); } catch { stop('PAGINATION_NOT_APPROVED'); }
    if (url.origin !== api || url.pathname !== new URL(versionsBase).pathname || url.username || url.password || url.hash
      || [...url.searchParams.keys()].toSorted().join(',') !== 'page,per_page,state' || url.searchParams.get('state') !== state
      || url.searchParams.get('per_page') !== String(perPage) || !/^[1-9]\d*$/u.test(url.searchParams.get('page') ?? '')) stop('PAGINATION_NOT_APPROVED');
    const destination = Number(url.searchParams.get('page'));
    if (destination > maximumPages) stop('PAGINATION_BOUND_EXCEEDED');
    if (match[2] === 'next' && destination !== page + 1 || match[2] === 'last' && destination < page
      || match[2] === 'prev' && destination !== page - 1 || match[2] === 'first' && destination !== 1) stop('PAGINATION_NOT_APPROVED');
    relations.set(match[2], destination);
  }
  if (!relations.has('next') && (relations.get('last') ?? page) > page) stop('PAGINATION_NOT_APPROVED');
  return relations.has('next');
}
export async function inspectCurrentPublicPackage(env, { request = fetch, record = () => {} } = {}) {
  const report = { schemaVersion: 1, operation: 'READ_ONLY_PUBLIC_PACKAGE_INVENTORY', result: 'in-progress', stage: 'CONTEXT',
    target, observedAt: new Date().toISOString(), requests: [], package: null, exactVersion: null,
    active: [], deleted: [], activePages: 0, deletedPages: 0, complete: false,
    onlyKnownActiveVersionObserved: false, packageAdminRoleVerified: false, deletionAuthorized: false, mutationExecuted: false };
  const persist = () => record(structuredClone(report));
  const call = async (url, route, state = null, page = null) => {
    const row = { route, state, page, status: null, requestId: null }; report.requests.push(row); persist();
    let response;
    try {
      response = await request(url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2026-03-10' } });
      row.status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      const requestId = response.headers.get('x-github-request-id');
      if (typeof requestId === 'string' && /^[A-Fa-f0-9:]{1,100}$/u.test(requestId)) row.requestId = requestId;
      persist();
      if (response.status !== 200) stop('READ_CAPABILITY_OR_RESOURCE_UNAVAILABLE');
      return { value: await readJson(response), link: response.headers.get('link') };
    } finally { try { if (response?.body && !response.body.locked) await response.body.cancel(); } catch { /* No raw transport output. */ } }
  };
  try {
    const branch = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/p21/private-package-preflight' ? 'p21/private-package-preflight'
      : env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REF === 'refs/heads/main' ? 'main' : null;
    if (env.GITHUB_REPOSITORY !== target.diagnosticRepository || !branch || !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? '')
      || typeof env.GITHUB_TOKEN !== 'string' || env.GITHUB_TOKEN.length < 20 || env.GITHUB_TOKEN.length > 4096
      || /\s/u.test(env.GITHUB_TOKEN) || Array.from(env.GITHUB_TOKEN).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) stop('DIAGNOSTIC_JOB_CONTEXT_REQUIRED');
    const repo = (await call(`${api}/repos/${target.diagnosticRepository}`, 'DIAGNOSTIC_REPOSITORY')).value;
    if (repo.full_name !== target.diagnosticRepository || repo.private !== false || repo.visibility !== 'public' || repo.fork !== false || repo.default_branch !== 'main') stop('PUBLIC_DIAGNOSTIC_REPOSITORY_REQUIRED');
    const currentBranch = (await call(`${api}/repos/${target.diagnosticRepository}/branches/${encodeURIComponent(branch)}`, 'DIAGNOSTIC_BRANCH')).value;
    if (currentBranch.name !== branch || currentBranch.commit?.sha !== env.GITHUB_SHA) stop('CURRENT_DIAGNOSTIC_BRANCH_REQUIRED');
    report.stage = 'METADATA'; persist();
    report.package = packageFacts((await call(metadataNamed, 'NAMED_OWNER_METADATA')).value);
    const counterpart = packageFacts((await call(metadataUser, 'AUTHENTICATED_USER_METADATA')).value);
    if (counterpart.id !== report.package.id || counterpart.versionCount !== report.package.versionCount) stop('METADATA_SNAPSHOT_CHANGED');
    report.exactVersion = versionFacts((await call(`${metadataNamed}/versions/${target.versionId}`, 'EXACT_VERSION')).value, 'known-target');
    if (!report.exactVersion.exactKnownTarget) stop('KNOWN_TARGET_MISMATCH');
    const seen = new Set();
    for (const state of ['active', 'deleted']) {
      report.stage = state === 'active' ? 'ACTIVE_INVENTORY' : 'DELETED_INVENTORY'; persist();
      for (let page = 1; page <= maximumPages; page++) {
        const row = await call(`${versionsBase}?state=${state}&per_page=${perPage}&page=${page}`, 'AUTHENTICATED_USER_VERSIONS', state, page);
        if (!Array.isArray(row.value) || row.value.length > perPage) stop('VERSION_PAGE_NOT_APPROVED');
        for (const value of row.value) { const facts = versionFacts(value, state);
          if (seen.has(facts.id)) stop('DUPLICATE_VERSION_OR_SNAPSHOT_CHANGED');
          if (seen.size >= maximumPages * perPage) stop('PAGINATION_BOUND_EXCEEDED');
          seen.add(facts.id); report[state].push(facts); }
        report[`${state}Pages`] = page; persist();
        const hasNext = linksForPage(row.link, state, page);
        if (!hasNext) break;
        if (page === maximumPages || row.value.length === 0) stop('PAGINATION_BOUND_EXCEEDED');
      }
    }
    report.stage = 'VERIFY_SNAPSHOT'; persist();
    const final = packageFacts((await call(metadataNamed, 'FINAL_NAMED_OWNER_METADATA')).value);
    if (final.id !== report.package.id || final.versionCount !== report.package.versionCount || report.active.length !== final.versionCount) stop('METADATA_SNAPSHOT_CHANGED');
    if (!report.active.some(value => value.exactKnownTarget)) stop('KNOWN_TARGET_NOT_ACTIVE');
    report.onlyKnownActiveVersionObserved = report.active.length === 1 && report.active[0].exactKnownTarget && report.deleted.length === 0;
    report.stage = 'COMPLETE'; report.complete = true; report.result = 'passed';
    report.limits = ['Snapshot reads are not an atomic inventory or a compare-and-delete precondition.',
      'GET200 and packages:read or write do not prove a package admin role.',
      'Creation/update timestamps do not identify a visibility-changing actor or event.',
      'Unexpected tag contents are hashed, never copied to the receipt.', 'This report authorizes no mutation.'];
  } catch (error) {
    report.result = 'blocked'; report.failureCode = failureCodes.has(error.inventoryCode) ? error.inventoryCode : 'READ_OR_REPORT_UNAVAILABLE';
  }
  persist(); return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.version !== 'v24.22.2' || process.argv.length !== 2) {
    console.log(JSON.stringify({ result: 'blocked', code: 'INVENTORY_PINNED_NODE_NO_ARGUMENTS_REQUIRED' })); process.exitCode = 1;
  }
  else {
    try {
      const result = await inspectCurrentPublicPackage(process.env);
      const directory = resolve('.runtime/registry-inventory'); mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'inventory.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
      console.log(JSON.stringify({ result: result.result, code: result.failureCode ?? 'INVENTORY_COMPLETE' })); if (!result.complete) process.exitCode = 1;
    } catch { console.log(JSON.stringify({ result: 'blocked', code: 'INVENTORY_REPORT_WRITE_UNAVAILABLE' })); process.exitCode = 1; }
  }
}
