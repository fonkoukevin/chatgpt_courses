// Run the real supervisor with in-memory adapters. No server/process/container,
// environment file, application data or provider is accessed by this fixture.
import fs from 'node:fs';
import net from 'node:net';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { sanitizeBrowserSession } from '../../scripts/ci-sanitize.mjs';

const scenario = JSON.parse(process.argv[2]), runner = new URL('../../scripts/verify-browser.mjs', import.meta.url);
const attempts = [], children = new Map(), adaptersLoaded = []; let session, nextPid = 9876000;
const contamination = 'SYNTHETIC_PRIVATE_MESSAGE_sk_test_ABC';
const fail = stage => { attempts.push(stage); if (scenario.fail === stage) throw Object.assign(new Error(contamination), { code: scenario.code ?? 'UNTRUSTED_PRIVATE_CODE' }); };
const originalRead = fs.readFileSync, originalOpen = fs.openSync, originalClose = fs.closeSync, originalExists = fs.existsSync;
Object.assign(fs, { existsSync: path => String(path).includes('synthetic-workspace') || originalExists(path), mkdirSync() {},
  openSync: (path, ...args) => String(path).includes('synthetic-workspace') ? 424260 : originalOpen(path, ...args),
  closeSync: fd => { if (fd !== 424260) originalClose(fd); }, copyFileSync() {}, chmodSync() {},
  writeFileSync(path, value) { if (String(path).endsWith('session.json')) session = JSON.parse(String(value)); },
  readFileSync(path, ...args) { if (!String(path).endsWith('.mjs')) throw new Error('FIXTURE_PRIVATE_READ_REFUSED'); return originalRead(path, ...args); } });
net.createServer = () => Object.assign(new EventEmitter(), { listening: false,
  listen(_path, callback) { this.listening = true; queueMicrotask(callback); },
  close(callback) { try { fail('CONTROL_SERVER'); this.listening = false; callback(); } catch (error) { callback(error); } } });
childProcess.spawn = childProcess.spawnSync = () => { throw new Error('FIXTURE_REAL_PROCESS_REFUSED'); };
globalThis.fetch = async () => { throw new Error('FIXTURE_REAL_FETCH_REFUSED'); };
process.kill = (target, signal) => {
  if (signal !== 0) throw new Error('FIXTURE_REAL_SIGNAL_REFUSED');
  const child = children.get(Math.abs(target)), present = target < 0 ? child?.groupPresent : child?.leaderPresent;
  if (!present) throw Object.assign(new Error(contamination), { code: 'ESRCH' });
  return true;
};
const database = { stopped: false }, services = [{ kind: 's3', stopped: false }, { kind: 'mailpit', stopped: false }];
const adapters = {
  runtime: { root: '/synthetic-workspace', runtimeDir: '/synthetic-workspace/.runtime', windows: false,
    environment: () => ({ APP_ENV: 'test', SYNTHETIC_PRIVATE: contamination }), preflightServers: async () => {}, waitFor: async () => {},
    start(_file, args) {
      const kind = args[0] === '-jar' ? 'API' : args[0].endsWith('browser-web-process.mjs') ? 'WEB' : 'PLAYWRIGHT';
      const child = Object.assign(new EventEmitter(), { pid: ++nextPid, kind, exitCode: null, signalCode: null, leaderPresent: true, groupPresent: true }); children.set(child.pid, child);
      if (kind === 'PLAYWRIGHT') queueMicrotask(() => { child.exitCode = 0; child.leaderPresent = false; child.groupPresent = scenario.fail === 'PROCESS_PLAYWRIGHT'; child.emit('exit', 0, null); });
      return child;
    },
    terminateOwned: async pid => { const child = children.get(pid), stage = 'PROCESS_' + child.kind; attempts.push(stage);
      if (scenario.fail === stage) return false;
      if (child.leaderPresent) { child.leaderPresent = false; child.groupPresent = false; child.signalCode = 'SIGTERM'; child.emit('exit', null, 'SIGTERM'); }
      return true;
    } },
  database: { createBrowserDatabase: async (_env, _directory, _run, created) => { created(database); return database; },
    stopBrowserDatabase: () => { fail('DATABASE_STOP'); database.stopped = true; }, observeBrowserDatabase: () => ({ available: true }) },
  services: { createBrowserServices: async (_env, _directory, _run, created) => { created(services); return services; },
    observeBrowserStorage: () => ({ available: true }), setBrowserServicePaused() {},
    stopBrowserService: record => { fail('SERVICE_' + record.kind.toUpperCase() + '_STOP'); record.stopped = true; } },
  payments: { createBrowserPayments: async () => ({ stop: async () => fail('PROVIDER_STOP'), observation: () => ({ stopped: true }) }) },
  stripe: { assertExternalStripeListenerIsolation() {}, createBrowserExternalStripe: () => { throw new Error('FIXTURE_EXTERNAL_PROVIDER_REFUSED'); } },
  endpoint: { createBrowserControlEndpoint: () => ({ path: '/synthetic-control.sock', cleanup: () => fail('CONTROL_ENDPOINT') }) },
};
globalThis.__COURSES_BROWSER_CLEANUP_FIXTURE__ = adapters;
const modules = { './lib/runtime.mjs': 'runtime', './lib/browser-database.mjs': 'database', './lib/browser-services.mjs': 'services', './lib/browser-payments.mjs': 'payments', './lib/browser-stripe-external.mjs': 'stripe', './lib/browser-control-endpoint.mjs': 'endpoint' };
registerHooks({ resolve(specifier, context, next) { if (modules[specifier]) adaptersLoaded.push({ name: modules[specifier], matched: context.parentURL === runner.href }); return context.parentURL === runner.href && modules[specifier] ? { url: 'cleanup-fixture:' + modules[specifier], shortCircuit: true } : next(specifier, context); },
  load(url, context, next) { if (!url.startsWith('cleanup-fixture:')) return next(url, context); const name = url.slice('cleanup-fixture:'.length), names = Object.keys(adapters[name]);
    return { format: 'module', source: `const adapter=globalThis.__COURSES_BROWSER_CLEANUP_FIXTURE__.${name};export const {${names.join(',')}}=adapter;`, shortCircuit: true }; } });
syncBuiltinESMExports();
process.argv = [process.execPath, fileURLToPath(runner), 'P19'];
const log = console.log; console.log = () => {};
let supervisorRejected = false, fixtureFailure = null;
try { await import(runner.href); } catch (error) { supervisorRejected = true; fixtureFailure = { type: ['Error', 'TypeError', 'SyntaxError', 'AggregateError'].includes(error?.name) ? error.name : 'OTHER',
  code: ['ERR_MODULE_NOT_FOUND', 'ERR_INVALID_URL_SCHEME', 'ERR_INVALID_ARG_TYPE', 'ERR_UNSUPPORTED_ESM_URL_SCHEME'].includes(error?.code) ? error.code : null,
  functionUnavailable: /not a function/u.test(error?.message ?? ''), privateReadRefused: error?.message === 'FIXTURE_PRIVATE_READ_REFUSED' }; }
console.log = log;
console.log('CI_CLEANUP_PROBE ' + JSON.stringify({ supervisorRejected, fixtureFailure, adaptersLoaded, attempts, starts: children.size, session: sanitizeBrowserSession(session), realOperationsPerformed: false }));
