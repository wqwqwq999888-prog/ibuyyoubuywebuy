const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
let row, payment, saved, alerts, patches, failMail, rateLimit, claimed;
const original = { order_no: 'DZM123', expected_amount: 100, created_at: new Date().toISOString(), check_status: 'unchecked' };
function reset() { row = {...original}; payment = { TradeStatus: '1', TradeAmt: '100', TradeNo: 'TRADE' }; saved = []; alerts = 0; patches = []; failMail = false; rateLimit = false; claimed = false; }
require('../netlify/functions/_orders');
require.cache[require.resolve('../netlify/functions/_orders')].exports = {
  supabase: async (path, options = {}) => {
    if (path === 'rpc/claim_payment_checks') { claimed = true; return [row]; }
    if (path.startsWith('payment_monitor_state')) { patches.push(JSON.parse(options.body)); return null; }
    if (path.startsWith('orders?')) { assert.equal(options.method, undefined, 'monitor MUST NOT create orders'); return saved; }
    if (path.startsWith('pending_ecpay_orders?')) {
      if (options.method === 'PATCH') { row = {...row, ...JSON.parse(options.body)}; return null; }
      assert.equal(options.method, undefined, 'monitor MUST NOT delete pending data'); return [row];
    }
    throw new Error(path);
  },
  syncSheet: async (data, action) => { assert.equal(action, 'paymentAlert', 'no customer order mail from monitoring'); alerts++; if (failMail) throw new Error('mail down'); }
};
require('../netlify/functions/_payment-query');
require.cache[require.resolve('../netlify/functions/_payment-query')].exports = { queryPayment: async () => { if (rateLimit) throw Object.assign(new Error('403'), {rateLimited:true}); return payment; } };
require('../netlify/functions/_payment-order');
require.cache[require.resolve('../netlify/functions/_payment-order')].exports = {
  recoveryOrder: async () => { if (payment.TradeAmt !== '100') throw new Error('amount mismatch'); },
  assertSamePayment: order => { if (order.trade_no !== payment.TradeNo) throw new Error('trade mismatch'); }
};
const { handler, checkPending } = require('../netlify/functions/payment-monitor');
process.env.GOOGLE_SHEET_WEBHOOK_URL = 'https://example.invalid';
process.env.PAYMENT_MONITOR_ENABLED = 'true';
(async () => {
  reset(); process.env.CONTEXT = 'deploy-preview'; await handler(); assert.equal(claimed, false); assert.equal(alerts, 0);
  reset(); await checkPending(row); assert.equal(row.check_status, 'paid_missing'); assert.equal(alerts, 1); assert.ok(row.alerted_at);
  await checkPending(row); assert.equal(alerts, 1, 'same unresolved issue must not spam');
  reset(); payment.TradeStatus = '0'; await checkPending(row); assert.equal(row.check_status, 'unpaid'); assert.equal(alerts, 0);
  reset(); payment.TradeAmt = '99'; await checkPending(row); assert.equal(row.check_status, 'check_failed'); assert.equal(alerts, 1);
  reset(); saved = [{trade_no:'TRADE'}]; await checkPending(row); assert.equal(row.check_status, 'sync_pending'); assert.equal(alerts, 1);
  reset(); failMail = true; await assert.rejects(checkPending(row)); assert.equal(row.alerted_at, null);
  failMail = false; await checkPending(row); assert.ok(row.alerted_at); assert.equal(alerts, 2);
  reset(); row.alerted_at = 'old'; row.check_status = 'check_failed'; failMail = true;
  await assert.rejects(checkPending(row)); assert.equal(row.alerted_at, null); failMail = false; await checkPending(row); assert.equal(alerts, 2);
  reset(); process.env.CONTEXT = 'production'; rateLimit = true;
  assert.equal((await handler()).statusCode, 500); assert.ok(patches[0].cooldown_until);
  const sql = readFileSync('supabase/migrations/20261019000000_payment_monitor.sql','utf8');
  assert.match(sql,/for update skip locked/); assert.match(sql,/revoke all on function.*from public, anon, authenticated/);
  assert.match(sql,/interval '10 minutes'/);
  console.log('Payment monitor approval, alerts, retries, preview and rate-limit checks passed.');
})().catch(e => {console.error(e);process.exitCode=1;});
