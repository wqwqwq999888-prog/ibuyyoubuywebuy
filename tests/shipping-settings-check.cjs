const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

const cloudMethods = [
  { id: '711', name: '7-ELEVEN', fee: 69, free_threshold: 1500, sort_order: 1 },
  { id: 'family', name: '全家', fee: 72, free_threshold: 1600, sort_order: 2 },
  { id: 'kuroneko', name: '黑貓宅配', fee: 145, free_threshold: 3200, sort_order: 3 }
];

global.fetch = async url => {
  const requestUrl = String(url);
  assert.match(requestUrl, /shipping_methods\?enabled=eq\.true/);
  assert.match(requestUrl, /select=id,name,fee,free_threshold,sort_order/);
  return { ok: true, text: async () => JSON.stringify(cloudMethods) };
};

const { handler } = require('../netlify/functions/shipping-methods');

(async () => {
  const response = await handler({ httpMethod: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(JSON.parse(response.body), cloudMethods, '結帳端點必須回傳雲端最新啟用物流設定');

  const rejected = await handler({ httpMethod: 'POST' });
  assert.equal(rejected.statusCode, 405);
  console.log('Shipping settings checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
