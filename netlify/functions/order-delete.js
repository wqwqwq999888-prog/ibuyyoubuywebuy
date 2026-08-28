const { supabase, syncSheet, requireAdmin } = require('./_orders');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    await requireAdmin(event);
    const { orderNo, confirmation } = JSON.parse(event.body || '{}');
    if (typeof orderNo !== 'string' || !orderNo || confirmation !== orderNo) {
      return json(400, { error: '請輸入完整且完全一致的訂單編號' });
    }

    const orders = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (!orders.length) return json(404, { error: '找不到訂單' });

    // Sheet 必須先明確確認刪除；絕不在此取消或修改任何綠界交易或物流單。
    await syncSheet({ order_no: orderNo }, 'deleteOrder');
    const deleted = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}`, {
      method: 'DELETE', headers: { Prefer: 'return=representation' }
    });
    if (!deleted.length) throw new Error('Supabase 訂單刪除失敗');
    await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(orderNo)}`, { method: 'DELETE' });
    return json(200, { deleted: true, orderNo });
  } catch (error) {
    return json(error.statusCode || 400, { error: error.message });
  }
};
