const assert = require('node:assert/strict');
const orders = require('../netlify/functions/_orders');
const originalSupabase = orders.supabase;
const campaignId = '14382302-fa2b-49f9-a682-464284e7d624';
orders.supabase = async path => {
  if (path.startsWith('campaigns?')) return [{ id:campaignId, name:'團購', partner_name:'團主', discount_code:null, commission_rate:10 }];
  if (path.startsWith('orders?')) return [
    { shipping_details:{ campaign_id:campaignId }, discount_code:null, payment_status:'已付款', product_amount:200, discount_amount:0 },
    { shipping_details:{ campaign_id:campaignId }, discount_code:null, payment_status:'已匯款待確認', product_amount:200, discount_amount:0 },
    { shipping_details:{ campaign_id:'00000000-0000-4000-8000-000000000000' }, discount_code:null, payment_status:'已付款', product_amount:1000, discount_amount:0 }
  ];
  throw new Error(`Unexpected request: ${path}`);
};
delete require.cache[require.resolve('../netlify/functions/partner-report')];
const { handler } = require('../netlify/functions/partner-report');

(async () => {
  const response = await handler({ httpMethod:'POST', body:JSON.stringify({ access_token:'test-token', report_year:2026, report_month:9 }) });
  assert.equal(response.statusCode, 200);
  const report = JSON.parse(response.body);
  assert.equal(report.uses, 2, '無折扣團購仍須統計專屬連結訂單');
  assert.equal(report.paid_orders, 1);
  assert.equal(report.pending_orders, 1);
  assert.equal(report.net_product_amount, 200);
  assert.equal(report.commission_amount, 20);
  console.log('Campaign report checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { orders.supabase = originalSupabase; });
