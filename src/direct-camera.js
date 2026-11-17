import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {coverCrop,photoSize} from '../public/camera-utils.js';
export async function createOverlay(container,model,onProgress=()=>{},onScale=()=>{}){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);camera.position.z=5;
  scene.add(new THREE.HemisphereLight(0xffffff,0xa8ad8d,2.5));const light=new THREE.DirectionalLight(0xfff5dd,3);light.position.set(3,6,5);scene.add(light);
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const load=url=>loader.loadAsync(url,event=>onProgress(event.total?Math.min(99,Math.round(event.loaded/event.total*100)):null));
  let gltf;try{try{gltf=await load(model.glb);}catch(error){if(!model.fallbackGlb)throw error;gltf=await load(model.fallbackGlb);}}catch{renderer.dispose();throw new Error('模型暫時無法下載，請確認網路後重新整理。');}
  const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());gltf.scene.position.sub(center);
  const actor=new THREE.Group();actor.add(gltf.scene);scene.add(actor);const mixer=new THREE.AnimationMixer(gltf.scene),clip=gltf.animations[0];
  if(!clip){renderer.dispose();throw new Error('此模型尚未提供循環動畫，請聯絡展場人員。');}mixer.clipAction(clip).setLoop(THREE.LoopRepeat,Infinity).play();
  let zoom=1,x=.68,y=.58,paused=false,disposed=false,last=performance.now();
  const apply=()=>{const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;const aspect=width/height;camera.left=-aspect;camera.right=aspect;camera.updateProjectionMatrix();actor.scale.setScalar(.9/(size.y||1)*zoom);actor.position.set((x-.5)*2*aspect,(.5-y)*2,0);};
  const resize=new ResizeObserver(()=>{renderer.setSize(container.clientWidth,container.clientHeight);apply();});container.replaceChildren(renderer.domElement);renderer.setSize(container.clientWidth,container.clientHeight);resize.observe(container);apply();
  renderer.domElement.setAttribute('aria-label','可拖曳及縮放的循環角色');renderer.domElement.dataset.animation=clip.name;renderer.domElement.dataset.duration=String(clip.duration);
  const draw=()=>renderer.render(scene,camera);renderer.setAnimationLoop(now=>{const dt=document.hidden||paused?0:Math.min((now-last)/1000,.1);last=now;if(!disposed){mixer.update(dt);draw();}});
  const pointers=new Map();let previous;
  const measurement=()=>{const p=[...pointers.values()];if(p.length===1)return {x:p[0].x,y:p[0].y};if(p.length>=2)return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)};};
  renderer.domElement.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});renderer.domElement.setPointerCapture(e.pointerId);previous=measurement();});
  renderer.domElement.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=measurement();if(previous){x=THREE.MathUtils.clamp(x+(next.x-previous.x)/container.clientWidth,.1,.9);y=THREE.MathUtils.clamp(y+(next.y-previous.y)/container.clientHeight,.15,.85);if(next.distance&&previous.distance){zoom=THREE.MathUtils.clamp(zoom*next.distance/previous.distance,.45,1.6);onScale(zoom);}apply();}previous=next;});
  for(const type of ['pointerup','pointercancel'])renderer.domElement.addEventListener(type,e=>{pointers.delete(e.pointerId);previous=measurement();});
  return {
    setScale(value){zoom=THREE.MathUtils.clamp(value,.45,1.6);apply();},setPaused(value){paused=!!value;},
    capture(video,mirror=false){
      const rect=container.getBoundingClientRect(),output=photoSize(rect.width,rect.height,devicePixelRatio||1),canvas=document.createElement('canvas');canvas.width=output.width;canvas.height=output.height;
      const context=canvas.getContext('2d'),crop=coverCrop(video.videoWidth,video.videoHeight,output.width,output.height);
      context.save();if(mirror){context.translate(output.width,0);context.scale(-1,1);}context.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,output.width,output.height);context.restore();
      // Copy immediately after rendering instead of retaining the WebGL buffer.
      draw();context.drawImage(renderer.domElement,0,0,output.width,output.height);return canvas;
    },
    dispose(){if(disposed)return;disposed=true;renderer.setAnimationLoop(null);resize.disconnect();mixer.stopAllAction();const textures=new Set(),materials=new Set(),geometries=new Set();gltf.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const mat of Array.isArray(node.material)?node.material:[node.material])if(mat){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});for(const value of [...textures,...materials,...geometries])value.dispose();renderer.dispose();renderer.domElement.remove();}
  };
}
