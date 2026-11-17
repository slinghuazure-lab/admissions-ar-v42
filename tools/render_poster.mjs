import {createRequire} from 'node:module';import {readdir} from 'node:fs/promises';import {resolve} from 'node:path';
const require=createRequire('C:/Users/slinghu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json');const {chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..');const file=(await readdir(resolve(root,'dist/client/assets'))).find(x=>/^preview-.*\.js$/.test(x));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:600,height:680},deviceScaleFactor:1});await page.goto('http://127.0.0.1:4310');
  await page.evaluate(async file=>{const {preview}=await import('/assets/'+file);document.documentElement.style.background='transparent';document.body.style.background='transparent';document.body.innerHTML='<div id="poster" style="width:600px;height:680px;position:relative"></div>';await preview(document.querySelector('#poster'),{glb:'/models/v42-loop.glb'},()=>{},{time:31,paused:true});},file);
  await page.locator('canvas[data-animation]').waitFor({timeout:120000});await page.screenshot({path:resolve(root,'public/posters/v42.png'),omitBackground:true});console.log('Clean character poster rendered from the actual V42 GLB at the YA pose.');
}finally{await browser.close();}
