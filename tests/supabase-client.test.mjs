import {test} from 'node:test';import assert from 'node:assert/strict';
const config={provider:'supabase',supabaseUrl:'https://independent-ar.supabase.co',supabaseAnonKey:'public-anon-test-key'};
async function client(handler,settings=config){
  globalThis.location={hostname:'slinghuazure-lab.github.io',origin:'https://slinghuazure-lab.github.io'};
  globalThis.fetch=async(url,options)=>{if(url==='/site-config.json')return Response.json(settings);return handler(String(url),options||{});};
  return import('../src/service.js?test='+crypto.randomUUID());
}
test('visitor activity uses the public RPC and resolves stored model paths',async()=>{
  const c=await client((url,options)=>{assert.equal(url,config.supabaseUrl+'/rest/v1/rpc/ar_get_activity');assert.equal(options.headers.apikey,config.supabaseAnonKey);assert.equal(JSON.parse(options.body).p_venue,'taipei');return Response.json({venue:{id:'taipei'},model:{id:'v42',glb:'/models/a.glb',usdz:'/models/a.usdz',poster:'/posters/a.png'},mode:'cloud'});});
  const data=await c.loadActivity('taipei');assert.equal(data.model.glb,'https://slinghuazure-lab.github.io/models/a.glb');assert.equal(data.mode,'cloud');
});
test('launch recording uses keepalive and preserves event identity for deduplication',async()=>{
  const id=crypto.randomUUID();const c=await client((url,options)=>{assert.ok(url.endsWith('/ar_record_launch'));assert.equal(options.keepalive,true);const body=JSON.parse(options.body);assert.equal(body.p_id,id);assert.equal(body.p_model,'owl-v42-1');return Response.json({recorded:true});});
  assert.equal((await c.recordLaunch({id,venueId:'demo',modelId:'owl-v42-1',platform:'ios'})).ok,true);
});
test('new publishable keys are sent on apikey rather than as JWT bearer credentials',async()=>{
  const key='sb_publishable_example';const c=await client((url,options)=>{assert.equal(options.headers.apikey,key);assert.equal(options.headers.Authorization,undefined);return Response.json({recorded:true});},{...config,supabaseAnonKey:key});
  assert.equal((await c.recordLaunch({id:crypto.randomUUID(),venueId:'demo',modelId:'owl-v42-1',platform:'android'})).ok,true);
});
test('Supabase login uses Auth; privileged requests use the returned user JWT',async()=>{
  const c=await client((url,options)=>{if(url.includes('/auth/v1/token')){assert.deepEqual(JSON.parse(options.body),{email:'admin@example.test',password:'test-password'});return Response.json({access_token:'admin-user-jwt'});}assert.ok(url.endsWith('/ar_admin_catalog'));assert.equal(options.headers.Authorization,'Bearer admin-user-jwt');return Response.json({models:[],venues:[],mode:'cloud'});});
  const jwt=await c.signIn('admin@example.test','test-password');assert.equal(jwt,'admin-user-jwt');assert.equal((await c.adminRequest('catalog',{},jwt)).mode,'cloud');c.clearSession();await assert.rejects(()=>c.adminRequest('catalog'),/請先登入/);
});
test('without Supabase configuration the page explicitly remains an untracked static preview',async()=>{
  const c=await client(url=>{assert.equal(url,'/catalog.json');return Response.json({venues:[{id:'demo',name:'預覽',active:true,modelId:'v1'}],models:[{id:'v1',glb:'/m.glb',usdz:'/m.usdz',poster:'/p.png'}]});},{provider:'supabase',supabaseUrl:'',supabaseAnonKey:''});
  assert.equal((await c.loadActivity('demo')).mode,'static');await assert.rejects(()=>c.signIn('admin@example.test','password'),/請先/);
});
