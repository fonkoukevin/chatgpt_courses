import { spawnSync } from 'node:child_process';
import { start } from './runtime.mjs';
/** A read-only psql session, restricted to the exact labelled disposable database. */
export async function observationSql(database,env,stderr){
  if(!/^[a-f0-9]{64}$/.test(database?.id??'')||!database.runId)throw Error('OBSERVATION_OWNED_DB_REQUIRED');
  const ownership=spawnSync('docker',['inspect','--format','{{ index .Config.Labels "com.chatgptcourses.browser-run" }}',database.id],{env,windowsHide:true,encoding:'utf8',timeout:10000});
  if(ownership.status!==0||ownership.stdout.trim()!==database.runId)throw Error('OBSERVATION_DB_OWNERSHIP_REQUIRED');
  const child=start('docker',['exec','-i',database.id,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','browser_test','-d','courses_browser','-c','SET default_transaction_read_only=on','-f','-'],{env,stdio:['pipe','pipe',stderr]});
  let pending=null,buffer='',closed=false;
  const exited=new Promise(resolve=>child.once('close',code=>{closed=true;pending?.reject(Error('OBSERVATION_DB_SESSION_CLOSED'));pending=null;resolve(code);}));
  child.once('error',()=>{pending?.reject(Error('OBSERVATION_DB_SESSION_FAILED'));pending=null;});
  child.stdout.on('data',chunk=>{buffer+=chunk.toString('utf8');if(buffer.length>65536){pending?.reject(Error('OBSERVATION_DB_RESPONSE_BOUND'));pending=null;child.stdin.end();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;const current=pending;pending=null;if(!current)continue;try{current.resolve(JSON.parse(line));}catch{current.reject(Error('OBSERVATION_DB_JSON_REQUIRED'));}}});
  async function query(sql){
    if(closed||pending||!/^SELECT\s/iu.test(sql)||sql.replace(/;\s*$/u,'').includes(';')||/\b(?:INTO|UPDATE|DELETE|INSERT|ALTER|CREATE|DROP|FOR\s+UPDATE|FOR\s+SHARE)\b/iu.test(sql))throw Error('OBSERVATION_READ_ONLY_SELECT_REQUIRED');
    return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;reject(Error('OBSERVATION_DB_QUERY_TIMEOUT'));},15000);pending={resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};child.stdin.write(sql+'\n');});
  }
  const check=await query("SELECT jsonb_build_object('readOnly',current_setting('default_transaction_read_only')='on');");if(check.readOnly!==true)throw Error('OBSERVATION_DB_READ_ONLY_REQUIRED');
  return {query,async close(){if(!closed)child.stdin.end();const code=await exited;if(code!==0)throw Error('OBSERVATION_DB_CLOSE_NOT_CONFIRMED');}};
}
