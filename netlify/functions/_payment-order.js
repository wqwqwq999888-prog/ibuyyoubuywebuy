const { supabase, normalizeOrder, addProductCosts, syncSheet } = require('./_orders');
const { sendPurchase } = require('./_analytics');
async function recoveryOrder(pending, payment) {
  // Checkout already validated and saved these prices. Do not reprice a paid
  // order using today's catalog, discount limits, or campaign end date.
  const order = normalizeOrder({ ...pending.payload, tradeNo: payment.TradeNo }, '已付款');
  const amount = Number(payment.TradeAmt);
  const itemAmount = order.items.reduce((sum, item) => {
    if (!Number.isInteger(item.qty) || item.qty < 1 || !Number.isFinite(item.price) || item.price < 0) throw new Error('暫存商品資料不完整');
    return sum + item.price * item.qty;
  }, 0);
  if (order.order_no !== pending.order_no || amount !== Number(pending.expected_amount) || amount !== order.order_amount ||
      itemAmount !== order.product_amount || order.discount_amount < 0 || order.discount_amount > itemAmount || order.shipping_fee < 0 ||
      itemAmount - order.discount_amount + order.shipping_fee !== amount) throw new Error('綠界金額與暫存訂單不一致，未補單');
  const campaignId = order.shipping_details.campaign_id;
  if (campaignId) {
    const campaigns = await supabase(`campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,partner_name`);
    if (!campaigns.length) throw new Error('原始團購活動不存在，請先核對團購來源');
    order.partner_name = campaigns[0].partner_name;
  }
  order.created_at = pending.created_at;
  order.shipping_details.payment_verification = { source: 'ecpay_query', trade_no: payment.TradeNo, checked_at: new Date().toISOString() };
  return addProductCosts(order);
}

async function completePayment(pending, payment, source = 'ecpay_query', approvedBy = null) {
  const order = await recoveryOrder(pending, payment);
  order.shipping_details.payment_verification.source = source;
  if (approvedBy) order.shipping_details.payment_verification.approved_by = approvedBy;
  const path = `orders?order_no=eq.${encodeURIComponent(order.order_no)}&select=*`;
  const existing = await supabase(path);
  const created = existing.length ? [] : await supabase('orders?on_conflict=order_no', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(order)
  });
  const saved = existing[0] || created[0] || (await supabase(path))[0];
  assertSamePayment(saved, payment);
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) throw new Error('尚未設定訂單通知同步');
  await syncSheet(saved);
  if (created.length) await sendPurchase(saved);
  await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(order.order_no)}`, { method: 'DELETE' });
  return saved;
}
function assertSamePayment(order, payment) {
  if (!order || Number(order.order_amount) !== Number(payment.TradeAmt) || order.trade_no !== payment.TradeNo || order.payment_status !== '已付款') throw new Error('正式訂單已存在且狀態不一致，請人工核對');
}
module.exports = { recoveryOrder, completePayment, assertSamePayment };
