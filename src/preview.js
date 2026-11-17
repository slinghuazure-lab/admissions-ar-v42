import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export async function preview(container,model,onProgress,options={}){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,200);
  scene.add(new THREE.HemisphereLight(0xffffff,0xa8ad8d,2.5));const light=new THREE.DirectionalLight(0xfff5dd,3);light.position.set(3,6,5);scene.add(light);
  let gltf;
  try{gltf=await new GLTFLoader().loadAsync(model.glb,event=>onProgress(event.total?`載入模型 ${Math.round(event.loaded/event.total*100)}%`:'正在載入模型…'));}
  catch(error){renderer.dispose();throw error;}
  const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  gltf.scene.position.sub(center);scene.add(gltf.scene);const span=Math.max(size.x,size.y,size.z)||1;
  camera.position.set(span*.15,span*.12,span*2.1);camera.lookAt(0,0,0);camera.near=span/100;camera.far=span*20;camera.updateProjectionMatrix();
  container.replaceChildren(renderer.domElement);renderer.domElement.setAttribute('aria-label','可拖曳旋轉的模型動畫預覽');
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=span;controls.maxDistance=span*4;
  const mixer=new THREE.AnimationMixer(gltf.scene);if(gltf.animations[0])mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopRepeat,Infinity).play();
  if(Number.isFinite(options.time))mixer.setTime(options.time);
  const resize=new ResizeObserver(()=>{const width=container.clientWidth,height=container.clientHeight;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();});resize.observe(container);
  let last=performance.now();function frame(now){const dt=document.hidden||options.paused?0:Math.min((now-last)/1000,.1);last=now;mixer.update(dt);controls.update();renderer.render(scene,camera);}renderer.setAnimationLoop(frame);
  window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);resize.disconnect();controls.dispose();scene.traverse(node=>{node.geometry?.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(!mat)continue;for(const item of Object.values(mat))if(item?.isTexture)item.dispose();mat.dispose();}});renderer.dispose();},{once:true});
  // Exposed on the canvas for automated animation/asset validation, not a simulated preview.
  renderer.domElement.dataset.animation=gltf.animations[0]?.name||'';renderer.domElement.dataset.duration=String(gltf.animations[0]?.duration||0);
}
