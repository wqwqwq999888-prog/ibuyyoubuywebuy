const { supabase, requireAdmin } = require('./_orders');
const { queryPayment } = require('./_payment-query');
const { recoveryOrder, completePayment } = require('./_payment-order');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (!['GET', 'POST'].includes(event.httpMethod)) return json(405, { error: 'Method Not Allowed' });
  try {
    const admin = await requireAdmin(event);
    if (event.httpMethod === 'GET') {
      const rows = await supabase('pending_ecpay_orders?select=order_no,expected_amount,created_at,check_status,check_error,last_checked_at,alerted_at&order=created_at.desc&limit=100');
      const monitor = await supabase('payment_monitor_state?id=eq.1&select=last_run_at,last_error');
      return json(200, { orders: rows, monitor: monitor[0] || null });
    }
    const { orderNo, action, approved } = JSON.parse(event.body || '{}');
    if (!/^[a-zA-Z0-9]{1,20}$/.test(orderNo || '') || !['inspect', 'recover'].includes(action)) return json(400, { error: '請提供正確訂單編號與操作' });
    if (action === 'recover' && approved !== true) return json(400, { error: '請先確認同意補單與寄送訂單通知' });
    const pending = await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (!pending.length) return json(404, { error: '找不到暫存訂單；未新增或變更資料' });
    const payment = await queryPayment(orderNo);
    const order = await recoveryOrder(pending[0], payment);
    const existing = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (existing.length && (Number(existing[0].order_amount) !== order.order_amount || existing[0].trade_no !== payment.TradeNo || existing[0].payment_status !== '已付款')) throw new Error('正式訂單已存在且狀態不一致，請人工核對');
    const summary = { orderNo, amount: order.order_amount, customerName: order.customer_name, partnerName: order.partner_name, tradeNo: payment.TradeNo, paymentDate: payment.PaymentDate, existing: existing.length > 0 };
    if (action === 'inspect') return json(200, { ...summary, verified: true });
    try {
      await completePayment(pending[0], payment, 'admin_recovery', admin?.id);
    } catch (error) {
      console.error('Recovery incomplete', orderNo, error.message);
      return json(400, { error: '補單流程未完成，暫存資料已保留；請重新查核正式訂單及通知狀態。' });
    }
    return json(200, { ...summary, recovered: true, sheetSynced: true });
  } catch (error) {
    console.error('ECPay reconciliation failed', error.message);
    return json(error.statusCode || 400, { error: error.message });
  }
};

exports.queryPayment = queryPayment;
