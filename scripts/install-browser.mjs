import { join } from 'node:path';
import { environment, root, run } from './lib/runtime.mjs';

// Explicit setup command: pinned dependency, isolated browser cache, no npx.
run(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'install', 'chromium'],
  { env: environment() });
