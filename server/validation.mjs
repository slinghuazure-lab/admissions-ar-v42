export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export const slug = value => typeof value==='string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
export function asset(value,extension){
  if(typeof value!=='string'||value.length>2000) throw new HttpError(400,'請提供有效的模型或圖片網址');
  const url=new URL(value,'https://local.invalid');
  if((!value.startsWith('/')&&url.protocol!=='https:')||value.startsWith('//')||url.username||url.password) throw new HttpError(400,'檔案須使用站內路徑或 HTTPS 網址');
  if(!extension.test(url.pathname))throw new HttpError(400,'檔案格式不正確');
  return value;
}
export function validateModel(data){
  if(!slug(data.id))throw new HttpError(400,'模型代碼只能使用英數、小寫、連字號或底線');
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw new HttpError(400,'請填寫模型名稱（80 字內）');
  if(typeof data.version!=='string'||!data.version.trim()||data.version.length>80)throw new HttpError(400,'請填寫版本名稱');
  if(!Number.isFinite(data.duration)||data.duration<=0||data.duration>600)throw new HttpError(400,'循環長度須介於 1 至 600 秒');
  return {id:data.id,name:data.name.trim(),version:data.version.trim(),description:String(data.description||'').slice(0,240),
    glb:asset(data.glb,/\.glb$/i),usdz:asset(data.usdz,/\.usdz$/i),poster:asset(data.poster,/\.(png|jpe?g|webp)$/i),duration:data.duration};
}
export function validateVenue(data){
  if(!slug(data.id)||!slug(data.modelId))throw new HttpError(400,'展場或模型代碼不正確');
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>100)throw new HttpError(400,'請填寫展場名稱（100 字內）');
  if(typeof data.active!=='boolean')throw new HttpError(400,'請設定展場啟用狀態');
  return {...data,name:data.name.trim()};
}
export function validDate(value,fallback){
  if(!value)return fallback;
  const date=new Date(value+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new HttpError(400,'日期格式不正確');
  return value;
}
