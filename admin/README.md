# 商店管理後台

這個目錄是獨立的新後台，不會取代或修改目前的 `index.html`、`checkout.html`，因此現有官網仍依原本資料運作。

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

開啟 `http://localhost:8080/admin/`。`config.js` 預設為 `local`，資料會保存在這台瀏覽器的 `localStorage`；這只適合介面測試，清除瀏覽器資料後會恢復預設資料。

## 「本地操作模式」是什麼？

- 您可以真的按新增、編輯、儲存及上傳一張商品圖片。
- 修改內容只會保存在目前使用的瀏覽器中。
- 不會修改 `index.html` 或 `checkout.html`。
- 不會出現在正式官網，也不會影響客人下單。
- 目前不需要管理員帳號或密碼。
- 清除這個網站的瀏覽器資料後，會恢復最初預載的 11 項商品。
- 等您確認操作方式與畫面後，才會連接正式 Supabase 雲端資料庫。

本地模式已預載目前 8 項單包與 3 項組合商品。組合與單包使用完全相同的商品資料格式，沒有獨立的組合管理功能。

## 正式雲端模式（尚未部署）

1. 建立 Supabase 專案。
2. 執行 `supabase/migrations/20260824000000_admin_backend.sql`。
3. 在 Supabase Authentication 建立管理員 Email／密碼帳號。
4. 到 Authentication 的 users 資料取得該帳號 UUID，加入管理員：

```sql
insert into public.admin_users(user_id, display_name)
values ('管理員的 auth user UUID', '商店管理員');
```

5. 修改 `admin/config.js`：

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

## 功能名稱

側邊選單依需求固定為：

1. 商品管理
2. 物流管理
3. 折扣管理
4. 團購管理

## 尚未影響官網的部分

目前官網尚未改讀雲端商品、物流、折扣或團購資料。因此在後台本地操作或未來先建立雲端資料，都不會改變客人目前看到的商品及結帳流程。等後台資料驗收完成後，才會另行把官網切換至後端 API。
