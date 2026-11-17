import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);let entry;try{entry=require.resolve('three');}catch{entry=createRequire(resolve('../ai-character-photo-booth/node_modules/package.json')).resolve('three');}
const {MeshoptDecoder}=await import(pathToFileURL(resolve(dirname(entry),'../examples/jsm/libs/meshopt_decoder.module.js')));
async function model(path){const b=await readFile(new URL(path,import.meta.url)),n=b.readUInt32LE(12),doc=JSON.parse(b.subarray(20,20+n)),bin=b.subarray(28+n);const views=[];await MeshoptDecoder.ready;
for(const v of doc.bufferViews){const e=v.extensions?.EXT_meshopt_compression;if(e){const data=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(data,e.count,e.byteStride,bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);views.push(Buffer.from(data));}else views.push(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));}return {b,doc,views};}
const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},bytes={5121:1,5123:2,5125:4,5126:4};
function accessor(m,id){const a=m.doc.accessors[id],v=m.doc.bufferViews[a.bufferView],w=size[a.type]*bytes[a.componentType],data=m.views[a.bufferView],out=Buffer.alloc(a.count*w);for(let i=0;i<a.count;i++)data.copy(out,i*w,(a.byteOffset||0)+i*(v.byteStride||w),(a.byteOffset||0)+i*(v.byteStride||w)+w);return out;}
test('lightweight model keeps the complete rig, morph target order and all three animation sequences',async()=>{
const source=await model('../public/models/v42-loop.glb'),lite=await model('../public/models/v42-camera-lite.glb');assert.ok(lite.b.length<4*1024*1024);assert.ok(lite.doc.extras.cameraPreview.preview_triangles<lite.doc.extras.cameraPreview.source_triangles*.25);
assert.deepEqual(lite.doc.nodes,source.doc.nodes);assert.equal(lite.doc.skins.length,source.doc.skins.length);
for(let i=0;i<source.doc.skins.length;i++){assert.deepEqual(lite.doc.skins[i].joints,source.doc.skins[i].joints);assert.deepEqual(accessor(lite,lite.doc.skins[i].inverseBindMatrices),accessor(source,source.doc.skins[i].inverseBindMatrices));}
assert.deepEqual(lite.doc.animations[0].channels,source.doc.animations[0].channels);assert.equal(lite.doc.animations[0].samplers.length,source.doc.animations[0].samplers.length);
for(let i=0;i<source.doc.animations[0].samplers.length;i++)for(const key of ['input','output'])assert.deepEqual(accessor(lite,lite.doc.animations[0].samplers[i][key]),accessor(source,source.doc.animations[0].samplers[i][key]));
for(let i=0;i<lite.doc.meshes.length;i++)for(let j=0;j<lite.doc.meshes[i].primitives.length;j++){
const p=lite.doc.meshes[i].primitives[j],old=source.doc.meshes[i].primitives[j],count=lite.doc.accessors[p.attributes.POSITION].count;assert.equal(p.targets?.length||0,old.targets?.length||0);
for(const id of Object.values(p.attributes))assert.equal(lite.doc.accessors[id].count,count);
for(const target of p.targets||[]){assert.ok(target.POSITION!==undefined);assert.equal(lite.doc.accessors[target.POSITION].count,count);}
const a=lite.doc.accessors[p.indices],raw=accessor(lite,p.indices);for(let k=0;k<a.count;k++)assert.ok((a.componentType===5123?raw.readUInt16LE(k*2):raw.readUInt32LE(k*4))<count);
}
});
