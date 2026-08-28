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

開啟 `http://localhost:8080/admin/`。正式設定的 `config.js` 使用 Supabase；只有開發者明確切換成 `local` 時，介面測試資料才會保存在目前瀏覽器的 `localStorage`。物流設定在本地模式禁止儲存，以免誤以為已同步到正式網站。

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

側邊選單提供：

1. 商品管理
2. 物流管理
3. 折扣管理
4. 團購管理
5. 訂單管理

## 正式訂單流程

- Supabase `orders` 是主資料庫；Google Sheet 是由 Netlify Functions 同步的 24 欄副本。
- 銀行匯款只有在客戶填妥後五碼並正式送出後建立，初始狀態為「已匯款待確認／待出貨」。
- 綠界訂單暫存在 `pending_ecpay_orders`，只有 ReturnURL 驗證 CheckMacValue、成功代碼及金額後才轉為正式訂單；付款失敗不會進入 orders 或試算表。
- 後台可選擇顯示欄位，選擇保存在瀏覽器；修改付款／出貨狀態會呼叫 server function 並同步試算表。

Netlify 正式環境需設定 `SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`GOOGLE_SHEET_WEBHOOK_URL`、`GOOGLE_SHEET_WEBHOOK_SECRET`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`。`sb_secret_` 僅由 server-side function 放在 `apikey` header，絕不可作為 Bearer JWT。請在 Apps Script 的 Script Properties 設定同一份 `WEBHOOK_SECRET`，不要寫入 repository 或貼在對話中。

請先以正式專案 `astounding-rabanadas-a0a6e1` 的 Deploy Preview 驗收；驗收前不要合併，也不要部署到 Production。不得操作 `merry-biscuit-5014fe`。

## 官網資料同步

官網首頁與結帳頁會載入已上架商品；後台修改商品名稱、價格、規格、說明、圖片、分類、排序或上下架後，前台重新載入即可同步。結帳頁會沿用首頁本次瀏覽取得的商品目錄快照，避免顧客加入購物車後因後台調整排序而對應到其他商品。

結帳頁的物流方式、基本運費、免運門檻與啟用狀態由 Netlify Function 即時讀取 Supabase。建立訂單時，伺服器會再次讀取物流設定、拒絕停用方式，並重算運費及訂單總額；瀏覽器送來的運費與總額不會成為訂單計價依據。
