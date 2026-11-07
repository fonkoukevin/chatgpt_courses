import { join } from 'node:path';
import { environment, root, run } from './lib/runtime.mjs';

const action = process.argv[2];
if (!['dev', 'start', 'build'].includes(action)) throw new Error('Action attendue : dev, start ou build.');
const options = action === 'build' ? [] : ['--hostname', '127.0.0.1'];
run(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), action, ...options],
  { cwd: join(root, 'apps/web'), env: environment() });
