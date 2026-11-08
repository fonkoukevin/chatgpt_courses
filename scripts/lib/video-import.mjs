import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { root, run, windows } from './runtime.mjs';

export function importLocalVideo(env, manifest) {
  if (!['local', 'test'].includes(env.APP_ENV) || env.VIDEO_ENABLED !== 'true' || env.VIDEO_PROVIDER !== 'local-test') throw new Error('Import vidéo réservé au fournisseur local-test explicitement activé en local/test.');
  const jar = join(root, 'apps/api/target/chatgpt-courses-api.jar');
  if (!existsSync(jar) || !env.VIDEO_LOCAL_ROOT || !isAbsolute(env.VIDEO_LOCAL_ROOT)) throw new Error('Build API et VIDEO_LOCAL_ROOT privé absolu requis.');
  const file = realpathSync(resolve(root, manifest));
  const java = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java';
  run(java, ['-Dloader.main=com.chatgptcourses.media.importing.LocalVideoImportMain', '-cp', jar,
    'org.springframework.boot.loader.launch.PropertiesLauncher', file], { env });
}
