const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

const catalog = [
  { product_no: '100001', name: '後台商品名稱', price: 220 },
  { product_no: '200001', name: '後台組合名稱', price: 600 }
];

global.fetch = async url => {
  assert.match(String(url), /enabled=eq\.true/);
  return { ok: true, text: async () => JSON.stringify(catalog) };
};

const { normalizeOrder, validateProductPricing } = require('../netlify/functions/_orders');

function payload(overrides = {}) {
  return {
    orderId: 'DZM-TEST',
    customer: { name: '測試', phone: '0912345678', email: 'test@example.com' },
    items: [
      { productNo: '100001', name: '竄改名稱', price: 1, qty: 2 },
      { productNo: '200001', name: '竄改組合', price: 1, qty: 1 }
    ],
    productAmount: 1040,
    discountAmount: 0,
    shippingFee: 65,
    total: 1105,
    ...overrides
  };
}

(async () => {
  const order = await validateProductPricing(normalizeOrder(payload(), '待付款'));
  assert.deepEqual(order.items, [
    { productNo: '100001', name: '後台商品名稱', price: 220, qty: 2 },
    { productNo: '200001', name: '後台組合名稱', price: 600, qty: 1 }
  ]);
  assert.equal(order.product_amount, 1040);
  assert.equal(order.order_amount, 1105);

  await assert.rejects(
    validateProductPricing(normalizeOrder(payload({ productAmount: 2, total: 27 }), '待付款')),
    /商品價格已更新/
  );

  catalog.pop();
  await assert.rejects(
    validateProductPricing(normalizeOrder(payload(), '待付款')),
    /已下架或不存在/
  );

  console.log('Order product pricing checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
