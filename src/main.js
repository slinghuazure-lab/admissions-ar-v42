import {base} from './service.js';
import './style.css';
import {initActivity} from './visitor.js';
import {initAdmin} from './admin.js';
document.querySelector('#app').innerHTML=`<header class="header"><a class="brand" href="${base}" aria-label="回到活動頁"><span class="brand-mark">✳</span><span>招生 AR 同框計畫<small>MEET YOU IN AR</small></span></a><span class="header-tag">招生展覽 · AR 體驗</span></header><main id="main" aria-live="polite"><div class="loading">正在準備體驗…</div></main><footer><span>把回憶，帶進真實世界。</span><span>AR PHOTO EXPERIENCE <a href="${base}admin.html">活動管理 ↗</a></span></footer>`;
if(location.pathname.endsWith('/admin')||location.pathname.endsWith('/admin.html'))initAdmin();else initActivity();
