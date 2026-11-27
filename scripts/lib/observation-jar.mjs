import { readFileSync,readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export function observeApiJar(jar,classesDirectory){
  const data=readFileSync(jar),hash=bytes=>createHash('sha256').update(bytes).digest('hex');let end=-1;
  for(let index=data.length-22;index>=Math.max(0,data.length-65557);index--)if(data.readUInt32LE(index)===0x06054b50){end=index;break;}
  if(end<0)throw Error('OBSERVATION_JAR_DIRECTORY_REQUIRED');
  const classes=new Map();let offset=data.readUInt32LE(end+16);
  while(data.readUInt32LE(offset)===0x02014b50){
    const nameLength=data.readUInt16LE(offset+28),extraLength=data.readUInt16LE(offset+30),commentLength=data.readUInt16LE(offset+32);
    const name=data.subarray(offset+46,offset+46+nameLength).toString('utf8');
    if(name.startsWith('BOOT-INF/classes/com/chatgptcourses/')&&name.endsWith('.class')){
      const local=data.readUInt32LE(offset+42),method=data.readUInt16LE(offset+10),length=data.readUInt32LE(offset+20);
      const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28),compressed=data.subarray(start,start+length);
      const bytes=method===8?inflateRawSync(compressed):method===0?compressed:null;if(!bytes)throw Error('OBSERVATION_JAR_COMPRESSION_UNSUPPORTED');
      classes.set(name.slice('BOOT-INF/classes/'.length),hash(bytes));
    }
    offset+=46+nameLength+extraLength+commentLength;
  }
  let compared=0;const mismatches=[];
  function visit(directory,prefix=''){for(const entry of readdirSync(directory,{withFileTypes:true})){const relative=prefix+entry.name;if(entry.isDirectory())visit(join(directory,entry.name),relative+'/');else if(entry.isFile()&&relative.startsWith('com/chatgptcourses/')&&relative.endsWith('.class')){compared++;if(classes.get(relative)!==hash(readFileSync(join(directory,entry.name))))mismatches.push(relative);classes.delete(relative);}}}
  visit(classesDirectory);mismatches.push(...classes.keys());
  return {jarSha256:hash(data),applicationClassesCompared:compared,applicationClassesMatch:compared>0&&mismatches.length===0,mismatches};
}
