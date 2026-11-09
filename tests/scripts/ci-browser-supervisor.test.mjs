import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, terminateOwned } from '../../scripts/lib/runtime.mjs';

// This is a real Linux process-group test. The synthetic Next executable changes
// its title exactly like Next; no app listener, build or provider is started.
if (process.platform === 'linux') test('a root-bearing supervisor can stop its own title-changing child without relaxing ownership checks', async () => {
  const parent = join(root, '.runtime/ci-supervisor-tests'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'case-'));
  const lib = join(directory, 'scripts/lib'); mkdirSync(lib, { recursive: true });
  mkdirSync(join(directory, 'apps/web'), { recursive: true }); mkdirSync(join(directory, 'node_modules/next/dist/bin'), { recursive: true });
  for (const name of ['runtime.mjs', 'browser-web-process.mjs']) copyFileSync(join(root, 'scripts/lib', name), join(lib, name));
  writeFileSync(join(directory, 'node_modules/next/dist/bin/next'), `
    if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['start','--hostname','127.0.0.1','--port','31999'])) process.exit(3);
    process.title='next-server (synthetic)';
    console.log(JSON.stringify({pid:process.pid,titleChanged:process.title==='next-server (synthetic)'}));
    setInterval(()=>{},1000);
  `);
  let child, stopped = false;
  try {
    child = spawn(process.execPath, [join(lib, 'browser-web-process.mjs'), '31999'], { detached: true, env: { ...process.env, APP_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise(resolve => child.once('exit', resolve));
    const observed = await new Promise((resolve, reject) => {
      let output = ''; const timer = setTimeout(() => reject(new Error('SYNTHETIC_SUPERVISOR_NOT_READY')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', bytes => { output += bytes; if (output.includes('\n')) { clearTimeout(timer); try { resolve(JSON.parse(output.trim())); } catch { reject(new Error('SYNTHETIC_SUPERVISOR_ACK_INVALID')); } } });
    });
    assert.equal(observed.titleChanged, true);
    assert.equal(readFileSync(`/proc/${observed.pid}/cmdline`, 'utf8').includes(root), false);
    assert.equal(readFileSync(`/proc/${child.pid}/cmdline`, 'utf8').includes(root), true);
    stopped = await terminateOwned(child.pid, true); assert.equal(stopped, true); await exited;
  } finally {
    if (child && !stopped) await terminateOwned(child.pid, true);
    // The test created this exact temporary directory beneath the workspace.
    if (!directory.startsWith(parent + '/case-')) throw new Error('SUPERVISOR_TEST_CLEANUP_OUTSIDE_ROOT');
    rmSync(directory, { recursive: true, force: true });
  }
});
