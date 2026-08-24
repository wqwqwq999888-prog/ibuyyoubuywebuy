import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../admin/app.js', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../開啟管理後台.html', import.meta.url), 'utf8');

for (const label of ['商品管理', '物流管理', '折扣管理', '團購管理']) {
  assert.ok(html.includes(label), `後台缺少「${label}」`);
}

assert.ok(html.includes('<script src="app.js"></script>'), 'app.js 必須能在直接開啟檔案時執行');
assert.ok(!html.includes('type="module"'), '本地預覽不應依賴 module HTTP 載入');
assert.ok(launcher.includes('url=admin/index.html'), '根目錄啟動頁必須導向後台');
assert.ok(app.includes("free_threshold: 1500"), '超商免運門檻預設值應為 1500');
assert.ok(app.includes("free_threshold: 3000"), '宅配免運門檻預設值應為 3000');

const staticIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const referencedIds = new Set([...app.matchAll(/\$\('#([^']+)'\)/g)].map(match => match[1]));
const dynamicIds = new Set(['field-name', 'field-product_no', 'imagePreview', 'productImage']);
const missing = [...referencedIds].filter(id => !staticIds.has(id) && !dynamicIds.has(id));
assert.deepEqual(missing, [], `找不到畫面元件：${missing.join(', ')}`);

console.log('Admin static checks passed.');
