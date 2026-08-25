const { supabase, syncSheet } = require('./_orders');
const paymentStatuses = ['待付款', '已付款', '已匯款待確認', '付款失敗'];
const shippingStatuses = ['待出貨', '已出貨', '已完成'];

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const jwt = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt || jwt.startsWith('sb_secret_')) return { statusCode: 401, body: 'Unauthorized' };
    const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${jwt}` } });
    if (!auth.ok) return { statusCode: 401, body: 'Unauthorized' };
    const user = await auth.json();
    const admins = await supabase(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    if (!admins.length) return { statusCode: 403, body: 'Forbidden' };
    const { orderNo, paymentStatus, shippingStatus } = JSON.parse(event.body || '{}');
    if (!paymentStatuses.includes(paymentStatus) || !shippingStatuses.includes(shippingStatus)) throw new Error('不允許的訂單狀態');
    const rows = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ payment_status: paymentStatus, shipping_status: shippingStatus }) });
    if (!rows.length) throw new Error('找不到訂單');
    await syncSheet(rows[0], 'updateStatus');
    return { statusCode: 200, body: JSON.stringify(rows[0]) };
  } catch (error) { return { statusCode: 400, body: JSON.stringify({ error: error.message }) }; }
};
