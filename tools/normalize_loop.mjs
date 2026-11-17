import {readFile,writeFile} from 'node:fs/promises';
const path=process.argv[2];if(!path)throw new Error('Usage: node tools/normalize_loop.mjs model.glb');
const bytes=await readFile(path),length=bytes.readUInt32LE(12),document=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
if(document.animations.length!==1)throw new Error('Exactly one complete loop is required');
const indices=[...new Set(document.animations[0].samplers.map(s=>s.input))];
const max=Math.max(...indices.map(index=>document.accessors[index].max[0]));
for(const index of indices){const a=document.accessors[index],v=document.bufferViews[a.bufferView];if(a.componentType!==5126||a.type!=='SCALAR')throw new Error('Expected float times');
  const offset=28+length+(v.byteOffset||0)+(a.byteOffset||0);
  for(let i=0;i<a.count;i++)bytes.writeFloatLE(bytes.readFloatLE(offset+i*4)*60/max,offset+i*4);
  a.min=a.min.map(x=>x*60/max);a.max=a.max.map(x=>x*60/max);
}
let json=Buffer.from(JSON.stringify(document));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const binary=bytes.subarray(28+length),header=Buffer.alloc(20),chunk=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);chunk.writeUInt32LE(binary.length);chunk.writeUInt32LE(0x004e4942,4);
await writeFile(path,Buffer.concat([header,json,chunk,binary]));console.log(`Normalized ${max.toFixed(6)}s → 60s; all animation channels retained.`);
