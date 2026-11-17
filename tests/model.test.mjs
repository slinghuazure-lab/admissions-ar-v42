import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('Android asset contains one complete 60s loop with valid skin and time accessors',()=>{
  const b=readFileSync(new URL('../public/models/v42-loop.glb',import.meta.url));assert.equal(b.subarray(0,4).toString(),'glTF');assert.equal(b.readUInt32LE(8),b.length);assert.ok(b.length<100*1024*1024);
  const n=b.readUInt32LE(12),d=JSON.parse(b.subarray(20,20+n).toString());assert.equal(d.animations.length,1);assert.equal(d.animations[0].name,'Exhibit_Loop');assert.equal(d.animations[0].channels.length,198);assert.ok(d.skins[0].joints.length>=60);
  const duration=Math.max(...d.animations[0].samplers.map(s=>d.accessors[s.input].max[0]));assert.ok(Math.abs(duration-60)<.001);
  for(const index of new Set(d.animations[0].samplers.map(s=>s.input))){const a=d.accessors[index],v=d.bufferViews[a.bufferView],start=28+n+(v.byteOffset||0)+(a.byteOffset||0);let previous=-1;for(let i=0;i<a.count;i++){const value=b.readFloatLE(start+i*4);assert.ok(value>=0&&value<=60.001&&value>previous);previous=value;}}
  for(const view of d.bufferViews)assert.ok((view.byteOffset||0)+view.byteLength<=d.buffers[0].byteLength);
});
test('iPhone asset is a packaged USDZ below the GitHub file limit',()=>{const b=readFileSync(new URL('../public/models/v42-loop.usdz',import.meta.url));assert.equal(b.readUInt32LE(0),0x04034b50);assert.ok(b.length<100*1024*1024);});
