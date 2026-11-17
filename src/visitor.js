import {base,loadActivity,recordLaunch} from './service.js';
let main,recordingEnabled=true;
export const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='ar-pending-launches';
function pending(){try{return JSON.parse(localStorage.getItem(key)||'[]').filter(item=>Date.now()-item.queuedAt<86400000).slice(-30);}catch{return [];}}
function save(items){try{localStorage.setItem(key,JSON.stringify(items));}catch{/* Statistics never block AR. */}}
async function flush(){
  for(const item of pending()){
    try{const response=await recordLaunch(item);
      if(response.ok||[400,404,409].includes(response.status))save(pending().filter(row=>row.id!==item.id));
    }catch{return;}
  }
}
function track(venue,model,platform){
  if(!recordingEnabled)return;
  const item={id:crypto.randomUUID(),venueId:venue.id,modelId:model.id,platform,queuedAt:Date.now()};save([...pending(),item]);
  // Issue the request synchronously in the tap handler; never await before native AR navigation.
  recordLaunch(item)
    .then(response=>{if(response.ok)save(pending().filter(row=>row.id!==item.id));}).catch(()=>{});
}
export async function initActivity(){
  main=document.querySelector('#main');
  try{
    const venueId=new URLSearchParams(location.search).get('venue')||'demo';
    const data=await loadActivity(venueId);recordingEnabled=data.mode!=='static';render(data);if(recordingEnabled)flush();
    window.addEventListener('online',flush);document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush();});
  }catch(error){main.innerHTML=`<section class="error-page"><span class="eyebrow">SEE YOU NEXT TIME</span><h1>體驗暫時無法開啟</h1><p>${escape(error.message||'請確認網路連線後重試。')}</p><button class="primary" id="retry">重新載入 ↗</button></section>`;document.querySelector('#retry').onclick=()=>location.reload();}
}
function render({venue,model,mode}){
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const android=/Android/i.test(navigator.userAgent);
  const inApp=/Line\/|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
  const testLink=document.createElement('a');const iosSupported=!!testLink.relList?.supports?.('ar');
  document.title='和'+model.name+'同框｜AR 合照';
  const clipList=model.clips?.length?model.clips:[{name:model.name,seconds:model.duration}];
  const sequence=clipList.map(clip=>`<span>${escape(clip.name)} <small>${clip.seconds} 秒</small></span>`).join('<b>→</b>')+'<b>↻</b>';
  const platform=ios?'ios':android?'android':'desktop';
  main.innerHTML=`<section class="experience"><div class="intro"><div class="location-chip"><span class="live-dot"></span>${escape(venue.name)}</div><h1>讓${escape(model.name)}，<br>走進<span class="outline-text">你的世界。</span></h1><p class="lead">${escape(model.description)}</p><div class="experience-tags"><span>免安裝 App</span><span>真實場景 AR</span><span>自由合照</span></div><div class="launch-area"><a class="primary launch" id="launch"><span>與${escape(model.name)} AR 合照</span><span aria-hidden="true">↗</span></a><p id="device-note" class="hint"></p></div><div class="mini-note"><span>01—03</span> 動作自動循環。喜歡哪一刻，就拍下哪一刻。</div></div><div class="character-stage"><div class="stage-top"><span>YOUR NEW PHOTO BUDDY</span><span class="version">${escape(model.version)}</span></div><div class="stage-art" id="preview"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="spark spark-one">✳</span><span class="spark spark-two">✦</span><img class="character-poster" src="${escape(model.poster)}" alt="${escape(model.name)}合照姿勢" fetchpriority="high"><span class="stage-floor"></span></div><div class="stage-bottom"><span><i class="live-dot"></i> ${escape(model.name)}</span><button id="preview-button" class="text-button">查看 3D 動畫 ↗</button></div></div></section><section class="how"><div class="section-title"><span class="eyebrow">A LITTLE MAGIC, THREE STEPS</span><h2>一起入鏡，就這麼簡單。</h2></div><div class="steps"><article><span class="step-number">01</span><h3>開啟 AR</h3><p>點選合照按鈕，依手機提示允許使用相機。</p></article><article><span class="step-number">02</span><h3>找個好位置</h3><p>緩慢移動手機掃描地面，將角色放在你身旁。</p></article><article><span class="step-number">03</span><h3>留下你的瞬間</h3><p>用 AR 畫面提供的拍照功能合照，照片由你保管。</p></article></div></section><section class="animation-strip"><div><span class="eyebrow">${model.duration} SECONDS · ON REPEAT</span><h2>每個動作，都值得同框。</h2></div><div class="animation-items">${sequence}</div></section><section class="details"><details><summary>哪些手機可以使用？</summary><p>請使用支援 AR 的 iPhone Safari 或 Android Chrome。部分 Android 手機需要已具備 Google Play Services for AR 與 Google 應用程式；不支援的裝置可查看 3D 動畫。LINE 等內建瀏覽器請改用 Safari／Chrome 開啟。</p></details><details><summary>照片與使用紀錄如何處理？</summary><p>本活動不接收相機影像、不上傳照片、不要求 GPS 定位。僅記錄 AR 啟動操作次數、啟動日期與展場，以及模型版本及 iPhone／Android 類別。重複啟動會再次計算，不代表不重複人數或成功拍照次數。</p></details></section><p class="mode-note">${mode==='local'?'目前為本機預覽；手機 AR 需要可公開存取的 HTTPS 模型網址。':mode==='static'?'目前提供 AR 體驗預覽；雲端使用統計尚未連接。':''}</p>`;
  const launch=document.querySelector('#launch'),note=document.querySelector('#device-note');
  const absolute=path=>new URL(path,location.origin).href;
  if(inApp){launch.setAttribute('aria-disabled','true');launch.classList.add('disabled');note.textContent='請從右上角選單改用 Safari／Chrome 開啟此頁，再啟動 AR。';}
  else if(ios&&iosSupported&&model.usdz){
    launch.href=absolute(model.usdz);launch.rel='ar';
    // AR Quick Look requires an image/picture as the link’s first child.
    launch.insertAdjacentHTML('afterbegin',`<img class="ar-link-image" src="${escape(model.poster)}" alt="">`);
    note.textContent='將開啟 iPhone AR 檢視器；首次載入模型請稍候。';
  }else if(android){
    const file=encodeURIComponent(absolute(model.glb));const fallback=encodeURIComponent(absolute(base+'?venue='+encodeURIComponent(venue.id)+'&ar=fallback'));
    launch.href=`intent://arvr.google.com/scene-viewer/1.0?file=${file}&mode=ar_preferred&title=${encodeURIComponent(model.name)}&resizable=true#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`;
    note.textContent='將開啟 Android AR 檢視器；實際支援依手機而定。';
  }else{
    launch.setAttribute('aria-disabled','true');launch.classList.add('disabled');note.textContent=ios?'此瀏覽器未提供 AR，請改用 Safari。':'請用支援 AR 的手機掃描展場 QR Code；此裝置可查看 3D 動畫。';
  }
  if(new URLSearchParams(location.search).get('ar')==='fallback')note.textContent='此手機未能開啟 AR 檢視器。請確認 Google AR 服務，或改看下方 3D 動畫。';
  launch.addEventListener('click',event=>{
    if(launch.getAttribute('aria-disabled')==='true'){event.preventDefault();return;}
    if(!window.isSecureContext){event.preventDefault();note.textContent='請使用正式 HTTPS 活動網址開啟 AR。';return;}
    track(venue,model,platform);
  });
  document.querySelector('#preview-button').onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;button.textContent='載入 3D 模型…';
    try{const {preview}=await import('./preview.js');await preview(document.querySelector('#preview'),model,progress=>button.textContent=progress);button.textContent='可拖曳旋轉 · 自動循環';}
    catch{button.disabled=false;button.textContent='載入失敗，點此重試';}
  };
}
