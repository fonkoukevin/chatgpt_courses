import { join } from 'node:path';
import { environment, root, run, windows } from './lib/runtime.mjs';

const action = process.argv[2];
if (!['run', 'verify', 'start'].includes(action)) throw new Error('Action attendue : run, start ou verify.');
const env = environment({ loadLocal: action !== 'verify' });
if (action === 'verify') {
  // A local verification never borrows the developer's provider credentials or
  // background workers. Integration tests supply their own controlled settings.
  for (const key of Object.keys(env)) if (key.startsWith('STRIPE_')) delete env[key];
  Object.assign(env, { APP_ENV: 'test', SPRING_PROFILES_ACTIVE: 'test', STRIPE_ENABLED: 'false',
    REFUND_WORKER_ENABLED: 'false', PAYMENT_INBOX_ENABLED: 'false' });
}
if (action === 'run' || action === 'start') env.SPRING_PROFILES_ACTIVE ??= env.APP_ENV ?? 'local';
if (action === 'start') {
  run(env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java',
    ['-jar', join(root, 'apps/api/target/chatgpt-courses-api.jar'), '--debug=false'], { env });
  process.exit(0);
}
const args = action === 'run'
  ? ['spring-boot:run', '-Dspring-boot.run.arguments=--debug=false']
  : ['verify'];
const wrapper = join(root, 'apps/api', windows ? 'mvnw.cmd' : 'mvnw');
const executable = windows ? wrapper : 'sh';
const wrapperArguments = ['--batch-mode', '--no-transfer-progress', ...args];
run(executable,
  windows ? wrapperArguments : [wrapper, ...wrapperArguments],
  { cwd: join(root, 'apps/api'), env });
