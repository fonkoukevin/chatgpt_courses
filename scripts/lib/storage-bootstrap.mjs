import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, run, windows } from './runtime.mjs';

// This main uses the same pinned SDK as the application, without starting Spring,
// Flyway, SMTP or HTTP. It only creates missing local buckets and their CORS rule.
export function bootstrapStorage(env) {
  for (const key of ['S3_ENDPOINT', 'S3_EXTERNAL_ENDPOINT', 'S3_REGION', 'S3_PUBLIC_BUCKET', 'S3_PRIVATE_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'APP_PUBLIC_ORIGIN']) {
    if (!env[key]?.trim()) throw new Error(`Configuration locale requise : ${key}. Aucune valeur affichée.`);
  }
  const jar = join(root, 'apps/api/target/chatgpt-courses-api.jar');
  if (!existsSync(jar)) throw new Error('Construire l’API avant storage:setup.');
  const java = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java';
  run(java, ['-Dloader.main=com.chatgptcourses.assets.storage.LocalStorageBootstrap', '-cp', jar,
    'org.springframework.boot.loader.launch.PropertiesLauncher'], { env });
}
