import { defineConfig } from '@playwright/test';
import { resolve,relative,isAbsolute } from 'node:path';
const origin=process.env.COURSES_BROWSER_ORIGIN,runtime=process.env.COURSES_OBSERVATION_RUNTIME;
if(process.env.APP_ENV!=='test'||!origin||!runtime||!process.env.COURSES_BROWSER_IPC||!process.env.COURSES_BROWSER_TOKEN)throw Error('Owned observation supervisor required');
const url=new URL(origin),child=relative(resolve('.runtime'),resolve(runtime));
if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!child||child.startsWith('..')||isAbsolute(child))throw Error('Loopback owned runtime required');
export default defineConfig({testDir:'.',testMatch:'refund-lease.observation.spec.ts',workers:1,retries:0,forbidOnly:true,timeout:900000,globalTimeout:1100000,
  outputDir:resolve(runtime,'playwright-output'),reporter:[['json',{outputFile:resolve(runtime,'playwright-results.private.json')}]],expect:{timeout:10000},
  use:{baseURL:origin,trace:'off',video:'off',screenshot:'off',actionTimeout:10000,navigationTimeout:20000}});
