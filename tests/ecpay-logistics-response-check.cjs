const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';
process.env.ECPAY_HASH_KEY = 'test-key';
process.env.ECPAY_HASH_IV = 'test-iv';
process.env.URL = 'https://example.netlify.app';
const { handler, parseCreateResponse, goodsName } = require('../netlify/functions/ecpay-logistics-create');

const created = parseCreateResponse('1|MerchantID=3504484&MerchantTradeNo=ORDER123&RtnCode=300&RtnMsg=訂單建立成功&AllPayLogisticsID=12345');
assert.equal(created.AllPayLogisticsID, '12345');
assert.equal(created.RtnCode, '300');
assert.throws(() => parseCreateResponse('0|MerchantTradeNo duplicated'), /duplicated/);
assert.throws(() => parseCreateResponse('1|RtnCode=300'), /確認是否已建單/);
assert.equal(goodsName([{ name: '原味肉乾' }, { name: '辣味#肉乾' }]), '原味肉乾 辣味 肉乾');
assert.ok(goodsName([{ name: '肉乾'.repeat(30) }]).length <= 25);

const order = {
  order_no: 'D1234567890123', payment_status: '已付款', shipping_method: '711',
  shipping_details: { store711Id: '123456' }, order_amount: 1000, shipping_fee: 65,
  items: [{ name: '原味#肉乾' }], customer_name: '王小明', customer_phone: '0912345678', customer_email: 'test@example.com'
};
let sent;
let createSucceeds = false;
let saved;
global.fetch = async (url, options) => {
  if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin-id' }) };
  if (url.includes('/rest/v1/admin_users?')) return { ok: true, text: async () => JSON.stringify([{ user_id: 'admin-id' }]) };
  if (url.includes('/rest/v1/orders?') && !options?.method) return { ok: true, text: async () => JSON.stringify([order]) };
  if (url.includes('/Express/Create')) {
    sent = Object.fromEntries(options.body);
    return { ok: true, text: async () => createSucceeds
      ? '1|RtnCode=300&RtnMsg=OK&AllPayLogisticsID=987654321&CVSPaymentNo=123456789&CVSValidationNo=2468'
      : '0|10500000 Test rejection' };
  }
  if (url.includes('/rest/v1/orders?') && options?.method === 'PATCH') {
    saved = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify([{ ...order, ...saved }]) };
  }
  throw new Error(`Unexpected request: ${url}`);
};

handler({ httpMethod: 'POST', headers: { authorization: 'Bearer test-jwt' }, body: JSON.stringify({ orderNo: order.order_no }) })
  .then(async response => {
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /10500000 Test rejection/);
    assert.equal(sent.LogisticsSubType, 'UNIMARTC2C');
    assert.equal(sent.GoodsAmount, '935');
    assert.equal(sent.CollectionAmount, sent.GoodsAmount);
    assert.equal(sent.IsCollection, 'N');
    assert.equal(sent.GoodsName, '原味 肉乾');
    createSucceeds = true;
    const success = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer test-jwt' }, body: JSON.stringify({ orderNo: order.order_no }) });
    assert.equal(success.statusCode, 200);
    assert.equal(saved.logistics_trade_no, '987654321');
    assert.equal(saved.shipping_details.store711Id, '123456');
    assert.equal(saved.shipping_details.ecpay_cvs_payment_no, '123456789');
    assert.equal(saved.shipping_details.ecpay_cvs_validation_no, '2468');
    console.log('ECPay logistics response checks passed.');
  })
  .catch(error => { console.error(error); process.exitCode = 1; });
