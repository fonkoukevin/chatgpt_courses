import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {browserInstallPhases,browserInstallCauses,browserInstallErrnos,classifyBrowserInstallLog,validateBrowserInstallSummary} from '../../scripts/ci-browser-install-diagnostics.mjs';

const sentinel='SYNTHETIC_PRIVATE_NEVER_PUBLISH',probe=new URL('../fixtures/ci-browser-install-probe.mjs',import.meta.url);
function cli(scenario){
  const result=spawnSync(process.execPath,[fileURLToPath(probe),JSON.stringify(scenario)],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:65536});
  const line=result.stdout.split(/\r?\n/u).find(line=>line.startsWith('CI_BROWSER_PROBE '));assert.equal(Boolean(line),true,'real CLI probe must finish without raw diagnostics');
  assert.equal(result.stdout.includes(sentinel)||result.stderr.includes(sentinel),false);const value=JSON.parse(line.slice('CI_BROWSER_PROBE '.length));assert.equal(value.commandCount,1);assert.equal(value.invocationValid,true);assert.equal(value.environmentIsolated,true);assert.equal(value.logOpened&&value.logClosed,true);return value;
}
function summary(value){const result=value.publicFiles['browsers.json'];assert.equal(validateBrowserInstallSummary(result.browserInstall),true);return result;}

test('pinned Playwright source confirms the exact lock, dependency and download messages',()=>{
  assert.equal(JSON.parse(readFileSync(new URL('../../node_modules/playwright-core/package.json',import.meta.url),'utf8')).version,'1.65.0');
  const source=readFileSync(new URL('../../node_modules/playwright-core/lib/coreBundle.js',import.meta.url),'utf8');
  for(const token of['An active lockfile is found at:','Lock file is already being held','Unable to update lock within the stale threshold','Installing dependencies...','commands2.push("apt-get update")','Installation process exited with code:','Download failed: server returned code','Download failed: size mismatch','Request to ${params2.url} timed out after ${params2.socketTimeout}ms'])assert.equal(source.includes(token),true,'known pinned upstream wording must remain available');
});
test('only fixed observed phases/causes/errnos survive logs containing private URLs, paths and package names',()=>{
  const text=`Installing dependencies...\nGet:1 https://${sentinel}.invalid/repo synthetic InRelease [100 B]\nReading state information...\nE: Unable to locate package ${sentinel}\nDownloading Chromium synthetic from https://${sentinel}.invalid/browser.zip?token=${sentinel}\nError: Download failed: server returned code 503 body '${sentinel}'. URL: https://${sentinel}.invalid\nError: Request to https://${sentinel}.invalid timed out after 30000ms\ncode: 'CERT_HAS_EXPIRED'\nAn active lockfile is found at:\n /private/${sentinel}/__dirlock\ncode: 'ELOCKED'`;
  const result=classifyBrowserInstallLog(text);assert.equal(JSON.stringify(result).includes(sentinel),false);assert.equal(result.observedPhases.every(phase=>browserInstallPhases.includes(phase)),true);assert.deepEqual(result.observedPhases,['SYSTEM_DEPENDENCIES','APT_REFRESH','APT_PACKAGES','BROWSER_DOWNLOAD','REGISTRY_LOCK']);assert.equal(result.lastObservedPhase,'REGISTRY_LOCK');
  for(const cause of['APT_PACKAGE_UNAVAILABLE','BROWSER_DOWNLOAD_FAILED','DOWNLOAD_HTTP_FAILED','NETWORK_TIMEOUT','TLS_CERTIFICATE_FAILED','PLAYWRIGHT_REGISTRY_LOCK_HELD'])assert.equal(result.observedCauses.includes(cause),true);
  assert.deepEqual(result.observedErrnos,['ELOCKED','CERT_HAS_EXPIRED']);assert.equal(result.observedCauses.every(cause=>browserInstallCauses.includes(cause)),true);
});
test('elapsed time and Docker output cannot attribute a Playwright registry lock or installation phase',()=>{
  const unknown=classifyBrowserInstallLog('duration604976ms\nCannot connect to the Docker daemon\n'+sentinel);assert.deepEqual(unknown,{observedPhases:[],lastObservedPhase:'UNKNOWN',observedCauses:[],observedErrnos:[]});
  const formatted=classifyBrowserInstallLog(String.fromCharCode(27)+'[31mInstalling dependencies...'+String.fromCharCode(27)+'[0m\r\n');assert.deepEqual(formatted.observedPhases,['SYSTEM_DEPENDENCIES']);
});
test('the real browsers CLI preserves failure, exact command/timeout and private-log isolation',()=>{
  const value=cli({log:`Installing dependencies...\nAn active lockfile is found at:\n${sentinel}\nFailed to install browsers\n`,exitCode:1}),result=summary(value);
  assert.equal(value.exitCode,1);assert.equal(result.exitCode,1);assert.equal(result.result,'failed');assert.equal(result.browserInstall.logReadStatus,'READ');assert.equal(result.browserInstall.lastObservedPhase,'REGISTRY_LOCK');assert.equal(result.browserInstall.observedCauses.includes('PLAYWRIGHT_REGISTRY_LOCK_HELD'),true);assert.equal(value.descriptorReads,1);assert.equal(value.bytesRead,value.privateLogBytes);assert.deepEqual(Object.keys(value.publicFiles),['browsers.json']);
});
test('head/tail sampling is bounded and unavailable logs expose no purported observations',()=>{
  const large=cli({large:true}),sample=summary(large).browserInstall;assert.equal(sample.logReadStatus,'HEAD_TAIL');assert.equal(large.bytesRead<=1024*1024,true);assert.equal(large.privateLogBytes>1024*1024,true);assert.deepEqual(sample.observedPhases,['SYSTEM_DEPENDENCIES','REGISTRY_LOCK']);
  for(const change of[{symlink:true},{hardlink:true},{notRegular:true},{readError:true},{shortRead:true},{changed:true}]){const value=cli({...change,log:'An active lockfile is found at:\n'+sentinel}),result=summary(value);assert.equal(result.result,'failed');assert.equal(result.browserInstall.logReadStatus,'UNAVAILABLE');assert.deepEqual(result.browserInstall.observedPhases,[]);assert.deepEqual(result.browserInstall.observedCauses,[]);assert.deepEqual(result.browserInstall.observedErrnos,[]);}
});
test('native spawn timeout/errno and signal are finite, successful outcomes stay successful, other steps are untouched',()=>{
  const failed=summary(cli({log:sentinel,spawnCode:'ETIMEDOUT',signal:'SIGTERM'}));assert.equal(failed.result,'failed');assert.equal(failed.exitCode,null);assert.equal(failed.browserInstall.spawnCode,'ETIMEDOUT');assert.equal(failed.browserInstall.signal,'SIGTERM');
  const unknown=summary(cli({log:sentinel,spawnCode:sentinel,signal:sentinel}));assert.equal(unknown.browserInstall.spawnCode,null);assert.equal(unknown.browserInstall.signal,null);
  const passed=summary(cli({log:'Downloading Chromium synthetic from https://synthetic.invalid/archive\n',exitCode:0}));assert.equal(passed.result,'passed');assert.equal(passed.exitCode,0);
  const other=cli({step:'smoke',log:'An active lockfile is found at:\n'+sentinel});assert.equal(other.descriptorReads,0);assert.equal(Object.hasOwn(other.publicFiles['smoke.json'],'browserInstall'),false);
});
test('closed summary validation rejects unknown fields, enums, duplicates and inconsistent observations',()=>{
  const valid={format:'browser-install-summary-v1',logReadStatus:'READ',observedPhases:['REGISTRY_LOCK'],lastObservedPhase:'REGISTRY_LOCK',observedCauses:['PLAYWRIGHT_REGISTRY_LOCK_HELD'],observedErrnos:['ELOCKED'],spawnCode:null,signal:null};assert.equal(validateBrowserInstallSummary(valid),true);
  for(const change of[{extra:sentinel},{format:sentinel},{logReadStatus:sentinel},{observedPhases:[sentinel]},{observedCauses:[sentinel]},{observedErrnos:[sentinel]},{observedPhases:['REGISTRY_LOCK','REGISTRY_LOCK']},{lastObservedPhase:'UNKNOWN'},{spawnCode:sentinel},{signal:sentinel},{logReadStatus:'UNAVAILABLE'}])assert.equal(validateBrowserInstallSummary({...valid,...change}),false);
  assert.equal(validateBrowserInstallSummary(Object.defineProperty({},'format',{enumerable:true,get(){throw Error(sentinel);}})),false);assert.equal(browserInstallErrnos.includes('ELOCKED'),true);
});
