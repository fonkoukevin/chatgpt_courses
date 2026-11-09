import {parseEnv} from 'node:util';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const image=/^[a-z0-9][a-z0-9.:/_-]+@sha256:[a-f0-9]{64}$/;
const keys=new Set(['COMPOSE_PROJECT_NAME','APP_ENV','PUBLIC_DOMAIN','APP_PUBLIC_ORIGIN','POSTGRES_DB','WEB_IMAGE','API_IMAGE','SECRETS_DIR','APP_DEFAULT_LOCALE','APP_PUBLISHED_LOCALES','HTTP_BIND','HTTP_PORT','HTTPS_PORT','STAGING_BASIC_USERNAME']);
export const secretFiles=['postgres-admin-password','postgres-owner-password','postgres-app-password','outbox-key'];
export function validateDeployment(env,{isolated=false,checkFiles=true}={}){
 const fail=code=>{throw new Error(code);};
 if(Object.keys(env).some(key=>!keys.has(key)))fail('DEPLOYMENT_UNKNOWN_VARIABLE');
 if(!['staging','production'].includes(env.APP_ENV))fail('DEPLOYMENT_ENVIRONMENT_REQUIRED');
 if(!/^courses-(?:staging|production|p20-[a-f0-9-]{8,36})$/.test(env.COMPOSE_PROJECT_NAME??''))fail('DEPLOYMENT_PROJECT_INVALID');
 if(!isolated&&env.COMPOSE_PROJECT_NAME!==`courses-${env.APP_ENV}`)fail('DEPLOYMENT_PROJECT_ENVIRONMENT_MISMATCH');
 for(const name of ['WEB_IMAGE','API_IMAGE'])if(!image.test(env[name]??'')&&!(isolated&&/^sha256:[a-f0-9]{64}$/.test(env[name]??'')))fail(`DEPLOYMENT_${name}_DIGEST_REQUIRED`);
 if(!/^[a-z][a-z0-9_]{2,62}$/.test(env.POSTGRES_DB??''))fail('DEPLOYMENT_DATABASE_INVALID');
 if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(env.PUBLIC_DOMAIN??'')||!env.PUBLIC_DOMAIN.includes('.'))fail('DEPLOYMENT_DOMAIN_INVALID');
 if(!isolated&&/\.(?:invalid|example|localhost|test)$/.test(env.PUBLIC_DOMAIN))fail('DEPLOYMENT_REAL_DOMAIN_REQUIRED');
 let origin;try{origin=new URL(env.APP_PUBLIC_ORIGIN);}catch{fail('DEPLOYMENT_ORIGIN_INVALID');}
 if(origin.protocol!=='https:'||origin.hostname!==env.PUBLIC_DOMAIN||origin.username||origin.password||!['','/'].includes(origin.pathname)||origin.search||origin.hash)fail('DEPLOYMENT_ORIGIN_DOMAIN_MISMATCH');
 if(!['fr','en'].includes(env.APP_DEFAULT_LOCALE??'fr')||!/^$|^(?:fr|en)(?:,(?:fr|en))?$/.test(env.APP_PUBLISHED_LOCALES??''))fail('DEPLOYMENT_LOCALES_INVALID');
 const locales=(env.APP_PUBLISHED_LOCALES??'').split(',').filter(Boolean);if(new Set(locales).size!==locales.length||env.APP_ENV==='staging'&&locales.length)fail('DEPLOYMENT_INDEXING_NOT_ALLOWED');
 for(const key of ['HTTP_PORT','HTTPS_PORT'])if(env[key]!==undefined&&(!/^\d+$/.test(env[key])||Number(env[key])<1||Number(env[key])>65535))fail('DEPLOYMENT_PORT_INVALID');
 if(env.HTTP_BIND!==undefined&&!['0.0.0.0','127.0.0.1'].includes(env.HTTP_BIND))fail('DEPLOYMENT_BIND_INVALID');
 if(!isAbsolute(env.SECRETS_DIR??''))fail('DEPLOYMENT_ABSOLUTE_SECRETS_DIRECTORY_REQUIRED');
 if(isolated){const child=relative(resolve('.runtime'),resolve(env.SECRETS_DIR));if(!env.PUBLIC_DOMAIN.endsWith('.localhost')||env.HTTP_BIND!=='127.0.0.1'||!child||child.startsWith('..')||isAbsolute(child))fail('DEPLOYMENT_ISOLATED_SCOPE_INVALID');}
 if(env.APP_ENV==='staging'&&!/^[A-Za-z0-9._-]{3,80}$/.test(env.STAGING_BASIC_USERNAME??''))fail('DEPLOYMENT_STAGING_USERNAME_INVALID');
 if(checkFiles){const directory=lstatSync(env.SECRETS_DIR);if(!directory.isDirectory()||directory.isSymbolicLink()||process.platform==='linux'&&(directory.mode&0o077)!==0)fail('DEPLOYMENT_SECRETS_DIRECTORY_MUST_BE_PRIVATE');for(const name of [...secretFiles,...(env.APP_ENV==='staging'?['staging-basic-password']:[])]){
   const path=resolve(env.SECRETS_DIR,name);let stat,bytes;try{stat=lstatSync(path);bytes=readFileSync(path);}catch{fail('DEPLOYMENT_SECRET_FILE_MISSING');}
   if(!stat.isFile()||stat.isSymbolicLink()||bytes.length<24||bytes.length>512||/[\r\n\0]/.test(bytes.toString('utf8')))fail('DEPLOYMENT_SECRET_FILE_INVALID');
   if(name==='outbox-key'&&Buffer.from(bytes.toString('utf8'),'base64').length!==32)fail('DEPLOYMENT_OUTBOX_KEY_INVALID');
  }}
 return {environment:env.APP_ENV,project:env.COMPOSE_PROJECT_NAME,digestImages:true,httpsOrigin:true,secretsChecked:checkFiles,isolated,commerceEnabled:false};
}
export function loadDeployment(file,releaseFile){
 const env=parseEnv(readFileSync(file,'utf8'));
 if(releaseFile){const release=parseEnv(readFileSync(releaseFile,'utf8'));if(Object.keys(release).some(key=>!['APP_ENV','WEB_IMAGE','API_IMAGE'].includes(key))||env.APP_ENV&&release.APP_ENV&&env.APP_ENV!==release.APP_ENV)throw new Error('DEPLOYMENT_RELEASE_OVERRIDE_INVALID');Object.assign(env,release);}
 return env;
}
export function validateCli(args){
 const values={};for(let i=0;i<args.length;i+=2){if(!['--env-file','--release-file','--environment','--project'].includes(args[i])||!args[i+1]||values[args[i]])throw new Error('DEPLOYMENT_ARGUMENTS_INVALID');values[args[i]]=args[i+1];}
 const env=loadDeployment(values['--env-file'],values['--release-file']);
 if(env.APP_ENV!==values['--environment']||env.COMPOSE_PROJECT_NAME!==values['--project'])throw new Error('DEPLOYMENT_TARGET_MISMATCH');
 return validateDeployment(env);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{if(process.argv[2]!=='validate')throw new Error('DEPLOYMENT_COMMAND_INVALID');console.log(JSON.stringify(validateCli(process.argv.slice(3))));}catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'DEPLOYMENT_CONFIGURATION_INVALID');process.exitCode=1;}}
