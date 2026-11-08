import { environment } from './lib/runtime.mjs';
import { importLocalVideo } from './lib/video-import.mjs';

const [manifest, ...extra] = process.argv.slice(2);
if (!manifest || extra.length) throw new Error('Usage : npm run video:import -- chemin/manifest.json');
importLocalVideo(environment(), manifest);
