import {cameraError} from './camera-utils.js';
const base=new URL('./',location.href),venueId=new URLSearchParams(location.search).get('venue')||'demo';
const video=document.querySelector('#camera-video'),loading=document.querySelector('#loading'),ui=document.querySelector('#camera-ui'),dialog=document.querySelector('#photo-view'),title=document.querySelector('#loading-title'),note=document.querySelector('#loading-note');
const outboxKey='ar-pending-launches';let settings,activity,stream,overlay,photoUrl,photoBlob,mirror=false,facing='environment',cancelled=false,switching=false,closing=false;
const asset=path=>/^https:\/\//.test(path)?path:new URL(path.replace(/^\//,''),base).href;
function pending(){try{return JSON.parse(localStorage.getItem(outboxKey)||'[]').filter(x=>Date.now()-x.queuedAt<86400000).slice(-30);}catch{return [];}}
function save(items){try{localStorage.setItem(outboxKey,JSON.stringify(items));}catch{}}
async function rpc(name,body){const authorization=settings.supabaseAnonKey.startsWith('eyJ')?{Authorization:'Bearer '+settings.supabaseAnonKey}:{};return fetch(settings.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:settings.supabaseAnonKey,...authorization,'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:name==='ar_record_launch'});}
async function send(item){const response=settings.provider==='local'?await fetch('/api/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item),keepalive:true}):await rpc('ar_record_launch',{p_id:item.id,p_venue:item.venueId,p_model:item.modelId,p_platform:item.platform});if(response.ok||[400,404,409].includes(response.status))save(pending().filter(x=>x.id!==item.id));}
async function flush(){if(!settings||!activity||activity.mode==='static')return;for(const item of pending())try{await send(item);}catch{return;}}
function record(){const platform=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'ios':/Android/i.test(navigator.userAgent)?'android':null;if(!platform||activity.mode==='static')return;const item={id:crypto.randomUUID(),venueId:activity.venue.id,modelId:activity.model.id,platform,queuedAt:Date.now()};save([...pending(),item]);send(item).catch(()=>{});}
async function getActivity(){
  const config=await fetch(new URL('site-config.json',base),{cache:'no-store'});if(!config.ok)throw new Error('暫時無法取得活動設定');settings=await config.json();let data;
  if(settings.provider==='local'){const response=await fetch('/api/activity?venue='+encodeURIComponent(venueId));data=await response.json();if(!response.ok)throw new Error(data.error);}
  else if(settings.supabaseUrl&&settings.supabaseAnonKey){const response=await rpc('ar_get_activity',{p_venue:venueId});if(!response.ok)throw new Error('展場服務暫時無法連線，請稍後重新整理');data=await response.json();}
  else{const response=await fetch(new URL('catalog.json',base));if(!response.ok)throw new Error('暫時無法取得展場設定');const catalog=await response.json(),venue=catalog.venues.find(v=>v.id===venueId&&v.active);if(!venue)throw new Error('此展場尚未開放或已結束');data={venue:{id:venue.id,name:venue.name},model:catalog.models.find(m=>m.id===venue.modelId),mode:'static'};}
  if(!data?.model)throw new Error('此展場尚未開放或已結束');
  const model={...data.model,glb:asset(data.model.glb)};
  // Only this exact built-in asset has a camera variant; replacement models use their configured URL.
  if(model.id==='owl-v42-1'&&model.glb===asset('/models/v42-loop.glb')){model.fallbackGlb=model.glb;model.glb=asset('/models/v42-camera-meshopt.glb');}
  return {...data,model};
}
function stopCamera(){if(stream)for(const track of stream.getTracks())track.stop();stream=undefined;video.srcObject=null;}
async function openCamera(direction){
  if(!window.isSecureContext)throw new Error('相機需要 HTTPS，請使用正式活動網址。');if(!navigator.mediaDevices?.getUserMedia)throw new Error('此瀏覽器無法使用相機，請改用 Safari 或 Chrome。');
  const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:direction},width:{ideal:1920},height:{ideal:1080}}});
  if(cancelled){for(const track of next.getTracks())track.stop();throw new Error('已結束相機體驗');}
  stream=next;const actual=next.getVideoTracks()[0]?.getSettings().facingMode;mirror=(actual||direction)==='user';video.classList.toggle('mirrored',mirror);video.srcObject=next;await video.play();
  if(!video.videoWidth)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('相機影像尚未就緒，請重新整理。')),10000);video.addEventListener('loadeddata',()=>{clearTimeout(timeout);resolve();},{once:true});});return next;
}
function fail(error){cancelled=true;ui.hidden=true;loading.hidden=false;loading.classList.add('error');title.textContent='暫時無法開啟合照';note.textContent=cameraError(error);stopCamera();overlay?.dispose();}
function clearPhoto(){if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=undefined;photoBlob=undefined;document.querySelector('#photo-result').removeAttribute('src');}
document.querySelector('#character-size').oninput=e=>overlay?.setScale(Number(e.target.value)/100);
document.querySelector('#switch-camera').onclick=async()=>{if(switching||!overlay)return;switching=true;loading.hidden=false;title.textContent='正在切換鏡頭';note.textContent='請稍候…';stopCamera();facing=facing==='environment'?'user':'environment';try{await openCamera(facing);loading.hidden=true;}catch(error){fail(error);}finally{switching=false;}};
document.querySelector('#shutter').onclick=async()=>{
  if(!overlay||!stream||switching||dialog.open)return;
  try{const canvas=overlay.capture(video,mirror);photoBlob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('無法產生照片')),'image/jpeg',.94));photoUrl=URL.createObjectURL(photoBlob);document.querySelector('#photo-result').src=photoUrl;document.querySelector('#save-note').textContent='';overlay.setPaused(true);dialog.showModal();}
  catch(error){note.textContent=error.message;loading.hidden=false;title.textContent='照片暫時無法產生';setTimeout(()=>{if(!cancelled)loading.hidden=true;},2500);}
};
document.querySelector('#retake').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearPhoto();overlay?.setPaused(false);});
document.querySelector('#save-photo').onclick=async()=>{
  if(!photoBlob)return;const name='AR-合照-'+Date.now()+'.jpg',file=new File([photoBlob],name,{type:'image/jpeg'});
  try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'和小菁運動版合照'});
    else{const link=document.createElement('a');link.href=photoUrl;link.download=name;document.body.append(link);link.click();link.remove();document.querySelector('#save-note').textContent='若未出現下載，請長按照片選擇儲存影像。';}}
  catch(error){if(error.name!=='AbortError')document.querySelector('#save-note').textContent='請長按照片，選擇儲存影像。';}
};
window.addEventListener('online',flush);window.addEventListener('pagehide',()=>{closing=true;cancelled=true;stopCamera();overlay?.dispose();clearPhoto();});window.addEventListener('pageshow',e=>{if(e.persisted&&closing)location.reload();});
// Request camera permission immediately; no start control or native AR jump.
const cameraReady=openCamera(facing),activityReady=getActivity();
const modelReady=Promise.all([activityReady,import('./camera/camera-runtime.js?v=camera-2')]).then(async([data,{createOverlay}])=>{
  if(cancelled)throw new Error('已結束體驗');
  title.textContent='正在載入小菁運動版';note.textContent='請允許使用相機，角色下載完成後會自動出現…';
  const next=await createOverlay(document.querySelector('#character-layer'),data.model,progress=>{if(cancelled)return;note.textContent=progress===null?'正在準備角色，並請允許使用相機…':progress>=99?'角色下載完成，正在準備動畫…':`正在下載角色模型 ${progress}% · 請允許使用相機`;},zoom=>document.querySelector('#character-size').value=String(Math.round(zoom*100)));
  if(cancelled){next.dispose();throw new Error('已結束體驗');}overlay=next;return next;
});
try{
  const results=await Promise.all([cameraReady,activityReady,modelReady]);activity=results[1];if(cancelled)throw new Error('已結束體驗');
  if(cancelled){overlay.dispose();throw new Error('已結束體驗');}document.querySelector('#model-label').textContent=activity.model.name;ui.hidden=false;loading.hidden=true;flush();record();
}catch(error){if(!closing)fail(error);}
