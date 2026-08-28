const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

let catalog = [
  { product_no: '100001', name: '後台商品名稱', price: 220 },
  { product_no: '200001', name: '後台組合名稱', price: 600 }
];
let shipping = { id: '711', name: '7-ELEVEN', fee: 69, free_threshold: 1500, enabled: true };

global.fetch = async url => {
  const requestUrl = String(url);
  if (requestUrl.includes('/shipping_methods?')) {
    return { ok: true, text: async () => JSON.stringify(shipping && requestUrl.includes(`id=eq.${shipping.id}`) ? [shipping] : []) };
  }
  assert.match(requestUrl, /products\?.*enabled=eq\.true/);
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
    shipping: { method: '711' },
    shippingFee: 1,
    total: 1,
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
  assert.equal(order.shipping_fee, 69, '後端必須使用最新雲端基本運費，不可信任瀏覽器數值');
  assert.equal(order.order_amount, 1109, '後端必須用雲端運費重算訂單總額');

  for (const method of [
    { id: 'family', name: '全家', fee: 72, free_threshold: 1600 },
    { id: 'kuroneko', name: '黑貓宅配', fee: 145, free_threshold: 3200 }
  ]) {
    shipping = { ...method, enabled: true };
    const methodOrder = await validateProductPricing(normalizeOrder(payload({ shipping: { method: method.id } }), '待付款'));
    assert.equal(methodOrder.shipping_fee, method.fee, `${method.name}必須套用各自的雲端基本運費`);
    assert.equal(methodOrder.order_amount, 1040 + method.fee);
  }

  shipping = { id: '711', name: '7-ELEVEN', fee: 69, free_threshold: 1000, enabled: true };
  const freeOrder = await validateProductPricing(normalizeOrder(payload(), '待付款'));
  assert.equal(freeOrder.shipping_fee, 0, '折扣後商品金額達免運門檻時必須免運');
  assert.equal(freeOrder.order_amount, 1040);

  shipping = { ...shipping, enabled: false };
  await assert.rejects(
    validateProductPricing(normalizeOrder(payload(), '待付款')),
    /未啟用/
  );
  shipping = { ...shipping, enabled: true, free_threshold: 1500 };

  await assert.rejects(
    validateProductPricing(normalizeOrder(payload({ productAmount: 2 }), '待付款')),
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
