// Real ci-run CLI with synthetic log bytes and in-memory file/process adapters.
// Never starts Playwright, apt, a browser, Docker or a network request.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {basename} from 'node:path';

const scenario=JSON.parse(process.argv[2]),step=scenario.step??'browsers';
const runner=new URL('../../scripts/ci-run.mjs',import.meta.url);
const log=Buffer.from(scenario.large?('Installing dependencies...\n'+('SYNTHETIC_PRIVATE_PADDING\n'.repeat(120000))+'\nAn active lockfile is found at:\nSYNTHETIC_PRIVATE_PATH\n'):scenario.log??'');
const files=new Map(),writeDescriptor=424260,readDescriptor=424261;
let descriptorReads=0,bytesRead=0,readCalls=0,commandCount=0,logOpened=false,logClosed=false,invocationValid=false,environmentIsolated=false;
const original={readFileSync:fs.readFileSync,openSync:fs.openSync,closeSync:fs.closeSync,lstatSync:fs.lstatSync,fstatSync:fs.fstatSync,readSync:fs.readSync};
const isLog=path=>String(path).replaceAll('\\','/').endsWith('/.runtime/ci-private/e2e/'+step+'.log');
const stat=()=>({isFile:()=>!scenario.notRegular,isSymbolicLink:()=>scenario.symlink===true,nlink:scenario.hardlink?2:1,ino:100,dev:1,size:log.length});
Object.assign(fs,{
  mkdirSync(){},
  openSync(path,flags,...options){if(isLog(path)){if(flags==='w'){logOpened=true;return writeDescriptor;}descriptorReads++;return readDescriptor;}return original.openSync(path,flags,...options);},
  closeSync(fd){if(fd===writeDescriptor){logClosed=true;return;}if(fd!==readDescriptor)original.closeSync(fd);},
  lstatSync(path,...options){return isLog(path)?stat():original.lstatSync(path,...options);},
  fstatSync(fd,...options){if(fd!==readDescriptor)return original.fstatSync(fd,...options);const value=stat();if(scenario.changed&&readCalls)value.size++;return value;},
  readSync(fd,target,offset,length,position){if(fd!==readDescriptor)return original.readSync(fd,target,offset,length,position);if(scenario.readError)throw Error('SYNTHETIC_PRIVATE_READ_FAILURE');readCalls++;if(scenario.shortRead)return 0;const count=log.copy(target,offset,position,position+length);bytesRead+=count;return count;},
  readFileSync(path,...options){if(isLog(path))throw Error('UNBOUNDED_PRIVATE_LOG_READ_REFUSED');return original.readFileSync(path,...options);},
  writeFileSync(path,bytes){if(!String(path).replaceAll('\\','/').includes('/.runtime/ci-public/e2e/'))throw Error('UNEXPECTED_FILE_MUTATION');files.set(basename(String(path)),JSON.parse(String(bytes)));},
});
childProcess.spawnSync=(file,args,options)=>{
  commandCount++;
  invocationValid=file===process.execPath&&args.length===(step==='browsers'?4:1)&&(step==='browsers'?args[0].replaceAll('\\','/').endsWith('/node_modules/@playwright/test/cli.js')&&args.slice(1).join(',')==='install,--with-deps,chromium':args[0].replaceAll('\\','/').endsWith('/scripts/ci-smoke.mjs'))&&options.timeout===35*60*1000&&options.stdio[0]==='ignore'&&options.stdio[1]===writeDescriptor&&options.stdio[2]===writeDescriptor;
  environmentIsolated=!Object.values(options.env).includes('SYNTHETIC_INHERITED_PRIVATE')&&options.env.STRIPE_ENABLED==='false';
  return{status:scenario.spawnCode?null:scenario.exitCode??1,signal:scenario.signal??null,...(scenario.spawnCode?{error:{code:scenario.spawnCode,message:'SYNTHETIC_PRIVATE_MESSAGE',stack:'SYNTHETIC_PRIVATE_STACK'}}:{})};
};
syncBuiltinESMExports();
process.env.STRIPE_SECRET_KEY='SYNTHETIC_INHERITED_PRIVATE';
process.env.GITHUB_TOKEN='SYNTHETIC_INHERITED_PRIVATE';
process.argv=[process.execPath,fileURLToPath(runner),'e2e',step];
await import(runner.href);
console.log('CI_BROWSER_PROBE '+JSON.stringify({exitCode:process.exitCode??0,commandCount,invocationValid,environmentIsolated,logOpened,logClosed,descriptorReads,bytesRead,privateLogBytes:log.length,publicFiles:Object.fromEntries(files)}));
