const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';
process.env.ECPAY_HASH_KEY = 'test-key';
process.env.ECPAY_HASH_IV = 'test-iv';
const { checkMacValue } = require('../netlify/functions/_ecpay');
const { logisticsNumbers } = require('../netlify/functions/_ecpay-logistics-number');
const { handler } = require('../netlify/functions/ecpay-logistics-query');

assert.deepEqual(logisticsNumbers({ CVSPaymentNo: '123', CVSValidationNo: '456' }), {
  ecpay_cvs_payment_no: '123', ecpay_cvs_validation_no: '456'
});
assert.deepEqual(logisticsNumbers({ BookingNote: 'TCAT123' }), { ecpay_booking_note: 'TCAT123' });

const order = {
  order_no: 'D1234567890123', logistics_trade_no: '987654321', shipping_method: '711',
  shipping_details: { store711Id: '123456', store711: '測試門市' }
};
let updated;
let query;
let tamper = false;
global.fetch = async (url, options) => {
  if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin-id' }) };
  if (url.includes('/rest/v1/admin_users?')) return { ok: true, text: async () => JSON.stringify([{ user_id: 'admin-id' }]) };
  if (url.includes('/rest/v1/orders?') && !options?.method) return { ok: true, text: async () => JSON.stringify([order]) };
  if (url.includes('/QueryLogisticsTradeInfo/V5')) {
    query = Object.fromEntries(options.body);
    const result = { MerchantID: '3504484', AllPayLogisticsID: order.logistics_trade_no, CVSPaymentNo: '123456789', CVSValidationNo: '2468', LogisticsStatus: '300' };
    result.CheckMacValue = checkMacValue(result, 'md5');
    if (tamper) result.CVSPaymentNo = 'tampered';
    return { ok: true, text: async () => new URLSearchParams(result).toString() };
  }
  if (url.includes('/rest/v1/orders?') && options?.method === 'PATCH') {
    updated = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify([{ ...order, ...updated }]) };
  }
  throw new Error(`Unexpected request: ${url}`);
};

(async () => {
  const event = { httpMethod: 'POST', headers: { authorization: 'Bearer test-jwt' }, body: JSON.stringify({ orderNo: order.order_no }) };
  const response = await handler(event);
  assert.equal(response.statusCode, 200);
  assert.equal(query.AllPayLogisticsID, order.logistics_trade_no);
  assert.equal(updated.shipping_details.store711Id, '123456');
  assert.equal(updated.shipping_details.ecpay_cvs_payment_no, '123456789');
  assert.equal(updated.shipping_details.ecpay_cvs_validation_no, '2468');
  tamper = true;
  updated = null;
  const invalid = await handler(event);
  assert.equal(invalid.statusCode, 400);
  assert.match(JSON.parse(invalid.body).error, /驗證失敗/);
  assert.equal(updated, null);
  const app = readFileSync(require.resolve('../admin/app.js'), 'utf8');
  assert.match(app, /ecpay_cvs_payment_no/);
  assert.match(app, /ecpay_cvs_validation_no/);
  assert.match(app, /data-query-logistics/);
  console.log('ECPay logistics number checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
