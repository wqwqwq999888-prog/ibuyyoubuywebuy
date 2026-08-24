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
assert.ok(checkout.includes('storeData.shipping_methods.find'), '結帳運費必須讀取後台物流設定');
assert.ok(checkout.includes("f.product_type === 'combo'"), '組合規格必須獨立顯示');
assert.ok(checkout.includes('StorefrontData.calculateDiscount'), '結帳折扣必須使用共用後台資料計算');

const staticIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const referencedIds = new Set([...app.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]));
const dynamicIds = new Set(['field-name', 'field-product_no', 'imagePreview', 'productImage']);
const missing = [...referencedIds].filter(id => !staticIds.has(id) && !dynamicIds.has(id));
assert.deepEqual(missing, [], `找不到畫面元件：${missing.join(', ')}`);

console.log('Admin static checks passed.');
