// Loopback-only server in a distinct process: its idle socket can close while
// the test client is synchronously blocked. Never prints headers or bodies.
import { createServer } from 'node:http';

const status = Number(process.argv[2]);
if (![200, 401, 403].includes(status) || !process.send) throw new Error('HTTP_FIXTURE_ARGUMENTS_INVALID');
let connections = 0, resets = 0;
const identities = new WeakMap(), rows = [], timers = new Set();
const server = createServer((request, response) => {
  rows.push({ connection: identities.get(request.socket), closeRequested: request.headers.connection === 'close',
    syntheticAuthorizationMatched: request.headers.authorization === 'Bearer SYNTHETIC_RELEASE_HTTP_TOKEN_42' });
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Connection', request.headers.connection === 'close' ? 'close' : 'keep-alive');
  response.setHeader('Keep-Alive', 'timeout=60');
  response.writeHead(status);
  response.end(JSON.stringify(status === 200 ? { name: 'chatgpt_courses/web', package_type: 'container', owner: { login: 'fonkoukevin' },
    visibility: 'public', repository: { full_name: 'fonkoukevin/chatgpt_courses', private: false } } : { errors: [{ code: 'UNAUTHORIZED' }] }));
  if (rows.length === 1 && request.headers.connection !== 'close') {
    const socket = request.socket;
    const timer = setTimeout(() => { timers.delete(timer); resets++; socket.resetAndDestroy(); }, 100);
    timers.add(timer);
  }
});
server.on('connection', socket => { identities.set(socket, ++connections); socket.on('error', () => {}); });
process.on('message', message => {
  if (message === 'report') process.send({ connections, resets, rows });
  if (message === 'stop') {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections(); server.close(() => process.disconnect());
  }
});
// A crashed test cannot leave a fixture listening indefinitely.
process.on('disconnect', () => { server.closeAllConnections(); server.close(); });
setTimeout(() => { server.closeAllConnections(); server.close(); process.exitCode = 1; process.disconnect(); }, 15000).unref();
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
