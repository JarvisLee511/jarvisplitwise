# 💸 Jarvisplitwise — 朋友出遊分帳

**🌐 線上用:<https://jarvislee511.github.io/jarvisplitwise/>**

一個跟 Splitwise 一樣的分帳 web app,但是:

- ✅ **無筆數限制**(想記幾筆就幾筆)
- ✅ **無廣告**
- ✅ 朋友用「群組代碼」即可共用同一本帳(免註冊帳號)
- ✅ 手機瀏覽器直接開,可加到主畫面像 App 一樣

## 功能

- 建立群組 / 用代碼加入群組(分享連結即可邀請朋友)
- 新增成員、消費紀錄
- 四種分攤方式:**平均分 / 指定金額 / 百分比 / 份數**
- 自動計算每人淨額(誰該收、誰該付)
- **債務簡化**:用最少筆數還清(例如 3 個人不用互轉 6 次)
- 標記還款 / 結算紀錄
- 多裝置即時同步(雲端模式)

---

## 兩種模式

### 1. 本機離線模式(預設,零設定)
直接打開 `index.html` 就能用。資料只存在這台裝置的瀏覽器,**朋友無法共用**。適合自己先試玩。

### 2. 雲端共用模式(朋友各自手機共用)← 你要的
需要一個免費的 Supabase 後端,設定約 5 分鐘,**完全免費**。

---

## 🚀 雲端模式設定(5 分鐘)

1. 到 <https://supabase.com> 用 GitHub 登入 → **New project**
   - 取個名字、設一組資料庫密碼(自己留著就好)、region 選離你近的(如 Tokyo)
   - 等約 1~2 分鐘建好
2. 左側 **SQL Editor** → New query → 把 `supabase/schema.sql` 全部貼上 → **Run**
   (看到 Success 就建好資料表了)
3. 左側 **Project Settings → API**,複製兩個值:
   - **Project URL**(像 `https://xxxx.supabase.co`)
   - **anon public** key(很長一串 `eyJ...`)
4. 打開 `js/supabase-config.js`,把那兩個值填進去:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
5. 重新整理網頁 → 看到「☁️ 雲端同步已啟用」就成功了。

> anon key 放前端是 Supabase 設計上允許的(公開金鑰),真正的保護靠資料表的 RLS 規則(schema.sql 已設好)。群組代碼是隨機 6 碼,等同群組密碼,不知道代碼的人進不來。

---

## 🌐 部署

已經部署好了,就是上面那個網址 —— GitHub Pages,`main` 分支 root 路徑,push 就更新。

手機開網址 → 瀏覽器選單「加到主畫面」就像 App 一樣。

> 雲端模式的金鑰包在前端(這是 Supabase 公開金鑰的正常用法,RLS 保護資料),所以 public repo 也 OK。

---

## 💻 本機預覽

因為用了 ES Module,不能直接雙擊開檔(會被瀏覽器 CORS 擋),要起一個小伺服器:

```bash
cd jarvisplitwise
python -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

---

## 檔案結構

```
jarvisplitwise/
├─ index.html              入口
├─ css/style.css           樣式 (手機友善)
├─ js/
│  ├─ split.js             分帳核心邏輯 (純函式)
│  ├─ db.js                資料層 (雲端/本機雙模式)
│  ├─ supabase-config.js   ← 填你的 Supabase 金鑰
│  └─ app.js               UI 與互動
└─ supabase/schema.sql     資料庫建表 SQL
```
