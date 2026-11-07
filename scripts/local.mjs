import { composeArgs, localEnvironment, run } from './lib/runtime.mjs';

const action = process.argv[2];
const env = localEnvironment();
const commands = {
  up: ['up', '-d', '--wait'],
  stop: ['stop'],
  status: ['ps'],
  s3: ['--profile', 's3', 'up', '-d', '--wait'],
};
if (!commands[action]) throw new Error('Action attendue : up, stop, status ou s3.');
run('docker', [...composeArgs(env), ...commands[action]], { env });
