const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');

process.env.ECPAY_HASH_KEY = 'test-hash-key';
process.env.ECPAY_HASH_IV = 'test-hash-iv';

function checkMac(params) {
  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  let value = `HashKey=${process.env.ECPAY_HASH_KEY}`;
  sorted.forEach(key => { value += `&${key}=${params[key]}`; });
  value += `&HashIV=${process.env.ECPAY_HASH_IV}`;
  value = encodeURIComponent(value).toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_')
    .replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');
  return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

const originalLoad = Module._load;
let existingAmount = 650;
let queriedPending = false;

Module._load = function(request, parent, isMain) {
  if (request === './_orders' && parent?.filename.endsWith('/netlify/functions/ecpay-return.js')) {
    return {
      supabase: async path => {
        if (path.startsWith('orders?')) return [{ order_no: 'DZMTEST1', order_amount: existingAmount }];
        queriedPending = true;
        throw new Error(`不應查詢 pending order: ${path}`);
      },
      normalizeOrder: () => { throw new Error('不應重建既有訂單'); },
      addProductCosts: () => { throw new Error('不應重建既有訂單'); },
      syncSheet: () => { throw new Error('不應重複同步 Sheet'); }
    };
  }
  return originalLoad(request, parent, isMain);
};

const { handler } = require('../netlify/functions/ecpay-return');
Module._load = originalLoad;

async function send(tradeAmount) {
  const params = {
    MerchantTradeNo: 'DZMTEST1',
    RtnCode: '1',
    TradeAmt: String(tradeAmount),
    TradeNo: 'TESTTRADE1'
  };
  params.CheckMacValue = checkMac(params);
  return handler({ httpMethod: 'POST', body: new URLSearchParams(params).toString() });
}

(async () => {
  const duplicate = await send(650);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body, '1|OK');
  assert.equal(duplicate.headers['Content-Type'], 'text/plain');
  assert.equal(queriedPending, false, '既有訂單不可再次查詢或消耗 pending order');

  existingAmount = 651;
  const mismatch = await send(650);
  assert.equal(mismatch.statusCode, 200);
  assert.equal(mismatch.body, '0|AmountError');

  console.log('ECPay return idempotency checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
