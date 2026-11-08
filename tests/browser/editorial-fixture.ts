import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { expect, type APIRequestContext } from '@playwright/test';

export async function csrfHeaders(request: APIRequestContext) {
  const response = await request.get('/api/v1/auth/csrf');
  expect(response.status()).toBe(200);
  const body = await response.json() as { token: string; headerName: string };
  expect(body.headerName).toBe('X-CSRF-TOKEN');
  return { [body.headerName]: body.token };
}

// Privileged setup is only available for the disposable, labelled tmpfs
// database created by the browser supervisor. No application backdoor exists.
export async function createEditor(request: APIRequestContext) {
  const container = process.env.COURSES_BROWSER_DB_ID;
  const runId = process.env.COURSES_BROWSER_RUN_ID;
  if (process.env.APP_ENV !== 'test' || !container || !/^[a-f0-9]{64}$/.test(container) || !runId) {
    throw new Error('An isolated browser test database is required for privileged fixtures.');
  }
  const owner = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.chatgptcourses.browser-run" }}', container],
    { windowsHide: true, encoding: 'utf8', timeout: 10_000 });
  if (owner.status !== 0 || owner.stdout.trim() !== runId) throw new Error('Browser database ownership not confirmed.');
  const address = `p05.${randomUUID()}@example.invalid`;
  const password = `Test-${randomBytes(24).toString('base64url')}!`;
  const headers = await csrfHeaders(request);
  const response = await request.post('/api/v1/auth/register', { headers, data: { email: address, password, locale: 'fr' } });
  expect(response.status()).toBe(201);
  const account = await response.json() as { id: string };
  if (!/^[a-f0-9-]{36}$/.test(account.id)) throw new Error('Account UUID expected.');
  const grant = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'browser_test', '-d', 'courses_browser', '-At'], {
    windowsHide: true, encoding: 'utf8', timeout: 10_000,
    input: `INSERT INTO user_roles(id,user_id,role_id) SELECT gen_random_uuid(),'${account.id}',id FROM roles WHERE code='EDITOR' RETURNING id;\n`,
  });
  if (grant.status !== 0 || !/^[a-f0-9-]{36}\r?\nINSERT 0 1\s*$/.test(grant.stdout)) {
    throw new Error('The explicit editor fixture grant was not confirmed.');
  }
  return { address, password, id: account.id };
}

export async function loginEditor(request: APIRequestContext) {
  const account = await createEditor(request);
  const response = await request.post('/api/v1/auth/login', { headers: await csrfHeaders(request), form: { email: account.address, password: account.password } });
  expect(response.status()).toBe(200);
  return account;
}
