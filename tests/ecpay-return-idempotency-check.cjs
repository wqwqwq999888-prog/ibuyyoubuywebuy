const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const source = readFileSync(require.resolve('../netlify/functions/ecpay-return.js'), 'utf8');
assert.match(source, /orders\?order_no=eq\./, '重複付款通知必須先查正式訂單');
assert.match(source, /existing\[0\]\.order_amount/, '正式訂單必須再次核對付款金額');
assert.match(source, /existing\.length[\s\S]*?'1\|OK'/, '已存在且同額的訂單必須直接回覆 1|OK');
assert.match(source, /pending_ecpay_orders/, '首次通知仍必須由 pending order 建立正式訂單');
assert.match(source, /try \{ await syncSheet\(created\[0\]\); \}[\s\S]*?catch/, 'Sheet 或 Email 同步失敗不可阻止綠界收到 1|OK');
assert.match(source, /if \(!pending\.length\)[\s\S]*?body: '1\|OK'/, '已取消或已清除的測試交易模擬付款必須只 ACK，不可重建訂單');
console.log('ECPay return idempotency checks passed.');
