import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, fstatSync, readSync, constants as F } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { classifyImageBuildLog, imageBuildFailureCodes, safeImageBuildDiagnostic } from './release-diagnostics.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
function git(args, diagnostic) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim(); }
  catch (error) {
    diagnostic.exitCode = Number.isInteger(error.status) && error.status >= 0 && error.status <= 255 ? error.status : null;
    diagnostic.spawnCode = ['ENOENT', 'EACCES', 'EPERM', 'ENOMEM', 'EAGAIN', 'ENOSPC', 'ETIMEDOUT'].includes(error.code) ? error.code : null;
    if (typeof error.stderr === 'string') { diagnostic.observedCauses = classifyImageBuildLog(error.stderr); diagnostic.logReadStatus = 'READ'; }
    throw imageError('IMAGE_GIT_COMMAND_FAILED');
  }
}
function imageError(code) { return Object.assign(new Error(code), { code }); }
function observeBuildLog(path, diagnostic) {
  let fd;
  try {
    fd = openSync(path, F.O_RDONLY | (F.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd), maximum = 262144;
    if (!stat.isFile()) throw imageError('IMAGE_BUILD_FAILED');
    const length = Math.min(stat.size, maximum), bytes = Buffer.alloc(length);
    const read = readSync(fd, bytes, 0, length, Math.max(0, stat.size - length));
    diagnostic.logReadStatus = stat.size > maximum ? 'TAIL_ONLY' : 'READ';
    diagnostic.observedCauses = classifyImageBuildLog(bytes.subarray(0, read).toString('utf8'));
  } catch { diagnostic.logReadStatus = 'UNAVAILABLE'; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export async function buildImages({ commit, output, platform = 'linux/amd64', sourceUrl, diagnosticOutput }) {
  const diagnostic = { schemaVersion: 1, sourceCommit: commit, result: 'failed', service: null, phase: 'VALIDATION',
    failureCode: 'IMAGE_VALIDATION_FAILED', exitCode: null, signal: null, spawnCode: null, logReadStatus: 'NOT_READ', observedCauses: [] };
  try {
    if (!/^[a-f0-9]{40}$/u.test(commit) || git(['rev-parse', 'HEAD'], diagnostic) !== commit || !['linux/amd64', 'linux/arm64'].includes(platform)) throw imageError('IMAGE_SOURCE_OR_PLATFORM_INVALID');
    if (sourceUrl !== undefined && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(sourceUrl)) throw imageError('IMAGE_SOURCE_URL_INVALID');
    const inputs = ['apps/api/src/main', 'apps/api/Dockerfile', 'apps/api/pom.xml', 'apps/api/.mvn', 'apps/api/mvnw', 'apps/web/src', 'apps/web/Dockerfile', 'apps/web/next.config.ts', 'apps/web/package.json', 'apps/web/postcss.config.mjs', 'apps/web/tsconfig.json', 'references/design-tokens.css', 'scripts/container', 'package.json', 'package-lock.json', '.npmrc', '.dockerignore'];
    if (git(['status', '--porcelain', '--', ...inputs], diagnostic)) throw imageError('IMAGE_INPUTS_MUST_BE_COMMITTED');
    const directory = join(root, '.runtime', 'image-build-' + randomUUID()); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const report = { sourceCommit: commit, platform, images: {}, registryPublished: false, startedAt: new Date().toISOString() };
    for (const service of ['web', 'api']) {
      Object.assign(diagnostic, { service, phase: 'BUILD', failureCode: `IMAGE_${service.toUpperCase()}_BUILD_FAILED`, exitCode: null, signal: null, spawnCode: null, logReadStatus: 'NOT_READ', observedCauses: [] });
      console.log(JSON.stringify({ stage: 'building', service, sourceCommit: commit }));
      const tag = `courses-${service}:${commit}`, iid = join(directory, service + '.iid'), log = join(directory, service + '.log'), fd = openSync(log, 'w', 0o600);
      try {
        await new Promise((res, rej) => {
          const child = spawn('docker', ['build', '--pull', '--platform', platform, '--build-arg', `VCS_REF=${commit}`, ...(sourceUrl ? ['--label', `org.opencontainers.image.source=${sourceUrl}`] : []), '--iidfile', iid, '--tag', tag, '--file', `apps/${service}/Dockerfile`, '.'], { cwd: root, windowsHide: true, stdio: ['ignore', fd, fd] });
          child.once('error', error => { diagnostic.spawnCode = ['ENOENT', 'EACCES', 'EPERM', 'ENOMEM', 'EAGAIN', 'ENOSPC', 'ETIMEDOUT'].includes(error.code) ? error.code : null; rej(imageError('IMAGE_BUILD_START_FAILED')); });
          child.once('close', (code, signal) => {
            diagnostic.exitCode = Number.isInteger(code) && code >= 0 && code <= 255 ? code : null;
            diagnostic.signal = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV'].includes(signal) ? signal : null;
            if (code === 0) res(); else rej(imageError(`IMAGE_${service.toUpperCase()}_BUILD_FAILED`));
          });
        });
      } catch (error) { observeBuildLog(log, diagnostic); throw error; }
      finally { closeSync(fd); }
      diagnostic.phase = 'INSPECTION'; diagnostic.failureCode = 'IMAGE_INSPECTION_FAILED';
      const id = readFileSync(iid, 'utf8').trim(); if (!/^sha256:[a-f0-9]{64}$/u.test(id)) throw imageError('IMAGE_IDENTITY_INVALID');
      const inspected = JSON.parse(execFileSync('docker', ['image', 'inspect', id], { encoding: 'utf8', windowsHide: true }))[0];
      if (inspected.Config.Labels?.['org.opencontainers.image.revision'] !== commit) throw imageError('IMAGE_COMMIT_LABEL_INVALID');
      if (sourceUrl && inspected.Config.Labels?.['org.opencontainers.image.source'] !== sourceUrl) throw imageError('IMAGE_SOURCE_LABEL_INVALID');
      report.images[service] = { tag, imageId: id, sizeBytes: inspected.Size, user: inspected.Config.User, architecture: inspected.Architecture, registryDigest: null };
    }
    diagnostic.phase = 'OUTPUT'; diagnostic.service = null; diagnostic.failureCode = 'IMAGE_OUTPUT_FAILED';
    report.completedAt = new Date().toISOString(); writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ result: 'built', sourceCommit: commit, registryPublished: false })); return report;
  } catch (error) {
    if (imageBuildFailureCodes.includes(error.code)) diagnostic.failureCode = error.code;
    const safe = safeImageBuildDiagnostic(diagnostic, commit);
    if (diagnosticOutput && safe) {
      try { writeFileSync(diagnosticOutput, JSON.stringify(safe, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true }); }
      catch { /* A missing diagnostic cannot turn a failed build into success. */ }
    }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--commit', '--output', '--platform', '--source-url', '--diagnostic-output'].includes(args[i]) || !args[i + 1]) throw imageError('IMAGE_ARGUMENTS_INVALID');
      options[args[i] === '--source-url' ? 'sourceUrl' : args[i] === '--diagnostic-output' ? 'diagnosticOutput' : args[i].slice(2)] = args[i + 1];
    }
    if (command !== 'build' || !options.output) throw imageError('IMAGE_BUILD_COMMAND_REQUIRED');
    await buildImages(options);
  } catch (error) {
    console.error([...imageBuildFailureCodes, 'IMAGE_ARGUMENTS_INVALID', 'IMAGE_BUILD_COMMAND_REQUIRED'].includes(error.code) ? error.code : 'IMAGE_BUILD_FAILED');
    process.exitCode = 1;
  }
}
