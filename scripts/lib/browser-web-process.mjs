import { join } from 'node:path';
import { root, run, environment } from './runtime.mjs';

// Keep a stable root-bearing supervisor command line. Next changes its own
// process.title on Unix, so the existing ownership guard cannot identify it
// directly. This wrapper stays in the owned process group and grants no new
// authority to stop processes. The synthetic public origin is separate from
// the loopback listener used by production-configuration verification.
const [port, ...extra] = process.argv.slice(2);
if (extra.length || !/^[1-9]\d{0,4}$/u.test(port ?? '') || Number(port) > 65535) throw new Error('BROWSER_WEB_LOOPBACK_PORT_REQUIRED');
run(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', port],
  { cwd: join(root, 'apps/web'), env: environment() });
