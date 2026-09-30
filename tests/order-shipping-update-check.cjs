const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';
const { handler } = require('../netlify/functions/order-shipping-update');
const order = { order_no: 'D123', shipping_method: 'kuroneko', logistics_trade_no: null, shipping_details: { zipcode: '400', city: '台中市', address: '舊地址', campaign_id: 'keep-me' } };
let saved;
global.fetch = async (url, options = {}) => {
  url = String(url);
  if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin-id' }) };
  if (url.includes('/rest/v1/admin_users?')) return { ok: true, text: async () => JSON.stringify([{ user_id: 'admin-id' }]) };
  if (url.includes('/rest/v1/orders?') && !options.method) return { ok: true, text: async () => JSON.stringify([order]) };
  if (url.includes('/rest/v1/orders?') && options.method === 'PATCH') { saved = JSON.parse(options.body); return { ok: true, text: async () => JSON.stringify([{ ...order, ...saved }]) }; }
  if (url.startsWith('https://sheet.example/')) return { ok: true, text: async () => 'OK' };
  throw new Error(`Unexpected request: ${url}`);
};
process.env.GOOGLE_SHEET_WEBHOOK_URL = 'https://sheet.example/hook';

(async () => {
  const response = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer test-jwt' }, body: JSON.stringify({ orderNo: 'D123', zipcode: '111', city: '台北市士林區', address: '延平北路六段211號二樓之一' }) });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(saved.shipping_details.zipcode, '111');
  assert.equal(saved.shipping_details.city, '台北市士林區');
  assert.equal(saved.shipping_details.address, '延平北路六段211號二樓之一');
  assert.equal(saved.shipping_details.campaign_id, 'keep-me');
  const app = readFileSync(require.resolve('../admin/app.js'), 'utf8');
  assert.match(app, /data-edit-shipping/);
  assert.match(app, /order-shipping-update/);
  console.log('Order shipping update checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
