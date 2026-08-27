const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const create = readFileSync(require.resolve('../netlify/functions/ecpay-logistics-create.js'), 'utf8');
const callback = readFileSync(require.resolve('../netlify/functions/ecpay-logistics-callback.js'), 'utf8');
const migration = readFileSync(require.resolve('../supabase/migrations/20260827000000_ecpay_logistics.sql'), 'utf8');

assert.ok(create.includes("order.payment_status === '已付款'"), '已付款訂單可以建立物流單');
assert.ok(create.includes("order.payment_method === 'bank'") && create.includes("order.payment_status === '已匯款待確認'"), '已送出匯款資料的銀行匯款訂單也可以建立物流單');
assert.ok(create.includes("'711': 'UNIMARTC2C'") && create.includes("family: 'FAMIC2C'"), '必須支援 7-ELEVEN 與全家 C2C');
assert.ok(create.includes('requireAdmin(event)') && create.includes('/auth/v1/user'), 'server 必須驗證管理員 JWT');
for (const value of ['order.items', 'order.order_amount', 'order.customer_name', 'order.customer_phone', 'order.customer_email', 'order.note']) assert.ok(create.includes(value), `物流建單缺少 ${value}`);
assert.ok(create.includes('order.logistics_trade_no') && create.includes('logistics_trade_no=eq.'), '不得重複建立物流單');
assert.ok(callback.includes('checkMacValue') && callback.includes("body: '1|OK'"), 'callback 必須驗證 CheckMacValue 並正確回覆');
for (const column of ['logistics_trade_no', 'logistics_status', 'logistics_message', 'logistics_created_at']) assert.ok(migration.includes(column), `migration 缺少 ${column}`);
console.log('ECPay logistics checks passed.');
