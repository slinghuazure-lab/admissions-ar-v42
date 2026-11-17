import {detectDevice,directLink} from './direct-ar-links.js';
const root=document.querySelector('#direct-app');
const base=new URL('./',location.href);
const params=new URLSearchParams(location.search);
const venueId=params.get('venue')||'demo';
const outboxKey='ar-pending-launches';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asset=path=>/^https:\/\//.test(path)?path:new URL(path.replace(/^\//,''),base).href;
let settings,activity,event;
let autoAttempted=false,hiddenAfterAttempt=false;
let fallbackTimer;
function pending(){try{return JSON.parse(localStorage.getItem(outboxKey)||'[]').filter(x=>Date.now()-x.queuedAt<86400000).slice(-30);}catch{return [];}}
function save(items){try{localStorage.setItem(outboxKey,JSON.stringify(items));}catch{/* AR must remain available when storage is blocked. */}}
async function rpc(name,body){
  const authorization=settings.supabaseAnonKey.startsWith('eyJ')?{Authorization:'Bearer '+settings.supabaseAnonKey}:{};
  return fetch(settings.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:settings.supabaseAnonKey,...authorization,'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:name==='ar_record_launch'});
}
async function send(item){
  const response=settings.provider==='local'
    ?await fetch('/api/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item),keepalive:true})
    :await rpc('ar_record_launch',{p_id:item.id,p_venue:item.venueId,p_model:item.modelId,p_platform:item.platform});
  if(response.ok||[400,404,409].includes(response.status))save(pending().filter(x=>x.id!==item.id));
}
function record(platform){
  if(activity.mode==='static')return;
  // An automatic attempt and its blocked-browser button fallback share one event.
  // Returning from native AR and opening it again starts a new event.
  if(!event){event={id:crypto.randomUUID(),venueId:activity.venue.id,modelId:activity.model.id,platform,queuedAt:Date.now()};save([...pending(),event]);}
  send(event).catch(()=>{});
}
async function flush(){if(!settings||!activity||activity.mode==='static')return;for(const item of pending())try{await send(item);}catch{return;}}
async function getActivity(){
  const response=await fetch(new URL('site-config.json',base),{cache:'no-store'});if(!response.ok)throw new Error('暫時無法取得活動設定');settings=await response.json();
  let data;
  if(settings.provider==='local'){
    const reply=await fetch('/api/activity?venue='+encodeURIComponent(venueId));data=await reply.json();if(!reply.ok)throw new Error(data.error);
  }else if(settings.supabaseUrl&&settings.supabaseAnonKey){
    const reply=await rpc('ar_get_activity',{p_venue:venueId});if(!reply.ok)throw new Error('展場服務暫時無法連線，請稍後重試');data=await reply.json();
  }else{
    const reply=await fetch(new URL('catalog.json',base));if(!reply.ok)throw new Error('暫時無法取得活動設定');const catalog=await reply.json();
    const venue=catalog.venues.find(x=>x.id===venueId&&x.active);if(!venue)throw new Error('此展場尚未開放或已結束');
    data={venue:{id:venue.id,name:venue.name},model:catalog.models.find(x=>x.id===venue.modelId),mode:'static'};
  }
  if(!data?.model)throw new Error('此展場尚未開放或已結束');
  return {...data,model:{...data.model,glb:asset(data.model.glb),usdz:asset(data.model.usdz),poster:asset(data.model.poster)}};
}
function showFallback(){
  if(document.hidden||hiddenAfterAttempt)return;
  const heading=document.querySelector('#status-heading'),note=document.querySelector('#status-note');
  if(heading)heading.textContent='點一下，開啟 AR 合照';
  if(note)note.textContent='若手機未自動開啟相機，請按下方按鈕，並依系統提示操作。';
}
function render(){
  const {model,venue}=activity;
  const probe=document.createElement('a');
  const device=detectDevice(navigator.userAgent,navigator.platform,navigator.maxTouchPoints,!!probe.relList?.supports?.('ar'));
  const supported=device.supported&&window.isSecureContext;
  const returnedFallback=params.get('fallback')==='1';
  document.title=model.name+'｜直接 AR 合照';
  let note='正在嘗試開啟 AR，首次下載模型請稍候。';
  if(device.inApp)note='請從右上角選單改用 Safari／Chrome 開啟此頁。';
  else if(device.platform==='desktop')note='請用支援 AR 的 iPhone 或 Android 手機掃描此 QR Code。';
  else if(!device.supported)note='請使用支援 AR 的 iPhone Safari 或 Android Chrome 開啟。';
  else if(!window.isSecureContext)note='請使用正式 HTTPS 活動網址開啟。';
  else if(returnedFallback)note='手機尚未能開啟 AR。請確認裝置支援 AR 與 Google AR 服務後，再按下方按鈕重試。';
  root.innerHTML=`<span class="venue">${escape(venue.name)}</span><img class="poster" src="${escape(model.poster)}" alt="${escape(model.name)}"><h1 id="status-heading">${supported&&!returnedFallback?'正在開啟 AR 合照':escape(model.name)+' AR 合照'}</h1><p id="status-note" role="status">${escape(note)}</p><a id="direct-launch" class="open-ar" data-direct-launch ${supported?'':'aria-disabled="true"'}><img class="ar-link-image" src="${escape(model.poster)}" alt=""><span>開啟 AR 合照</span><span aria-hidden="true">↗</span></a><p class="privacy">照片由手機保管，不上傳相機影像。${activity.mode==='static'?'目前為預覽，尚未連接使用統計。':''}</p><a class="original" href="${escape(base.href)}">活動介紹</a>`;
  const button=document.querySelector('#direct-launch');
  if(supported){const link=directLink(device,model,venue.id,location.href);button.href=link.href;if(link.rel)button.rel=link.rel;}
  button.addEventListener('click',e=>{
    if(!supported){e.preventDefault();return;}
    hiddenAfterAttempt=false;
    record(device.platform);
    document.querySelector('#status-heading').textContent='正在開啟 AR 合照';
    document.querySelector('#status-note').textContent='請依手機提示允許相機，並緩慢移動手機尋找地面。';
    clearTimeout(fallbackTimer);fallbackTimer=setTimeout(showFallback,1400);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenAfterAttempt=autoAttempted||!!event;clearTimeout(fallbackTimer);}
    else{
      if(hiddenAfterAttempt){event=undefined;document.querySelector('#status-heading').textContent='再次開啟 AR 合照';document.querySelector('#status-note').textContent='按下方按鈕，可以再次與角色合照。';}
      flush();
    }
  });
  window.addEventListener('online',flush);
  // Never repeat automatic navigation after Android fallback or after returning.
  if(supported&&!returnedFallback){autoAttempted=true;button.click();}
}
try{
  activity=await getActivity();
  const visibleBeforeLaunch=()=>{if(document.hidden)return;document.removeEventListener('visibilitychange',visibleBeforeLaunch);flush();render();};
  if(document.hidden)document.addEventListener('visibilitychange',visibleBeforeLaunch);else visibleBeforeLaunch();
}catch(error){
  root.innerHTML=`<div class="opening-mark" aria-hidden="true">✳</div><h1>暫時無法開啟 AR</h1><p role="alert">${escape(error.message||'請確認網路連線後重試')}</p><button class="open-ar" id="retry">重新載入</button><a class="original" href="${escape(base.href)}">活動介紹</a>`;
  document.querySelector('#retry').onclick=()=>location.reload();
}
