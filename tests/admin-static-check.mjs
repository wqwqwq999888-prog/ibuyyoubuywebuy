import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../admin/app.js', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../開啟管理後台.html', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('../checkout.html', import.meta.url), 'utf8');
const report = readFileSync(new URL('../partner-report.html', import.meta.url), 'utf8');
const reportScript = readFileSync(new URL('../partner-report.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../admin/config.js', import.meta.url), 'utf8');

for (const label of ['商品管理', '物流管理', '折扣管理', '團購管理']) {
  assert.ok(html.includes(label), `後台缺少「${label}」`);
}

assert.ok(html.includes('<script src="app.js"></script>'), 'app.js 必須能在直接開啟檔案時執行');
assert.ok(!html.includes('type="module"'), '本地預覽不應依賴 module HTTP 載入');
assert.ok(launcher.includes('url=admin/index.html'), '根目錄啟動頁必須導向後台');
assert.ok(app.includes("free_threshold: 1500"), '超商免運門檻預設值應為 1500');
assert.ok(app.includes("free_threshold: 3000"), '宅配免運門檻預設值應為 3000');
assert.ok(app.includes('commission_rate'), '團購活動必須支援佣金比例');
assert.ok(app.includes('partner-report.html?token='), '團購活動必須產生私人報表連結');
assert.ok(report.includes('id="year"') && report.includes('id="month"'), '團購主報表必須能選年份與月份');
assert.ok(reportScript.includes('/rest/v1/rpc/partner_monthly_report'), '雲端團購主報表必須呼叫安全的報表函式');
assert.ok(config.includes("mode: 'supabase'"), '後台應使用 Supabase 雲端模式');
assert.ok(checkout.includes('id="discountCode"'), '結帳頁必須提供折扣碼欄位');
assert.ok(checkout.includes('discountedSubtotal >= 3000'), '宅配應以折扣後 3000 元判斷免運');

const staticIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const referencedIds = new Set([...app.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]));
const dynamicIds = new Set(['field-name', 'field-product_no', 'imagePreview', 'productImage']);
const missing = [...referencedIds].filter(id => !staticIds.has(id) && !dynamicIds.has(id));
assert.deepEqual(missing, [], `找不到畫面元件：${missing.join(', ')}`);

console.log('Admin static checks passed.');

const ORDER_COLUMN_NAMES = ['created_at','order_no','customer_name','customer_phone','customer_email','items','order_amount','shipping_method','shipping_details','transfer_last_five','transfer_time','note','payment_status','shipping_status','trade_no','shipped_at','completed_at','product_cost','product_amount','discount_amount','shipping_fee','discount_code','partner_name','gross_profit'];
const migration = readFileSync(new URL('../supabase/migrations/20260825000000_order_management.sql', import.meta.url), 'utf8');
const reconcileMigration = readFileSync(new URL('../supabase/migrations/20260825020000_reconcile_order_columns.sql', import.meta.url), 'utf8');
const orderHelper = readFileSync(new URL('../netlify/functions/_orders.js', import.meta.url), 'utf8');
const ecpayReturn = readFileSync(new URL('../netlify/functions/ecpay-return.js', import.meta.url), 'utf8');
assert.ok(html.includes('訂單管理') && app.includes('ORDER_COLUMNS'), '後台必須提供 24 欄訂單管理');
assert.equal((app.match(/\['[^']+','[^']+'\]/g) || []).filter(value => ORDER_COLUMN_NAMES.some(name => value.includes(`'${name}'`))).length, 24, '訂單欄位必須是 24 欄');
assert.ok(checkout.includes('id="emailMarketingConsent"') && checkout.includes('emailMarketingConsent').valueOf(), 'Email 行銷同意必須獨立存在');
assert.ok(!checkout.includes('選填，預設不勾選；不影響訂單通知'), '行銷同意旁不應顯示冗長的內部規則說明');
assert.match(checkout, /emailMarketingConsent'\)\.checked = false/, 'Email 行銷同意每次進入結帳必須預設不勾選');
assert.ok(checkout.includes('/.netlify/functions/order-create'), '銀行匯款必須透過 server endpoint 建立訂單');
assert.match(checkout, /<div class="payment-options">[\s\S]*?<\/div>\s*<\/div>\s*<!-- 折扣碼 -->/, '付款方式、折扣碼必須是獨立 panel');
assert.match(checkout, /<!-- 折扣碼 -->[\s\S]*?<\/div>\s*<!-- 備註 -->\s*<div class="panel">/, '折扣碼、訂單備註必須是獨立 panel');
assert.ok(checkout.includes('class="discount-entry"'), '折扣碼輸入框必須使用深色結帳頁樣式');
assert.ok(html.includes('id="monthSales"') && html.includes('id="yearProfit"'), '訂單後台必須提供月／年銷售及淨利統計');
assert.ok(app.includes("payment_status==='已付款'") && app.includes('renderOrderSummary'), '營運統計只能計入已付款訂單');
assert.ok(orderHelper.includes('addProductCosts') && checkout.includes('productNo:'), '正式訂單必須依商品後台成本計算毛利');
assert.ok(!checkout.includes('script.google.com/macros'), '結帳前端不得直接寫入 Google Sheet');
assert.ok(migration.includes("'已匯款待確認'") && migration.includes("'已完成'"), 'migration 必須限制付款與出貨狀態');
assert.ok(reconcileMigration.includes('add column if not exists') && reconcileMigration.includes('pending_ecpay_orders'), '既有部分 schema 必須能安全補齊');
const statusSync = readFileSync(new URL('../netlify/functions/order-status-sync.js', import.meta.url), 'utf8');
const orderCreate = readFileSync(new URL('../netlify/functions/order-create.js', import.meta.url), 'utf8');
const sheetScript = readFileSync(new URL('../google-apps-script/order-fields.gs', import.meta.url), 'utf8');
assert.ok(sheetScript.includes("request.action === 'upsertOrder'") && sheetScript.includes('notifyNewServerOrder_'), '只有正式新建訂單可寄送確認信');
assert.ok(sheetScript.includes("headers.indexOf('訂單編號')") && sheetScript.includes('sheets[0]'), 'Apps Script 必須能辨識既有訂單工作表');
assert.ok(sheetScript.includes("SpreadsheetApp.openById(ORDER_SPREADSHEET_ID)") && sheetScript.includes("ORDER_FROM_EMAIL = 'dzhenmai@gmail.com'"), '訂單副本與寄件人必須固定使用正式設定');
assert.ok(checkout.includes("store711Address: document.getElementById('store711Address')") && checkout.includes("storefamilyAddress: document.getElementById('storefamilyAddress')"), '結帳訂單必須保留超商門市地址');
assert.ok(sheetScript.includes('shippingMethodText_(order.shipping_method)') && sheetScript.includes('deliveryInfoText_(order.shipping_method, shippingDetails)'), 'Sheet 必須寫入可讀的配送方式與門市資料');
assert.ok(app.includes('shippingDetailsText(order)') && !app.includes("escapeHtml(JSON.stringify(order[key]||{}))"), '後台不得直接顯示配送 JSON');
assert.ok(orderCreate.includes('const existing = await supabase') && orderCreate.includes('sheetSynced'), '銀行匯款建單重試不可重複建立訂單，Sheet 失敗不可誤報訂單失敗');
assert.ok(statusSync.includes('event.headers.Authorization'), 'Netlify 管理員驗證必須兼容 Authorization header 大小寫');
assert.ok(orderHelper.includes("responseText !== 'OK'"), 'Google Sheet webhook 必須檢查 Apps Script 回應內容');
assert.ok(orderHelper.includes("apikey: SUPABASE_KEY") && !orderHelper.includes('Bearer ${SUPABASE_KEY}'), 'sb_secret_ 只能作為 apikey');
assert.ok(ecpayReturn.includes("params.RtnCode === '1'") && ecpayReturn.includes('expected_amount'), '綠界成功及金額驗證後才可建立訂單');
