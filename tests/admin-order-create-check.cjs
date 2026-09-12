const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

let inserted;
let shipping = { id: '711', fee: 65, free_threshold: 1500 };
global.fetch = async (url, options = {}) => {
  const requestUrl = String(url);
  if (requestUrl.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin-id' }) };
  if (requestUrl.includes('/admin_users?')) return { ok: true, text: async () => JSON.stringify([{ user_id: 'admin-id' }]) };
  if (requestUrl.includes('/products?')) return { ok: true, text: async () => JSON.stringify([
    { product_no: '100001', name: '肉乾', price: 220, cost: 100 },
    { product_no: '200001', name: '禮盒', price: 600, cost: 300 }
  ]) };
  if (requestUrl.includes('/shipping_methods?')) return { ok: true, text: async () => JSON.stringify([shipping]) };
  if (requestUrl.endsWith('/rest/v1/orders')) {
    inserted = JSON.parse(options.body);
    return { ok: true, text: async () => JSON.stringify([{ ...inserted, created_at: new Date().toISOString(), gross_profit: inserted.order_amount - inserted.product_cost }]) };
  }
  throw new Error(`Unexpected request: ${requestUrl}`);
};

const { handler } = require('../netlify/functions/admin-order-create');
const event = overrides => ({
  httpMethod: 'POST', headers: { Authorization: 'Bearer admin-jwt' },
  body: JSON.stringify({
    customer: { name: '私訊客人', phone: '0912345678', email: '' }, contact: { type: 'line', value: 'line-friend' },
    items: [{ productNo: '100001', qty: 2 }, { productNo: '200001', qty: 1 }],
    discountAmount: 140, paymentMethod: 'cash', paymentStatus: '已付款', shippingStatus: '已完成', shipping: { method: 'meetup', details: {} }, note: '私訊訂單',
    ...overrides
  })
});

(async () => {
  const response = await handler(event());
  assert.equal(response.statusCode, 201);
  assert.equal(inserted.product_amount, 1040);
  assert.equal(inserted.discount_amount, 140);
  assert.equal(inserted.order_amount, 900);
  assert.equal(inserted.product_cost, 500);
  assert.equal(inserted.shipping_method, 'meetup');
  assert.equal(inserted.shipping_fee, 0);
  assert.equal(inserted.trade_no, '');
  assert.equal(inserted.shipping_details.contact_type, 'line');
  assert.match(inserted.order_no, /^MAN-/);

  const invalid = await handler(event({ discountAmount: 2000 }));
  assert.equal(invalid.statusCode, 400);
  assert.match(JSON.parse(invalid.body).error, /折扣金額/);

  const shipped = await handler(event({ shipping: { method: '711', details: { store711Id: '123456', store711: '測試門市' } } }));
  assert.equal(shipped.statusCode, 201);
  assert.equal(inserted.shipping_method, '711');
  assert.equal(inserted.shipping_fee, 65);
  assert.equal(inserted.order_amount, 965);
  console.log('Admin manual order checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
