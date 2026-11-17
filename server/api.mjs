import {HttpError,slug,validateModel,validateVenue,validDate} from './validation.mjs';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(request){
  const text=await request.text();if(text.length>12000)throw new HttpError(413,'內容過長');
  try{return JSON.parse(text);}catch{throw new HttpError(400,'資料格式不正確');}
}
async function authorize(request,secret){
  if(!secret||!request.headers.get('Authorization')?.startsWith('Bearer '))throw new HttpError(401,'請輸入管理金鑰');
  // Hash before compare to avoid length-dependent secret comparison.
  const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(request.headers.get('Authorization').slice(7)),digest(secret)]);
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
  if(difference)throw new HttpError(401,'管理金鑰不正確');
}
export async function api(request,store,{adminToken,saveUpload,mode='cloud'}={}){
  const url=new URL(request.url),path=url.pathname;
  try {
    if(!['GET','POST'].includes(request.method))throw new HttpError(405,'不支援此操作');
    if(request.method==='POST'&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)throw new HttpError(403,'請從活動網站操作');
    if(path==='/api/activity'&&request.method==='GET'){
      const id=url.searchParams.get('venue')||'demo';if(!slug(id))throw new HttpError(400,'展場代碼不正確');
      const rows=await store.query('SELECT v.id,v.name,v.active,m.data FROM venues v JOIN models m ON m.id=v.model_id WHERE v.id=?',[id]);
      if(!rows.length||!rows[0].active)throw new HttpError(404,'此展場尚未開放或已結束');
      const row=rows[0];return json({venue:{id:row.id,name:row.name},model:JSON.parse(row.data),mode});
    }
    if(path==='/api/launch'&&request.method==='POST'){
      const data=await body(request);
      if(!/^[0-9a-f-]{36}$/i.test(data.id)||!slug(data.venueId)||!slug(data.modelId)||!['ios','android'].includes(data.platform))throw new HttpError(400,'啟動紀錄格式不正確');
      const existing=await store.query('SELECT id FROM launches WHERE id=?',[data.id]);
      if(existing.length)return json({recorded:true,duplicate:true});
      const rows=await store.query('SELECT v.name,m.data FROM venues v JOIN models m ON m.id=v.model_id WHERE v.id=? AND v.active=1 AND m.id=?',[data.venueId,data.modelId]);
      if(!rows.length)throw new HttpError(409,'展場設定已更新，請重新整理活動頁');
      const model=JSON.parse(rows[0].data);
      await store.exec('INSERT OR IGNORE INTO launches(id,venue_id,venue_name,model_id,model_version,platform) VALUES (?,?,?,?,?,?)',[data.id,data.venueId,rows[0].name,data.modelId,model.version,data.platform]);
      return json({recorded:true});
    }
    if(!path.startsWith('/api/admin/'))throw new HttpError(404,'找不到此功能');
    await authorize(request,adminToken);
    if(path==='/api/admin/catalog'&&request.method==='GET'){
      const models=(await store.query('SELECT data FROM models ORDER BY created_at DESC')).map(row=>JSON.parse(row.data));
      const venues=(await store.query('SELECT id,name,model_id AS modelId,active FROM venues ORDER BY id')).map(row=>({...row,active:!!row.active}));
      return json({models,venues,mode});
    }
    if(path==='/api/admin/models'&&request.method==='POST'){
      const model=validateModel(await body(request));
      if((await store.query('SELECT id FROM models WHERE id=?',[model.id])).length)throw new HttpError(409,'此模型版本代碼已存在，請使用新代碼以保留歷史');
      await store.exec('INSERT INTO models(id,data) VALUES (?,?)',[model.id,JSON.stringify(model)]);return json(model,201);
    }
    if(path==='/api/admin/venues'&&request.method==='POST'){
      const venue=validateVenue(await body(request));
      if(!(await store.query('SELECT id FROM models WHERE id=?',[venue.modelId])).length)throw new HttpError(400,'找不到指定模型');
      await store.exec('INSERT INTO venues(id,name,model_id,active) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,model_id=excluded.model_id,active=excluded.active',[venue.id,venue.name,venue.modelId,Number(venue.active)]);return json(venue);
    }
    if(path==='/api/admin/upload'&&request.method==='POST'){
      if(!saveUpload)throw new HttpError(503,'尚未設定模型檔案儲存空間，請改填已上傳的 HTTPS 網址');
      const extension=url.searchParams.get('type');if(!['glb','usdz','png','jpg','webp'].includes(extension))throw new HttpError(400,'不支援此檔案格式');
      const length=Number(request.headers.get('Content-Length'));
      if(!length||length>100*1024*1024)throw new HttpError(413,'檔案大小須在 100 MB 以內');
      const file=await request.arrayBuffer();if(file.byteLength!==length)throw new HttpError(400,'檔案傳輸不完整');
      const bytes=new Uint8Array(file),magic=String.fromCharCode(...bytes.slice(0,4));
      if((extension==='glb'&&magic!=='glTF')||(extension==='usdz'&&magic!=='PK\u0003\u0004')||(extension==='png'&&!(bytes[0]===137&&magic.slice(1)==='PNG'))||(extension==='jpg'&&!(bytes[0]===255&&bytes[1]===216))||(extension==='webp'&&!(magic==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')))throw new HttpError(400,'檔案內容與格式不符');
      const name=crypto.randomUUID()+'.'+extension;await saveUpload(name,file);return json({url:'/uploads/'+name},201);
    }
    if(path==='/api/admin/stats'&&request.method==='GET'){
      const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
      const from=validDate(url.searchParams.get('from'),today.slice(0,8)+'01'),to=validDate(url.searchParams.get('to'),today);
      if(from>to)throw new HttpError(400,'開始日期不能晚於結束日期');
      const venue=url.searchParams.get('venue')||'';if(venue&&!slug(venue))throw new HttpError(400,'展場代碼不正確');
      const filter="date(created_at,'+8 hours') BETWEEN ? AND ?"+(venue?' AND venue_id=?':'');
      const args=venue?[from,to,venue]:[from,to];
      const [total,daily,hourly,venues,models,platforms]=await Promise.all([
        store.query(`SELECT COUNT(*) AS count FROM launches WHERE ${filter}`,args),
        store.query(`SELECT date(created_at,'+8 hours') AS label,COUNT(*) AS count FROM launches WHERE ${filter} GROUP BY label ORDER BY label`,args),
        store.query(`SELECT strftime('%H',created_at,'+8 hours') AS label,COUNT(*) AS count FROM launches WHERE ${filter} GROUP BY label ORDER BY label`,args),
        store.query(`SELECT venue_id AS id,venue_name AS label,COUNT(*) AS count FROM launches WHERE ${filter} GROUP BY venue_id,venue_name ORDER BY count DESC`,args),
        store.query(`SELECT model_id AS id,model_version AS label,COUNT(*) AS count FROM launches WHERE ${filter} GROUP BY model_id,model_version ORDER BY count DESC`,args),
        store.query(`SELECT platform AS label,COUNT(*) AS count FROM launches WHERE ${filter} GROUP BY platform ORDER BY count DESC`,args)
      ]);
      return json({from,to,total:total[0].count,daily,hourly,venues,models,platforms,timezone:'Asia/Taipei',mode});
    }
    throw new HttpError(404,'找不到此功能');
  } catch(error){
    if(error instanceof HttpError)return json({error:error.message},error.status);
    console.error('API failure',path,error?.message);return json({error:'服務暫時無法使用，請稍後重試'},503);
  }
}
