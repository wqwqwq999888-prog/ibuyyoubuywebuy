const assert = require('node:assert/strict');
process.env.ECPAY_HASH_KEY = 'test-key';
process.env.ECPAY_HASH_IV = 'test-iv';
process.env.ECPAY_MERCHANT_ID = '3504484';
process.env.GOOGLE_SHEET_WEBHOOK_URL = 'https://example.invalid/webhook';
const { checkMacValue } = require('../netlify/functions/_ecpay');
const orderModule = require('../netlify/functions/_orders');
const id = 'DZM1234567890123';
const campaignId = 'f1081312-e799-4678-9be7-48b475abefdb';
const original = {
  order_no: id, expected_amount: 2529, created_at: '2026-10-19T10:55:44Z',
  payload: { orderId: id, customer: { name: '測試客戶', phone: '0900000000', email: 'test@example.com' },
    items: [{ productNo: '100001', name: '商品', price: 2810, qty: 1 }],
    productAmount: 2810, discountAmount: 281, shippingFee: 0, total: 2529,
    payment: 'credit', shipping: { method: '711', store711Id: '123456' }, campaignId, discountCode: 'TEST9' }
};
let pending, saved, payment, denied, sheetFails, syncs, purchases, writes, badMac;
function reset() {
  pending = structuredClone(original); saved = null; denied = false; sheetFails = false; syncs = 0; purchases = 0; writes = 0; badMac = false;
  payment = { MerchantID: '3504484', MerchantTradeNo: id, TradeNo: '2610190000000001', TradeAmt: '2529', TradeStatus: '1', PaymentDate: '2026/10/19 18:56:58' };
}
require.cache[require.resolve('../netlify/functions/_orders')].exports = {
  ...orderModule,
  requireAdmin: async () => { if (denied) throw Object.assign(new Error('登入已過期'), { statusCode: 401 }); },
  validateProductPricing: async () => { throw new Error('Paid orders must not be repriced'); },
  addProductCosts: async order => ({ ...order, product_cost: 1000 }),
  syncSheet: async () => { syncs++; if (sheetFails) throw new Error('sync down'); },
  supabase: async (path, options = {}) => {
    if (path.startsWith('campaigns?')) return [{ id: campaignId, partner_name: '團主' }];
    if (path.startsWith('pending_ecpay_orders?')) {
      if (options.method === 'DELETE') { pending = null; return null; }
      return pending ? [pending] : [];
    }
    if (path.startsWith('orders?')) {
      if (options.method === 'POST') { writes++; if (saved) return []; saved = JSON.parse(options.body); return [saved]; }
      return saved ? [saved] : [];
    }
    throw new Error(`Unexpected request ${path}`);
  }
};
require('../netlify/functions/_analytics');
require.cache[require.resolve('../netlify/functions/_analytics')].exports = { sendPurchase: async () => { purchases++; } };
global.fetch = async (url, options) => {
  assert.equal(url, 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5');
  const request = Object.fromEntries(new URLSearchParams(options.body));
  assert.equal(request.CheckMacValue, checkMacValue(request));
  const result = { ...payment, CheckMacValue: badMac ? 'INVALID' : checkMacValue(payment) };
  return { ok: true, text: async () => new URLSearchParams(result).toString() };
};
const { handler } = require('../netlify/functions/ecpay-reconcile');
const call = (action = 'recover') => handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ orderNo: id, action, approved: true }) });

(async () => {
  reset(); denied = true;
  assert.equal((await call()).statusCode, 401); assert.equal(writes, 0);
  for (const invalid of [{ TradeStatus: '0' }, { SimulatePaid: '1' }, { MerchantID: 'other' }, { MerchantTradeNo: 'other' }, { TradeAmt: '2530' }]) {
    reset(); Object.assign(payment, invalid);
    assert.equal((await call()).statusCode, 400); assert.equal(writes, 0); assert.ok(pending); assert.equal(syncs, 0);
  }
  reset(); badMac = true;
  assert.equal((await call()).statusCode, 400); assert.equal(writes, 0);
  reset(); pending = null;
  assert.equal((await call()).statusCode, 404); assert.equal(writes, 0);
  reset(); pending.payload.items[0].price = 1;
  assert.equal((await call()).statusCode, 400); assert.equal(writes, 0);
  reset();
  assert.equal(JSON.parse((await call('inspect')).body).verified, true);
  assert.equal(writes, 0); assert.equal(syncs, 0); assert.ok(pending);
  const result = JSON.parse((await call()).body);
  assert.equal(result.sheetSynced, true); assert.equal(writes, 1); assert.equal(syncs, 1); assert.equal(purchases, 1); assert.equal(pending, null);
  assert.equal(saved.created_at, original.created_at);
  assert.equal(saved.shipping_details.campaign_id, campaignId);
  assert.equal(saved.partner_name, '團主'); assert.equal(saved.discount_amount, 281);
  assert.equal(saved.order_amount, 2529); assert.equal(saved.payment_status, '已付款');
  reset(); sheetFails = true;
  assert.equal((await call()).statusCode, 400); assert.ok(pending); assert.equal(writes, 1);
  sheetFails = false;
  assert.equal(JSON.parse((await call()).body).sheetSynced, true); assert.equal(writes, 1); assert.equal(syncs, 2); assert.equal(pending, null);
  reset(); saved = { order_amount: 2529, trade_no: 'DIFFERENT', payment_status: '已付款' };
  assert.equal((await call()).statusCode, 400); assert.equal(syncs, 0);

  // A signed simulator callback must not read/write orders or sync mail.
  reset();
  const callback = { MerchantID: '3504484', MerchantTradeNo: id, TradeNo: 'SIMULATED', TradeAmt: '2529', RtnCode: '1', SimulatePaid: '1' };
  callback.CheckMacValue = checkMacValue(callback);
  const { handler: callbackHandler } = require('../netlify/functions/ecpay-return');
  assert.equal((await callbackHandler({ httpMethod: 'POST', body: new URLSearchParams(callback).toString() })).body, '1|OK');
  assert.equal(writes, 0); assert.equal(syncs, 0); assert.ok(pending);
  reset();
  const unapproved = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({orderNo:id,action:'recover'}) });
  assert.equal(unapproved.statusCode, 400); assert.equal(writes, 0);
  const realCallback = { ...callback, SimulatePaid: '0', TradeNo: payment.TradeNo };
  realCallback.CheckMacValue = checkMacValue(realCallback);
  const deliver = () => callbackHandler({ httpMethod: 'POST', body: new URLSearchParams(realCallback).toString() });
  reset(); sheetFails = true;
  assert.equal((await deliver()).body, '0|OrderError'); assert.equal(writes, 1); assert.ok(pending);
  sheetFails = false;
  assert.equal((await deliver()).body, '1|OK'); assert.equal(writes, 1); assert.equal(syncs, 2); assert.equal(pending, null);
  assert.equal((await deliver()).body, '1|OK'); assert.equal(syncs, 2);
  reset(); pending.check_status = 'paid_missing';
  assert.equal((await deliver()).body, '1|OK'); assert.equal(writes, 0); assert.equal(syncs, 0);
  reset(); pending = null;
  assert.equal((await deliver()).body, '0|OrderError'); assert.equal(writes, 0);
  console.log('ECPay reconciliation and simulation checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
