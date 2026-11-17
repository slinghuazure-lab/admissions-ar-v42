import {modelLabel,catalogLabels} from '../public/model-label.js';
export const base=import.meta.env?.BASE_URL||'/';
let settings,accessToken='';
export async function getSettings(){
  if(settings)return settings;
  if(location.hostname==='127.0.0.1'||location.hostname==='localhost')return settings={provider:'local'};
  const response=await fetch(base+'site-config.json',{cache:'no-store'});if(!response.ok)throw new Error('找不到網站設定');return settings=await response.json();
}
export const assetUrl=path=>/^https:\/\//.test(path)?path:new URL(base+path.replace(/^\//,''),location.origin).href;
function configured(config){return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl||'')&&!!config.supabaseAnonKey;}
async function rpc(name,data={},jwt){
  const config=settings||await getSettings();if(!configured(config))throw new Error('Supabase 尚未連接，請先完成網站設定');
  const authorization=jwt?{Authorization:'Bearer '+jwt}:config.supabaseAnonKey.startsWith('eyJ')?{Authorization:'Bearer '+config.supabaseAnonKey}:{};
  const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.supabaseAnonKey,...authorization,'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:name==='ar_record_launch'});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.message||result.error_description||'雲端服務無法使用'),{status:response.status});return result;
}
export async function loadActivity(venue){
  const config=settings||await getSettings();let result;
  if(config.provider==='local'){
    const response=await fetch('/api/activity?venue='+encodeURIComponent(venue));result=await response.json();if(!response.ok)throw new Error(result.error);
  }else if(configured(config))result=await rpc('ar_get_activity',{p_venue:venue});
  else{
    const response=await fetch(base+'catalog.json'),catalog=await response.json();const entry=catalog.venues.find(v=>v.id===venue&&v.active);
    if(!entry)throw new Error('此展場尚未開放或已結束');result={venue:{id:entry.id,name:entry.name},model:catalog.models.find(m=>m.id===entry.modelId),mode:'static'};
  }
  if(!result?.model)throw new Error('此展場尚未開放或已結束');
  return {...result,model:{...result.model,name:modelLabel(result.model.name),glb:assetUrl(result.model.glb),usdz:assetUrl(result.model.usdz),poster:assetUrl(result.model.poster)}};
}
export async function recordLaunch(item){
  const config=settings||await getSettings();
  if(config.provider==='local')return fetch('/api/launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item),keepalive:true});
  try{await rpc('ar_record_launch',{p_id:item.id,p_venue:item.venueId,p_model:item.modelId,p_platform:item.platform});return {ok:true,status:200};}catch(error){return {ok:false,status:error.status||503};}
}
export async function signIn(email,password){
  const config=settings||await getSettings();if(!configured(config))throw new Error('請先在 site-config.json 填入獨立 Supabase 專案設定');
  const response=await fetch(config.supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const data=await response.json();if(!response.ok)throw new Error(data.msg||data.error_description||data.message||'登入失敗');accessToken=data.access_token;return accessToken;
}
export function clearSession(){accessToken='';}
export async function adminRequest(path,options={},token){
  const config=settings||await getSettings();
  if(config.provider==='local'){
    const response=await fetch('/api/admin/'+path,{...options,headers:{Authorization:'Bearer '+token,...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error||'無法完成操作');return path==='catalog'||path.startsWith('stats?')?catalogLabels(data):data;
  }
  const jwt=token||accessToken;if(!jwt)throw new Error('請先登入管理員帳號');
  if(path==='catalog')return catalogLabels(await rpc('ar_admin_catalog',{},jwt));
  if(path.startsWith('stats?')){const params=new URLSearchParams(path.split('?')[1]);return catalogLabels(await rpc('ar_get_stats',{p_from:params.get('from'),p_to:params.get('to'),p_venue:params.get('venue')||null},jwt));}
  if(path==='models')return rpc('ar_save_model',{p_model:JSON.parse(options.body)},jwt);
  if(path==='venues')return rpc('ar_save_venue',{p_venue:JSON.parse(options.body)},jwt);
  if(path.startsWith('upload?')){
    const type=new URLSearchParams(path.split('?')[1]).get('type'),name=crypto.randomUUID()+'.'+type;
    const response=await fetch(config.supabaseUrl+'/storage/v1/object/ar-models/'+name,{method:'POST',headers:{apikey:config.supabaseAnonKey,Authorization:'Bearer '+jwt,'Content-Type':options.body.type||'application/octet-stream'},body:options.body});
    const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'上傳失敗');return {url:config.supabaseUrl+'/storage/v1/object/public/ar-models/'+name};
  }
  throw new Error('不支援的管理操作');
}
