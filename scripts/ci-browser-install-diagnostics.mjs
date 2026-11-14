import {openSync,closeSync,lstatSync,fstatSync,readSync,constants as F} from 'node:fs';

// Observations from the private install log, never an inferred root cause.
// Registry/dependency/download wording is verified against pinned Playwright.
export const browserInstallPhases=Object.freeze(['SYSTEM_DEPENDENCIES','APT_REFRESH','APT_PACKAGES','REGISTRY_LOCK','BROWSER_DOWNLOAD']);
export const browserInstallCauses=Object.freeze(['PLAYWRIGHT_REGISTRY_LOCK_HELD','PLAYWRIGHT_REGISTRY_LOCK_COMPROMISED','APT_LOCK_HELD','APT_FETCH_FAILED','APT_PACKAGE_UNAVAILABLE','SYSTEM_DEPENDENCIES_FAILED','BROWSER_DOWNLOAD_FAILED','DOWNLOAD_HTTP_FAILED','DOWNLOAD_SIZE_MISMATCH','NETWORK_TIMEOUT','DNS_LOOKUP_FAILED','NETWORK_CONNECTION_FAILED','TLS_CERTIFICATE_FAILED','PERMISSION_DENIED','DISK_FULL','OUT_OF_MEMORY','INSTALL_FAILED']);
export const browserInstallErrnos=Object.freeze(['ELOCKED','ECOMPROMISED','EACCES','EPERM','EROFS','ENOENT','ENOSPC','ENOMEM','EAGAIN','EAI_AGAIN','ENOTFOUND','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','UND_ERR_CONNECT_TIMEOUT','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT']);
const MAXIMUM=1024*1024;
const spawnCodes=new Set(['ENOENT','EACCES','EPERM','ENOMEM','EAGAIN','ENOSPC','ETIMEDOUT']);
const signals=new Set(['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGSEGV']);
const property=(value,key)=>{try{return value?.[key];}catch{return undefined;}};
const empty=()=>({observedPhases:[],lastObservedPhase:'UNKNOWN',observedCauses:[],observedErrnos:[]});
const phasePatterns=[
  /^Installing dependencies\.\.\.[ \t]*$/gmu,
  /^(?:Hit|Get|Ign|Err):[0-9]+[ \t]+[^\r\n]{1,2000}[ \t](?:InRelease|Release(?:\.gpg)?)(?:[ \t]|$)/gmu,
  /^(?:Reading state information\.\.\.|Building dependency tree\.\.\.|The following (?:additional|NEW) packages will be installed:|Unpacking [^\r\n]{1,500}|Setting up [^\r\n]{1,500})/gmu,
  /An active lockfile is found at:|Lock file is already being held|Unable to update lock within the stale threshold/gu,
  /^Downloading [^\r\n]{1,250} from [^\r\n]{1,2000}/gmu,
];
const causePatterns=[
  /An active lockfile is found at:|Lock file is already being held/u,
  /Unable to update lock within the stale threshold|\bECOMPROMISED\b/u,
  /E: Could not get lock |E: Unable to acquire the dpkg frontend lock/u,
  /E: Failed to fetch |W: Failed to fetch |E: The repository [^\r\n]{1,2000}(?:does not have a Release file|is not signed)/u,
  /E: Unable to locate package |E: Package '[^'\r\n]{1,300}' has no installation candidate|E: Version '[^'\r\n]{1,300}' for '[^'\r\n]{1,300}' was not found/u,
  /Installation process exited with code: [1-9][0-9]*|Failed to install browser dependencies/u,
  /Download failure,|Failed to download [^\r\n]{1,300}|Download failed:/u,
  /Download failed: server returned code [1-5][0-9]{2}\b/u,
  /Download failed: size mismatch/u,
  /Request to [^\r\n]{1,2000} timed out after [0-9]{1,10}ms|\bETIMEDOUT\b|TLS handshake timeout|\bUND_ERR_CONNECT_TIMEOUT\b/u,
  /getaddrinfo (?:ENOTFOUND|EAI_AGAIN)|Temporary failure resolving|temporary failure in name resolution|\bEAI_AGAIN\b|\bENOTFOUND\b/u,
  /\bECONNRESET\b|\bECONNREFUSED\b|\bEPIPE\b|socket hang up/u,
  /certificate has expired|self[- ]signed certificate|unable to verify the first certificate|unable to get local issuer certificate|\bCERT_HAS_EXPIRED\b|\bERR_TLS_CERT_ALTNAME_INVALID\b|\bUNABLE_TO_VERIFY_LEAF_SIGNATURE\b|\bUNABLE_TO_GET_ISSUER_CERT_LOCALLY\b|\bSELF_SIGNED_CERT_IN_CHAIN\b|\bDEPTH_ZERO_SELF_SIGNED_CERT\b/iu,
  /\bEACCES\b|\bEPERM\b|\bEROFS\b/u,
  /no space left on device|\bENOSPC\b/iu,
  /cannot allocate memory|heap out of memory|\bENOMEM\b/iu,
  /Failed to install browsers/u,
];

export function classifyBrowserInstallLog(value){
  if(typeof value!=='string'||Buffer.byteLength(value)>MAXIMUM)return empty();
  // Strip formatting only. Neither the cleaned text nor any match is returned.
  const text=value.replace(new RegExp(String.fromCharCode(27)+'\\[[0-?]*[ -/]*[@-~]','gu'),'').replace(/\r\n/gu,'\n');
  const phases=[];
  for(let index=0;index<phasePatterns.length;index++){
    const pattern=new RegExp(phasePatterns[index].source,phasePatterns[index].flags);let match,last=-1;
    while((match=pattern.exec(text)))last=match.index;
    if(last>=0)phases.push({phase:browserInstallPhases[index],last});
  }
  phases.sort((a,b)=>a.last-b.last);
  const observedPhases=phases.map(item=>item.phase);
  return{observedPhases,lastObservedPhase:observedPhases.at(-1)??'UNKNOWN',observedCauses:browserInstallCauses.filter((_cause,index)=>causePatterns[index].test(text)),observedErrnos:browserInstallErrnos.filter(code=>new RegExp(`\\b${code}\\b`,'u').test(text))};
}

function readSample(path){
  let fd;
  try{
    const named=lstatSync(path);if(!named.isFile()||named.isSymbolicLink()||named.nlink!==1)return{logReadStatus:'UNAVAILABLE'};
    fd=openSync(path,F.O_RDONLY|(F.O_NOFOLLOW??0));const before=fstatSync(fd);
    if(!before.isFile()||before.nlink!==1||!Number.isSafeInteger(before.size)||before.size<0||before.ino!==named.ino||before.dev!==named.dev)return{logReadStatus:'UNAVAILABLE'};
    const read=(size,position)=>{const bytes=Buffer.alloc(size);let offset=0;while(offset<size){const count=readSync(fd,bytes,offset,size-offset,position+offset);if(count<=0)throw new Error('CI_BROWSER_LOG_READ_UNAVAILABLE');offset+=count;}return bytes;};
    let text,logReadStatus;
    if(before.size<=MAXIMUM){text=read(before.size,0).toString('utf8');logReadStatus='READ';}
    else{
      const half=Math.floor((MAXIMUM-2)/2),head=read(half,0).toString('utf8'),tail=read(half,before.size-half).toString('utf8');
      // Avoid treating the two truncated boundary fragments as complete lines.
      const tailStart=tail.indexOf('\n');text=head.slice(0,Math.max(0,head.lastIndexOf('\n')))+'\n'+(tailStart>=0?tail.slice(tailStart+1):'');logReadStatus='HEAD_TAIL';
    }
    const after=fstatSync(fd);if(after.ino!==before.ino||after.dev!==before.dev||after.nlink!==1||after.size!==before.size)return{logReadStatus:'UNAVAILABLE'};
    return{logReadStatus,text};
  }catch{return{logReadStatus:'UNAVAILABLE'};}
  finally{if(fd!==undefined)try{closeSync(fd);}catch{/* No raw filesystem error is public. */}}
}

export function readBrowserInstallSummary(path,result){
  const sample=readSample(path),code=property(property(result,'error'),'code'),signal=property(result,'signal');
  return{format:'browser-install-summary-v1',logReadStatus:sample.logReadStatus,...classifyBrowserInstallLog(sample.text),spawnCode:spawnCodes.has(code)?code:null,signal:signals.has(signal)?signal:null};
}

/** The collector can reject any extra field or non-enumerated value. */
export function validateBrowserInstallSummary(value){
  try{
    const keys=['format','logReadStatus','observedPhases','lastObservedPhase','observedCauses','observedErrnos','spawnCode','signal'];
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).toSorted().join(',')!==keys.toSorted().join(',')||value.format!=='browser-install-summary-v1'||!['READ','HEAD_TAIL','UNAVAILABLE'].includes(value.logReadStatus))return false;
    for(const[key,allowed]of[['observedPhases',browserInstallPhases],['observedCauses',browserInstallCauses],['observedErrnos',browserInstallErrnos]])if(!Array.isArray(value[key])||value[key].length>allowed.length||new Set(value[key]).size!==value[key].length||!value[key].every(item=>allowed.includes(item)))return false;
    if(value.lastObservedPhase!==(value.observedPhases.at(-1)??'UNKNOWN')||!(value.spawnCode===null||spawnCodes.has(value.spawnCode))||!(value.signal===null||signals.has(value.signal)))return false;
    return value.logReadStatus!=='UNAVAILABLE'||value.observedPhases.length===0&&value.observedCauses.length===0&&value.observedErrnos.length===0;
  }catch{return false;}
}
