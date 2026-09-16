const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

const campaignId = '14382302-fa2b-49f9-a682-464284e7d624';
const now = Date.now();
const campaign = { id: campaignId, name: '無折扣團購', partner_name: '團主', discount_code: null,
  starts_at: new Date(now - 86400000).toISOString(), ends_at: new Date(now + 86400000).toISOString() };

global.fetch = async url => {
  const path = String(url);
  let rows;
  if (path.includes('/products?')) rows = [{ product_no:'100001', name:'測試商品', price:200 }];
  else if (path.includes('/shipping_methods?')) rows = [{ id:'711', name:'7-ELEVEN', fee:65, free_threshold:1500, enabled:true }];
  else if (path.includes('/campaigns?')) rows = [campaign];
  else throw new Error(`Unexpected request: ${path}`);
  return { ok:true, text:async () => JSON.stringify(rows) };
};

const { normalizeOrder, validateProductPricing, campaignIdFromCookie } = require('../netlify/functions/_orders');

(async () => {
  assert.equal(campaignIdFromCookie({ headers:{ cookie:`other=1; ibuy_campaign=${campaignId}` } }), campaignId);
  const payload = { orderId:'DZM-CAMPAIGN-TEST', customer:{ name:'客人', phone:'0912345678', email:'test@example.com' },
    items:[{ productNo:'100001', qty:1 }], productAmount:200, discountAmount:0, shipping:{ method:'711' },
    total:265, campaignId };
  const order = await validateProductPricing(normalizeOrder(payload, '已匯款待確認'));
  assert.equal(order.discount_code, null, '沒有折扣碼仍可建立團購訂單');
  assert.equal(order.shipping_details.campaign_id, campaignId, '專屬連結來源必須保存');
  assert.equal(order.partner_name, '團主');
  assert.equal(order.order_amount, 265);
  campaign.ends_at = new Date(now - 1000).toISOString();
  await assert.rejects(validateProductPricing(normalizeOrder(payload, '待付款')), /目前不開放下單/);
  console.log('Campaign attribution checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
