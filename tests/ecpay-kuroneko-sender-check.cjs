const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';
process.env.ECPAY_HASH_KEY = 'test-key';
process.env.ECPAY_HASH_IV = 'test-iv';
process.env.URL = 'https://example.netlify.app';
delete process.env.ECPAY_SENDER_NAME;
delete process.env.ECPAY_SENDER_PHONE;
delete process.env.ECPAY_SENDER_ZIPCODE;
delete process.env.ECPAY_SENDER_ADDRESS;
const { handler } = require('../netlify/functions/ecpay-logistics-create');

const order = {
  order_no: 'D1234567890123', payment_status: '已付款', shipping_method: 'kuroneko',
  shipping_details: { zipcode: '111', city: '台北市士林區', address: '延平北路六段211號二樓之一' },
  order_amount: 1000, shipping_fee: 130, items: [{ name: '原味肉乾' }],
  customer_name: '王小明', customer_phone: '0912345678', customer_email: 'test@example.com'
};
let sent;
global.fetch = async (url, options) => {
  if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin-id' }) };
  if (url.includes('/rest/v1/admin_users?')) return { ok: true, text: async () => JSON.stringify([{ user_id: 'admin-id' }]) };
  if (url.includes('/rest/v1/orders?') && !options?.method) return { ok: true, text: async () => JSON.stringify([order]) };
  if (url.includes('/Express/Create')) {
    sent = Object.fromEntries(options.body);
    return { ok: true, text: async () => '0|test stop' };
  }
  throw new Error(`Unexpected request: ${url}`);
};

(async () => {
  const response = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer test-jwt' }, body: JSON.stringify({ orderNo: order.order_no }) });
  assert.equal(response.statusCode, 400);
  assert.equal(sent.LogisticsSubType, 'TCAT');
  assert.equal(sent.SenderName, '佑陞企業行');
  assert.equal(sent.SenderPhone, '04-8725609');
  assert.equal(sent.SenderCellPhone, undefined);
  assert.equal(sent.SenderZipCode, '511');
  assert.equal(sent.SenderAddress, '彰化縣社頭鄉山腳路2段830號');
  assert.equal(sent.ReceiverZipCode, '111');
  assert.match(sent.ReceiverAddress, /台北市士林區/);
  console.log('ECPay Kuroneko sender checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
