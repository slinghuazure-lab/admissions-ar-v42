import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
const require=createRequire(import.meta.url);
let entry;try{entry=require.resolve('three');}catch{entry=createRequire(resolve('../ai-character-photo-booth/node_modules/package.json')).resolve('three');}
const {MeshoptDecoder}=await import(pathToFileURL(resolve(dirname(entry),'../examples/jsm/libs/meshopt_decoder.module.js')));
function parse(bytes){const size=bytes.readUInt32LE(12);return {json:JSON.parse(bytes.subarray(20,20+size)),bin:bytes.subarray(28+size)};}
test('camera compression preserves topology, skins, textures and the entire animation',async()=>{
  const source=parse(await readFile(new URL('../public/models/v42-loop.glb',import.meta.url))),packed=parse(await readFile(new URL('../public/models/v42-camera-meshopt.glb',import.meta.url)));
  await MeshoptDecoder.ready;
  for(const name of ['meshes','skins','nodes','animations','materials','textures','images'])assert.deepEqual(packed.json[name],source.json[name],name);
  assert.equal(packed.json.bufferViews.length,source.json.bufferViews.length);
  const geometry=new Set();
  for(const mesh of source.json.meshes)for(const p of mesh.primitives)for(const attrs of [p.attributes,...p.targets||[]])for(const key of ['POSITION','NORMAL']){const a=source.json.accessors[attrs[key]];if(a){if(a.bufferView!==undefined)geometry.add(a.bufferView);if(a.sparse)geometry.add(a.sparse.values.bufferView);}}
  for(let i=0;i<source.json.accessors.length;i++){
    const a={...source.json.accessors[i]},b={...packed.json.accessors[i]};delete a.min;delete a.max;delete b.min;delete b.max;assert.deepEqual(b,a,'accessor '+i);
  }
  let filtered=0;
  for(let i=0;i<packed.json.bufferViews.length;i++){
    const original=source.json.bufferViews[i],view=packed.json.bufferViews[i],ext=view.extensions?.EXT_meshopt_compression;
    const expected=source.bin.subarray(original.byteOffset||0,(original.byteOffset||0)+original.byteLength);
    let actual;
    if(ext){const output=new Uint8Array(ext.count*ext.byteStride);MeshoptDecoder.decodeGltfBuffer(output,ext.count,ext.byteStride,packed.bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);actual=Buffer.from(output).subarray(0,expected.length);}
    else actual=packed.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
    if(ext?.filter==='EXPONENTIAL'){
      assert.ok(geometry.has(i),'only geometry may use reduced precision');filtered++;
      for(let j=0;j<expected.length;j+=4)assert.ok(Math.abs(expected.readFloatLE(j)-actual.readFloatLE(j))<=.0001,'geometry bound '+i);
    }else assert.deepEqual(actual,expected,'lossless stream '+i);
  }
  assert.ok(filtered>0);assert.ok(packed.bin.length<source.bin.length*.55);
});
