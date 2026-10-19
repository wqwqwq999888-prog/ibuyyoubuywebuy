const { supabase, requireAdmin, normalizeOrder, addProductCosts, syncSheet } = require('./_orders');
const { checkMacValue } = require('./_ecpay');
const { sendPurchase } = require('./_analytics');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

async function queryPayment(orderNo) {
  if (!process.env.ECPAY_HASH_KEY || !process.env.ECPAY_HASH_IV) throw new Error('綠界查帳設定不完整');
  const params = { MerchantID: process.env.ECPAY_MERCHANT_ID || '3504484', MerchantTradeNo: orderNo, TimeStamp: String(Math.floor(Date.now() / 1000)) };
  params.CheckMacValue = checkMacValue(params);
  const response = await fetch('https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`綠界查帳失敗 (${response.status})，請稍後重試`);
  const payment = Object.fromEntries(new URLSearchParams(await response.text()));
  if (!payment.CheckMacValue || checkMacValue(payment) !== payment.CheckMacValue) throw new Error('綠界查帳回應驗證失敗');
  if (payment.MerchantID !== params.MerchantID || payment.MerchantTradeNo !== orderNo) throw new Error('綠界查帳訂單不一致');
  if (payment.SimulatePaid === '1') throw new Error('模擬付款不能建立正式訂單');
  if (payment.TradeStatus !== '1') throw new Error('綠界尚未確認此筆付款成功，未變更訂單');
  if (!payment.TradeNo || !/^\d+$/.test(payment.TradeAmt || '') || Number(payment.TradeAmt) <= 0) throw new Error('綠界付款資料不完整');
  return payment;
}

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

exports.handler = async event => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method Not Allowed' });
  try {
    await requireAdmin(event);
    if (event.httpMethod === 'GET') {
      const rows = await supabase('pending_ecpay_orders?select=order_no,expected_amount,created_at&order=created_at.desc&limit=100');
      return json(200, { orders: rows });
    }
    const { orderNo, action } = JSON.parse(event.body || '{}');
    if (!/^[a-zA-Z0-9]{1,20}$/.test(orderNo || '') || !['inspect', 'recover'].includes(action)) return json(400, { error: '請提供正確訂單編號與操作' });
    const pending = await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (!pending.length) return json(404, { error: '找不到暫存訂單；未新增或變更資料' });
    const payment = await queryPayment(orderNo);
    const order = await recoveryOrder(pending[0], payment);
    const existing = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (existing.length && (Number(existing[0].order_amount) !== order.order_amount || existing[0].trade_no !== payment.TradeNo || existing[0].payment_status !== '已付款')) throw new Error('正式訂單已存在且狀態不一致，請人工核對');
    const summary = { orderNo, amount: order.order_amount, customerName: order.customer_name, partnerName: order.partner_name, tradeNo: payment.TradeNo, paymentDate: payment.PaymentDate, existing: existing.length > 0 };
    if (action === 'inspect') return json(200, { ...summary, verified: true });
    const created = existing.length ? [] : await supabase('orders?on_conflict=order_no', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(order)
    });
    const saved = existing[0] || created[0] || (await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`))[0];
    if (!saved || Number(saved.order_amount) !== order.order_amount || saved.trade_no !== payment.TradeNo || saved.payment_status !== '已付款') throw new Error('正式訂單寫入結果不一致，請人工核對');
    // Keep pending data until synchronization succeeds, so a retry can finish
    // the interrupted work without creating another order.
    try {
      if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) throw new Error('尚未設定訂單通知同步');
      await syncSheet(saved);
    } catch (error) {
      console.error('Reconciled order sync failed', orderNo, error.message);
      return json(200, { ...summary, recovered: true, sheetSynced: false, error: '訂單已補回，但通知同步失敗；暫存資料已保留，可重試' });
    }
    if (created.length) await sendPurchase(saved);
    await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(orderNo)}`, { method: 'DELETE' });
    return json(200, { ...summary, recovered: true, sheetSynced: true });
  } catch (error) {
    console.error('ECPay reconciliation failed', error.message);
    return json(error.statusCode || 400, { error: error.message });
  }
};

exports.queryPayment = queryPayment;
