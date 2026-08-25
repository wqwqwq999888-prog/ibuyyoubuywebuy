const { supabase, normalizeOrder, addProductCosts, syncSheet } = require('./_orders');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const order = await addProductCosts(normalizeOrder(JSON.parse(event.body || '{}'), '已匯款待確認'));
    if (!/^\d{5}$/.test(order.transfer_last_five)) throw new Error('請填寫轉帳後五碼');
    const created = await supabase('orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(order) });
    await syncSheet(created[0]);
    return { statusCode: 201, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.order_no }) };
  } catch (error) {
    console.error(error);
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};
