const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { purchasePayload, sendPurchase } = require('../netlify/functions/_analytics');

const home = fs.readFileSync('index.html', 'utf8');
const checkout = fs.readFileSync('checkout.html', 'utf8');
const vote = fs.readFileSync('vote.html', 'utf8');
const browserAnalytics = fs.readFileSync('analytics.js', 'utf8');
const orderHelpers = fs.readFileSync('netlify/functions/_orders.js', 'utf8');
const ecpayReturn = fs.readFileSync('netlify/functions/ecpay-return.js', 'utf8');
const statusSync = fs.readFileSync('netlify/functions/order-status-sync.js', 'utf8');

assert(home.includes('<title>鬥陣買肉乾｜台中伴手禮推薦・肉乾禮盒・團購送禮</title>'));
assert(home.includes('<meta name="description" content="鬥陣買是台中肉乾品牌，主打獨立真空包裝條狀肉乾，好吃不沾手、方便分享。提供多種口味、肉乾禮盒與團購選擇，適合日常零食、家庭分享與節慶送禮。">'));
for (const property of ['og:title', 'twitter:title']) assert(home.includes(`${property}\" content=\"鬥陣買肉乾｜好吃不沾手，大家鬥陣吃`));
for (const property of ['og:description', 'twitter:description']) assert(home.includes(`${property}\" content=\"獨立真空包裝條狀肉乾，多種口味任你挑。自己吃、家庭分享、公司團購、節慶送禮，隨時隨地都能鬥陣吃。`));

for (const html of [home, checkout, vote]) {
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-FRZ2RMV82S/);
  assert.match(html, /<script src="analytics\.js"><\/script>/);
}
for (const event of ['view_item', 'add_to_cart', 'begin_checkout']) assert(home.includes(`'${event}'`), `${event} is not instrumented`);
assert(browserAnalytics.includes("send_page_view: true"));
assert(browserAnalytics.includes("track('select_content'"));
assert(browserAnalytics.includes("track('purchase'"));
assert(browserAnalytics.includes("const PURCHASED_ORDERS_KEY = 'ibuy-ga4-purchased-orders-v1'"));
assert.match(checkout, /orderData\.orderId = result\.orderId;[\s\S]*IBuyAnalytics\.trackPurchase\(orderData\);[\s\S]*showSuccess\(orderData\);/);
assert(browserAnalytics.includes("'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'campaign'"));

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) };
};
const browserEvents = [];
const browserContext = {
  URLSearchParams, location: { search: '' }, sessionStorage: storage(), localStorage: storage(),
  document: { cookie: '', addEventListener() {} }
};
browserContext.window = browserContext;
browserContext.gtag = (...args) => browserEvents.push(args);
vm.runInNewContext(browserAnalytics, browserContext);
browserContext.location.search = '?gtm_debug=test';
assert.strictEqual(browserContext.IBuyAnalytics.orderAttribution().debug_mode, true);
browserContext.location.search = '';
assert.strictEqual(browserContext.IBuyAnalytics.orderAttribution().debug_mode, true, 'debug mode must survive checkout navigation');
const browserOrder = {
  orderId: 'DZM123', productAmount: 600, discountAmount: 100, shippingFee: 70,
  discountCode: 'SAVE100', items: [{ productNo: 100001, name: '經典蜜汁', price: 200, qty: 3 }]
};
assert.strictEqual(browserContext.IBuyAnalytics.trackPurchase(browserOrder), true);
assert.strictEqual(browserContext.IBuyAnalytics.trackPurchase(browserOrder), false);
const purchaseEvents = browserEvents.filter(args => args[0] === 'event' && args[1] === 'purchase');
assert.strictEqual(purchaseEvents.length, 1, 'the same order must only emit one browser purchase');
assert.deepStrictEqual(JSON.parse(JSON.stringify(purchaseEvents[0][2])), {
  transaction_id: 'DZM123', value: 500, currency: 'TWD', shipping: 70, coupon: 'SAVE100',
  items: [{ item_id: '100001', item_name: '經典蜜汁', price: 200, quantity: 3 }]
});
assert.strictEqual((home.match(/G-FRZ2RMV82S/g) || []).length, 1);
assert.strictEqual((checkout.match(/G-FRZ2RMV82S/g) || []).length, 1);
assert(orderHelpers.includes('analytics: data.analytics || null'), 'order attribution is not retained for purchase tracking');
assert.match(ecpayReturn, /if \(created\.length\) \{[\s\S]*await syncSheet\(created\[0\]\);[\s\S]*await sendPurchase\(created\[0\]\);[\s\S]*\}/);
assert(!statusSync.includes('sendPurchase'), 'admin payment-status changes must not duplicate purchase tracking');

const order = {
  order_no: 'D123', order_amount: 570, product_amount: 600, discount_amount: 100, shipping_fee: 70,
  discount_code: 'SAVE100', partner_name: '團購主',
  items: [{ productNo: '100001', name: '經典蜜汁', price: 200, qty: 3 }],
  shipping_details: { campaign_id: 'campaign-1', analytics: {
    client_id: '123.456', session_id: '789', utm_source: 'facebook', utm_medium: 'social',
    utm_campaign: 'mid_autumn', utm_term: '肉乾', utm_content: 'hero', campaign_partner: '團購主'
  } }
};
const payload = purchasePayload(order);
assert.strictEqual(payload.client_id, '123.456');
assert.strictEqual(payload.events[0].name, 'purchase');
assert.deepStrictEqual(payload.events[0].params.items[0], { item_id: '100001', item_name: '經典蜜汁', price: 200, quantity: 3 });
assert.strictEqual(payload.events[0].params.debug_mode, undefined);
const debugPayload = purchasePayload({ ...order, shipping_details: { analytics: { ...order.shipping_details.analytics, debug_mode: true } } });
assert.strictEqual(debugPayload.events[0].params.debug_mode, true);
assert.deepStrictEqual({
  transaction_id: payload.events[0].params.transaction_id,
  currency: payload.events[0].params.currency,
  value: payload.events[0].params.value,
  shipping: payload.events[0].params.shipping,
  coupon: payload.events[0].params.coupon,
  campaign_id: payload.events[0].params.campaign_id,
  campaign_name: payload.events[0].params.campaign_name,
  source: payload.events[0].params.source,
  medium: payload.events[0].params.medium
}, {
  transaction_id: 'D123', currency: 'TWD', value: 500, shipping: 70, coupon: 'SAVE100',
  campaign_id: 'campaign-1', campaign_name: 'mid_autumn', source: 'facebook', medium: 'social'
});
for (const personal of ['customer_name', 'customer_phone', 'customer_email', 'address', 'phone', 'email']) {
  assert(!JSON.stringify(payload).toLowerCase().includes(`\"${personal}\"`), `purchase must not send ${personal}`);
}
for (const internal of ['product_cost', 'gross_profit', 'commission_amount']) {
  assert(!JSON.stringify(payload).includes(internal), `purchase must not send ${internal}`);
}

(async () => {
  const oldSecret = process.env.GA4_API_SECRET;
  const oldFetch = global.fetch;
  delete process.env.GA4_API_SECRET;
  assert.deepStrictEqual(await sendPurchase(order), { skipped: true, reason: 'missing_api_secret' });

  let request;
  process.env.GA4_API_SECRET = 'test-secret';
  global.fetch = async (url, options) => { request = { url, options }; return { ok: true, status: 204 }; };
  assert.deepStrictEqual(await sendPurchase(order), { sent: true });
  assert(request.url.includes('measurement_id=G-FRZ2RMV82S'));
  assert(request.url.includes('api_secret=test-secret'));
  assert.strictEqual(JSON.parse(request.options.body).events[0].params.transaction_id, 'D123');

  if (oldSecret === undefined) delete process.env.GA4_API_SECRET; else process.env.GA4_API_SECRET = oldSecret;
  global.fetch = oldFetch;
  console.log('GA4 tracking checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
