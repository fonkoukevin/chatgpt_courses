import{execFileSync,spawn}from'node:child_process';import{readFileSync,writeFileSync,mkdirSync,openSync,closeSync}from'node:fs';import{resolve,join}from'node:path';import{randomUUID}from'node:crypto';import{fileURLToPath}from'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();}
export async function buildImages({commit,output,platform='linux/amd64'}){
 if(!/^[a-f0-9]{40}$/.test(commit)||git(['rev-parse','HEAD'])!==commit||!['linux/amd64','linux/arm64'].includes(platform))throw new Error('IMAGE_SOURCE_OR_PLATFORM_INVALID');
 const inputs=['apps/api/src/main','apps/api/Dockerfile','apps/api/pom.xml','apps/api/.mvn','apps/api/mvnw','apps/web/src','apps/web/Dockerfile','apps/web/next.config.ts','apps/web/package.json','apps/web/postcss.config.mjs','apps/web/tsconfig.json','scripts/container','package.json','package-lock.json','.npmrc','.dockerignore'];
 if(git(['status','--porcelain','--',...inputs]))throw new Error('IMAGE_INPUTS_MUST_BE_COMMITTED');
 const directory=join(root,'.runtime','image-build-'+randomUUID());mkdirSync(directory,{recursive:true,mode:0o700});
 const report={sourceCommit:commit,platform,images:{},registryPublished:false,startedAt:new Date().toISOString()};
 for(const service of ['web','api']){
  console.log(JSON.stringify({stage:'building',service,sourceCommit:commit}));
  const tag=`courses-${service}:${commit}`,iid=join(directory,service+'.iid'),fd=openSync(join(directory,service+'.log'),'w',0o600);
  try{await new Promise((res,rej)=>{const child=spawn('docker',['build','--pull','--platform',platform,'--build-arg',`VCS_REF=${commit}`,'--iidfile',iid,'--tag',tag,'--file',`apps/${service}/Dockerfile`,'.'],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});child.once('error',()=>rej(new Error('IMAGE_BUILD_START_FAILED')));child.once('close',code=>code===0?res():rej(new Error(`IMAGE_${service.toUpperCase()}_BUILD_FAILED`)));});}finally{closeSync(fd);}
  const id=readFileSync(iid,'utf8').trim();if(!/^sha256:[a-f0-9]{64}$/.test(id))throw new Error('IMAGE_IDENTITY_INVALID');
  const inspected=JSON.parse(execFileSync('docker',['image','inspect',id],{encoding:'utf8',windowsHide:true}))[0];if(inspected.Config.Labels?.['org.opencontainers.image.revision']!==commit)throw new Error('IMAGE_COMMIT_LABEL_INVALID');
  report.images[service]={tag,imageId:id,sizeBytes:inspected.Size,user:inspected.Config.User,architecture:inspected.Architecture,registryDigest:null};
 }
 report.completedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({result:'built',sourceCommit:commit,registryPublished:false}));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const [command,...args]=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--commit','--output','--platform'].includes(args[i])||!args[i+1])throw new Error('IMAGE_ARGUMENTS_INVALID');options[args[i].slice(2)]=args[i+1];}if(command!=='build'||!options.output)throw new Error('IMAGE_BUILD_COMMAND_REQUIRED');await buildImages(options);}catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'IMAGE_BUILD_FAILED');process.exitCode=1;}}
