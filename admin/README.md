# 商店管理後台

前台 `index.html` 與 `checkout.html` 會透過 `storefront-data.js` 讀取這個後台所管理的商品、物流、折扣與團購資料；Supabase 模式以雲端資料為準，本地模式則共用同一份瀏覽器資料。

## 最簡單的本地操作方式（不需要終端機）

1. 打開 repository 資料夾。
2. 直接雙擊根目錄的 `開啟管理後台.html`。
3. 瀏覽器會自動開啟白色管理後台。

後台已改用一般 JavaScript，不需要先架設網站伺服器；商品新增、修改、圖片預覽、物流設定、折扣與團購都可以直接在本機檔案模式操作。

## 使用本地伺服器預覽（開發人員選用）

在 repository 根目錄執行：

```bash
python -m http.server 8080
```

開啟 `http://localhost:8080/admin/`。目前 `config.js` 設為 `supabase`，因此會連接雲端專案並要求管理員登入；若要進行不影響雲端資料的介面測試，請先在自己的測試分支把 `mode` 暫時改成 `local`，資料才會保存在該瀏覽器的 `localStorage`。

## 「本地操作模式」是什麼？

- 您可以真的按新增、編輯、儲存及上傳一張商品圖片。
- 修改內容只會保存在目前使用的瀏覽器中。
- 不會修改 `index.html` 或 `checkout.html`。
- 不會出現在正式官網，也不會影響客人下單。
- 目前不需要管理員帳號或密碼。
- 清除這個網站的瀏覽器資料後，會恢復最初預載的 11 項商品。
- 等您確認操作方式與畫面後，才會連接正式 Supabase 雲端資料庫。

本地模式已預載目前 8 項單包與 3 項組合商品。組合與單包使用完全相同的商品資料格式，沒有獨立的組合管理功能。

## 正式雲端模式

1. 建立 Supabase 專案。
2. 執行 `supabase/migrations/20260824000000_admin_backend.sql`。
3. 執行 `supabase/migrations/20260824010000_storefront_catalog.sql`；此 migration 可重複執行，會安全地更新前台唯讀 policy。
4. 執行 `supabase/migrations/20260824020000_product_image_storage.sql`；這會建立或修復商品圖片 bucket 與管理員上傳權限。
5. 在 Supabase Authentication 建立管理員 Email／密碼帳號。
6. 到 Authentication 的 users 資料取得該帳號 UUID，加入管理員：

```sql
insert into public.admin_users(user_id, display_name)
values ('管理員的 auth user UUID', '商店管理員');
```

7. 修改 `admin/config.js`：

```js
window.ADMIN_CONFIG = {
  mode: 'supabase',
  supabaseUrl: 'https://您的專案.supabase.co',
  supabaseAnonKey: '公開 anon key',
  siteUrl: 'https://正式官網網址'
};
```

`anon key` 可以放在瀏覽器中；資料安全由資料庫的 Row Level Security 控制。`service_role key` 絕對不可放進這個檔案或任何前端程式。

## 圖片

- 每項商品只有一張主圖。
- 本地模式會將圖片轉成 Data URL 放入瀏覽器暫存，只供測試。
- 雲端模式會上傳到私有管理權限、公開讀取的 `product-images` bucket，商品只保存圖片 URL。
- 接受 JPG、PNG、WebP，SQL 設定單檔上限 5 MB。
- 儲存時會自動將長邊縮至最多 1600px 並壓縮，因此手機或 AI 產生的大圖也可直接選取上傳。

## 功能名稱

側邊選單依需求固定為：

1. 商品管理
2. 物流管理
3. 折扣管理
4. 團購管理

## 前台資料同步

- 上架商品會出現在前台，下架商品不顯示。
- 一般商品與組合商品由「商品類型」區分；組合商品可逐行設定組合內容。
- 折扣碼可限制適用商品編號，留白表示適用全部商品。
- 雲端環境需套用 `supabase/migrations/20260824010000_storefront_catalog.sql`，讓公開前台具有唯讀權限；管理寫入權限仍只屬於管理員。
