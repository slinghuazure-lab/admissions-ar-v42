import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,stat,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {api} from './api.mjs';
const root=resolve(import.meta.dirname,'..'),state=resolve(root,process.env.AR_STATE_DIR||'.local-state');await mkdir(state,{recursive:true});
const database=new DatabaseSync(resolve(state,'activity.sqlite'));database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
database.exec(await readFile(resolve(root,'server/schema.sql'),'utf8'));
const catalog=JSON.parse(await readFile(resolve(root,'config/catalog.json'),'utf8'));
for(const model of catalog.models)database.prepare('INSERT OR IGNORE INTO models(id,data) VALUES (?,?)').run(model.id,JSON.stringify(model));
for(const venue of catalog.venues)database.prepare('INSERT OR IGNORE INTO venues(id,name,model_id,active) VALUES (?,?,?,?)').run(venue.id,venue.name,venue.modelId,Number(venue.active));
const keyPath=resolve(state,'admin-key.txt');let adminToken=process.env.ADMIN_TOKEN;
if(!adminToken){try{adminToken=(await readFile(keyPath,'utf8')).trim();}catch{adminToken=randomBytes(32).toString('hex');await writeFile(keyPath,adminToken+'\n',{mode:0o600});}}
const store={query:async(sql,args=[])=>database.prepare(sql).all(...args),exec:async(sql,args=[])=>database.prepare(sql).run(...args)};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.usdz':'model/vnd.usdz+zip','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
const client=resolve(root,'dist/client'),uploads=resolve(state,'uploads');await mkdir(uploads,{recursive:true});
const server=http.createServer(async(req,res)=>{
  try{
    const hostname=req.headers.host||'localhost';
    const url=new URL(req.url,'http://'+hostname);
    if(url.pathname.startsWith('/api/')){
      let size=0;const chunks=[];const limit=url.pathname==='/api/admin/upload'?100*1024*1024:16384;
      for await(const chunk of req){size+=chunk.length;if(size>limit){res.writeHead(413,{'Content-Type':'application/json'});res.end('{"error":"資料超過大小限制"}');return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await api(request,store,{adminToken,mode:'local',saveUpload:async(name,data)=>writeFile(resolve(uploads,name),Buffer.from(data))});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const decoded=decodeURIComponent(url.pathname.replace(/^\/admissions-ar-v42(?=\/)/,'')),base=decoded.startsWith('/uploads/')?uploads:client;
    const relative=base===uploads?decoded.slice('/uploads/'.length):decoded.slice(1);
    let file=resolve(base,relative||'index.html');if(file!==base&&!file.startsWith(base+sep)){res.writeHead(403);res.end();return;}
    if(url.pathname==='/admin')file=resolve(client,'index.html');
    let info;try{info=await stat(file);}catch{res.writeHead(404);res.end('Not found');return;}
    if(!info.isFile()){res.writeHead(404);res.end();return;}
    const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':info.size,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(self), geolocation=()'};
    const range=req.headers.range;
    if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):info.size-1,info.size-1);
      if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;headers['Content-Length']=end-start+1;res.writeHead(206,headers);
      if(req.method==='HEAD'){res.end();return;}const {createReadStream}=await import('node:fs');createReadStream(file,{start,end}).pipe(res);return;
    }
    res.writeHead(200,headers);if(req.method==='HEAD'){res.end();return;}const {createReadStream}=await import('node:fs');createReadStream(file).pipe(res);
  }catch(error){console.error(error.message);if(!res.headersSent)res.writeHead(500);res.end('Internal server error');}
});
const port=Number(process.env.PORT||4310);server.listen(port,'127.0.0.1',()=>{console.log(`AR 活動預覽：http://127.0.0.1:${port}\n管理後台：http://127.0.0.1:${port}/admin\n管理金鑰位置：${keyPath}\n本機預覽不能作為手機正式 AR 網址。`);});
function stop(){server.close(()=>{database.close();process.exit(0);});}process.on('SIGINT',stop);process.on('SIGTERM',stop);
