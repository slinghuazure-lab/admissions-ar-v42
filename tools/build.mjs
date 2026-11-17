import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir,cp,stat} from 'node:fs/promises';
const pages=process.argv.includes('--pages');
const pageBase=process.env.PAGES_BASE||(pages?'/admissions-ar-v42/':'/');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const fallback=resolve(root,'../ai-character-photo-booth/node_modules');
function dependency(name){try{return require.resolve(name);}catch{return createRequire(resolve(process.env.AR_DEPENDENCY_ROOT||fallback,'package.json')).resolve(name);}}
const {build}=await import(pathToFileURL(dependency('vite')));
const modules=dirname(dirname(dependency('three'))),qr=dependency('qrcode').replace(/[\\/]lib[\\/]index.js$/,'/lib/browser.js');
await build({root,base:pageBase,configFile:false,css:{postcss:{plugins:[]}},publicDir:resolve(root,'public'),resolve:{alias:[{find:/^three\/addons\/(.*)/,replacement:modules+'/examples/jsm/$1'},{find:/^three\/(.*)/,replacement:modules+'/$1'},{find:'three',replacement:dependency('three')},{find:'qrcode',replacement:qr}]},build:{outDir:resolve(root,'dist/client'),emptyOutDir:true,rollupOptions:{input:resolve(root,'index.html')},chunkSizeWarningLimit:850}});
await cp(resolve(root,'config/catalog.json'),resolve(root,'dist/client/catalog.json'));
await cp(resolve(root,'dist/client/index.html'),resolve(root,'dist/client/admin.html'));
// The new camera entry is bundled separately; the original activity entry is untouched.
await build({root,configFile:false,publicDir:false,css:{postcss:{plugins:[]}},resolve:{alias:[{find:/^three\/addons\/(.*)/,replacement:modules+'/examples/jsm/$1'},{find:/^three\/(.*)/,replacement:modules+'/$1'},{find:'three',replacement:dependency('three')}]},build:{outDir:resolve(root,'dist/client/camera'),emptyOutDir:true,lib:{entry:resolve(root,'src/direct-camera.js'),formats:['es'],fileName:()=> 'camera-runtime.js'},rollupOptions:{output:{inlineDynamicImports:true}},chunkSizeWarningLimit:900}});
await writeFile(resolve(root,'dist/client/.nojekyll'),'');
if(pages){
  const settings=JSON.parse(await readFile(resolve(root,'public/site-config.json'),'utf8'));
  if(process.env.SUPABASE_URL)settings.supabaseUrl=process.env.SUPABASE_URL;
  if(process.env.SUPABASE_ANON_KEY)settings.supabaseAnonKey=process.env.SUPABASE_ANON_KEY;
  await writeFile(resolve(root,'dist/client/site-config.json'),JSON.stringify(settings,null,2));
  console.log('GitHub Pages artifact ready: dist/client; base '+pageBase);
  process.exit(0);
}
console.log('Standalone static website ready: dist/client (GitHub Pages + Supabase).');
