import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { environment, root, run, windows } from './lib/runtime.mjs';

const env = environment();
if (!['local', 'test'].includes(env.APP_ENV)) throw new Error('Import réservé à APP_ENV=local|test.');
const jar = join(root, 'apps/api/target/chatgpt-courses-api.jar');
if (!existsSync(jar)) throw new Error('Construire l’API avant cet import explicite.');
const java = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java';
run(java, ['-Dloader.main=com.chatgptcourses.editorial.importing.ContentImportMain', '-cp', jar,
  'org.springframework.boot.loader.launch.PropertiesLauncher', ...process.argv.slice(2)], { env });
