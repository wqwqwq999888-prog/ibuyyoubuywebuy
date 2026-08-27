const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const server = readFileSync(require.resolve('../netlify/functions/ecpay-checkout.js'), 'utf8');
const checkout = readFileSync(require.resolve('../checkout.html'), 'utf8');

assert.match(server, /TradeDesc:[\s\S]*?付款人：\$\{payerName\}[\s\S]*?電話：\$\{payerPhone\}/, '交易描述應顯示付款人姓名及電話');
assert.match(server, /CustomField1:[\s\S]*?payerName/, 'CustomField1 應保存付款人姓名');
assert.match(server, /CustomField2:[\s\S]*?payerPhone/, 'CustomField2 應保存付款人電話');
assert.match(server, /CustomField3:[\s\S]*?payerEmail/, 'CustomField3 應保存付款人 Email');
assert.match(server, /body: JSON\.stringify\(\{ params, CheckMacValue: checkMacValue \}\)/, 'server 應回傳實際簽署的完整參數');
assert.ok(checkout.includes('Object.assign(params, data.params, { CheckMacValue: data.CheckMacValue })'), '前端應原樣提交 server 簽署的參數');
assert.ok(!checkout.includes('params.CheckMacValue = data.CheckMacValue'), '所有付款入口都必須提交 server 回傳的完整參數，不可只取簽章');
console.log('ECPay payer information checks passed.');
