# 招生展覽 AR 合照系統

獨立系統：GitHub Pages 活動網站＋Supabase 資料庫、管理員登入及模型儲存。

## 狀態

已完成活動頁、iPhone Quick Look／Android Scene Viewer 啟動連結、展場 QR Code、3D 預覽、模型版本庫、展場指派、台北時區統計與 CSV 匯出。
Supabase Auth、資料表與 RLS 已設定；主辦已確認管理員授權成功。實際展場資料讀取回傳 HTTP 200，匿名管理查詢回傳 HTTP 401。
GitHub 儲存庫及 Pages 已發布，活動頁、管理頁及兩種模型下載皆已確認 HTTP 200。真正的地面定位、拍照、循環播放與人物遮擋仍須實體手機驗收。

正式儲存庫：https://github.com/slinghuazure-lab/admissions-ar-v42
活動網址：https://slinghuazure-lab.github.io/admissions-ar-v42/
管理網址：https://slinghuazure-lab.github.io/admissions-ar-v42/admin.html
管理頁為網站下的 admin.html。

V42：半愛心 20 秒 → YA 20 秒 → 全愛心 20 秒，單一 Exhibit_Loop 共 60 秒。
GLB 約 56.7 MB，USDZ 約 60.4 MB。未採用曾產生破面的減面版本，保留完整模型外觀與表情。
首次載入較大，需用實際展場網路驗收速度。

## 使用方式

掃碼 → 活動頁 → 點 AR 合照 → 系統 AR 檢視器／相機授權 → 掃描地面、放置角色 → 動畫循環 → 使用者自行合照。
不自動拍照、不要求 GPS、不上傳照片、不取得相機影像。
支援 AR 的 iPhone Safari／Android Chrome 可用；部分 Android 需已具備 Google AR 服務及 Google 應用程式。內建瀏覽器會提示改用 Safari／Chrome。不保證每部手機的 AR 拍照選項或人物遮擋效果相同。

## 本機預覽

使用 Node.js 24 或以上：

```sh
npm install
npm run build
npm start
npm test
```

活動頁 http://127.0.0.1:4310/ ，管理頁 /admin.html。
本機管理金鑰會產生於 .local-state/admin-key.txt；本機統計使用 .local-state/activity.sqlite，與正式雲端分開。
localhost QR Code 不能用於展場手機，也不能提供正式 AR。

本次未下載新套件，建置工具可讀取相鄰原專案既有套件，只讀取、不修改原專案。
獨立安裝後會優先使用本專案 node_modules，也可用 AR_DEPENDENCY_ROOT 指定既有套件目錄。

## Supabase 設定

1. 為本系統建立新的 Supabase project，不使用原合照網站的專案。
2. 在新專案 SQL Editor 執行 supabase/migrations/202611160001_ar.sql。
3. 在 Authentication → Users 建立 Email／Password 管理員。若不需要其他人註冊，關閉公開註冊。
4. 把管理員 User UID 加入白名單：

```sql
insert into public.ar_admins(user_id) values ('管理員 User UID');
```

5. 網站使用該專案 HTTPS URL 與 publishable key 或 legacy anon public key。公開設定只能放 publishable／anon key，不能放 service_role key、資料庫密碼或管理員密碼。
6. 實測匿名訪客無法讀取統計、一般帳號無管理權、白名單管理員可查詢及設定。

資料表為 ar_models、ar_venues、ar_launches、ar_admins。一般訪客只可透過指定 RPC 讀取開放展場及新增啟動紀錄。
RLS、Auth 與管理員白名單保護統計及設定；已登入不自動等於管理員。
登入權杖僅保留頁面記憶體，關閉頁面或權杖過期需重新登入。

ar-models bucket 僅存放日後更換的模型及封面，不存訪客照片。
網站上傳限制 50 MB，仍受 Supabase 方案及全域設定限制。大型模型可隨 GitHub Pages 發布後填入站內網址。
模型必須可公開下載，才能讓手機系統 AR 檢視器讀取。統計及管理權限不公開。

## GitHub Pages 發布

1. 在 slinghuazure-lab 建立獨立的 admissions-ar-v42 儲存庫，不更動原網站儲存庫。
2. 推送本專案原始碼與 public 模型；不要推送 .local-state、work、outputs、金鑰或先前未發布的主機設定。
3. Repository Settings → Pages → Source 選 GitHub Actions。
4. Settings → Secrets and variables → Actions → Variables 設定 SUPABASE_URL、SUPABASE_ANON_KEY，兩者必須來自本系統的新專案。anon key 是公開前端識別金鑰，資料權限由 RLS 控制。
5. 推送 main；.github/workflows/pages.yml 會執行測試、建置並發布 dist/client。
6. 發布成功後，使用 Actions 回傳的實際網址，先用未登入手機實測，再產生正式展場 QR Code。

也可修改 public/site-config.json 填入 Supabase URL／anon key 再重新發布。若尚未設定，活動頁只用 config/catalog.json 提供靜態 AR 預覽，明確顯示「雲端使用統計尚未連接」，不會假裝已記錄。

```sh
node tools/build.mjs --pages
```

GitHub Pages 子目錄路徑為 /admissions-ar-v42/。若改儲存庫名稱，請同步調整工作流程的 PAGES_BASE。

## 更換模型

1. 準備完整循環 GLB、動畫 USDZ 與 PNG／JPG／WebP 封面。
2. 原點設於腳底、尺寸使用公尺。兩種檔案第一段動畫必須包含完整循環；Android 不會自動串接多個片段。
3. 後台加入新模型版本，使用新的代碼與檔案網址，避免快取。填入名稱、版本、封面、兩種模型及循環秒數。
4. 在展場設定選擇新版本並儲存；原 QR Code 不用重印。歷史統計保留原模型版本與當時的展場名稱。
5. 上傳不會自動轉檔、串接動畫或修復模型，資產須先準備完成。

V42 資產工具：

```sh
python tools/prepare_model.py INPUT.glb OUTPUT.glb 合照半愛心 合照YA 合照全愛心
blender --background --factory-startup --python tools/export_usdz.py -- OUTPUT.glb OUTPUT.usdz
```

GLB 工具保留模型、材質、骨架及形態鍵，合併動畫並精簡關鍵影格。交界沿用原姿勢，沒有額外過場，仍需手機確認視覺銜接。

## 統計定義

每次點選可用 AR 啟動按鈕算一次；相同事件 UUID 重送不會重複計數。重複啟動重新計算，不等於不重複訪客、成功 AR 次數或照片數量。
日期／時段以資料庫收到紀錄的時間換算 Asia/Taipei，不量測 AR 內停留秒數。斷網或關閉瀏覽器可能造成延後或遺漏。
這是匿名活動分析，不是防灌水的正式報名人數。

## 驗收

npm test 涵蓋啟動去重、模型替換歷史、日期時區、管理保護、Supabase 呼叫格式、模型時長及結構。
tools/browser_qa.mjs 使用這台電腦已有 Chrome／Playwright 檢查版面、實際 GLB 動畫、連結格式、管理操作及 QR Code，不代表手機 AR 通過。

正式上線前必測：iPhone Safari 及支援 AR 的 Android Chrome 掃碼、下載、相機授權、地面定位、三套循環、快門與照片保存；實際展場首次下載速度；Supabase 管理權限；換模型後同一 QR Code 與歷史統計。

## 主要目錄

src：活動頁、後台、Supabase 介面、3D 預覽。
public：模型、封面與公開設定。
config：靜態預覽初始資料。
supabase/migrations：正式 PostgreSQL schema、RLS、RPC 與儲存政策。
server：僅供本機測試的 Node／SQLite 服務，不發布到 Pages。
.github/workflows：獨立 GitHub Pages 發布流程。

初始工具另產生未使用的框架檔案，已列入忽略清單，不屬於交付內容。


## 新入口：自動相機＋3D 合照

網址：https://slinghuazure-lab.github.io/admissions-ar-v42/ar.html?venue=demo&v=camera4

掃碼後顯示 Loading 動畫，立即要求相機權限。允許後下載角色，準備完成即自動顯示相機與 V42 的 60 秒循環動畫，沒有啟動按鈕。
模型疊加於鏡頭畫面，可拖曳及雙指縮放，不做地面定位。拍照鍵由訪客自行操作，產生的照片包含鏡頭人物／場景與 3D 模型，不含網頁操作介面。
可切換前後鏡頭；前鏡頭的鏡像只套用到相機影像，模型及衣服文字保持正常方向。照片僅在手機內產生，可透過系統分享或下載儲存，不上傳 Supabase。
相機與模型都準備好後才記錄一次使用；切換鏡頭及拍照不會增加啟動人次。離開頁面會停止相機串流。
若拒絕相機權限，頁面顯示瀏覽器授權與重新整理的說明。

新入口檔案為 public/ar.html、public/direct-ar.js、public/direct-ar.css、public/camera-utils.js 與 src/direct-camera.js；3D 程式獨立建置至 camera/camera-runtime.js。
原活動首頁、管理後台及其程式保留。原生 AR 連結工具仍保留供相容性用途，新入口不使用它。
已完成裁切、輸出尺寸與錯誤提示的程式檢查及建置；實際手機的相機授權、模型呈現、照片合成與儲存仍需實機驗收。

新入口使用獨立的 meshopt 壓縮模型（約 28.5 MB），與相機同步準備。原始模型、原活動頁及管理後台保留。更換模型網址後會使用新設定，不會套用既有小菁鷹的壓縮版本。

相機合照入口採用透視鏡頭，角色以固定尺寸放在較遠的虛擬深度；並以滿版顯示。支援的瀏覽器在觸碰合照畫面時進入全螢幕，不新增啟動按鈕。不支援時保留滿版相機；此模式不偵測現場地面。

角色遠近滑桿與雙指手勢會調整透視場景中的 Z 軸距離（3.5～14 虛擬單位），保持角色原尺寸；不是現場距離量測。全螢幕按鈕提供進入及離開功能；不支援的瀏覽器顯示說明，Safari 可加入主畫面以網頁 App 開啟。

合照新入口分階段載入：先顯示約 3.36 MB 的輕量角色並開放合照，再背景下載約 28.5 MB 的完整模型。切換保留角色位置、遠近及動畫時間；照片預覽期間延後切換。完整版失敗時維持輕量模型，離開頁面會取消背景下載並停止鏡頭。原活動首頁與原模型維持既有流程。
