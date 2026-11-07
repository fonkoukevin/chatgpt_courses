import { join } from 'node:path';
import { environment, loopbackPort, root, run } from './lib/runtime.mjs';

const action = process.argv[2];
if (!['dev', 'start', 'build'].includes(action)) throw new Error('Action attendue : dev, start ou build.');
const env = environment();
const options = action === 'build' ? []
  : ['--hostname', '127.0.0.1', '--port', String(loopbackPort(env.APP_PUBLIC_ORIGIN, 'APP_PUBLIC_ORIGIN'))];
run(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), action, ...options],
  { cwd: join(root, 'apps/web'), env });
