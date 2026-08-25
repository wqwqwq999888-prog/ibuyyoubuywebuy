const { supabase, normalizeOrder, addProductCosts, syncSheet } = require('./_orders');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const order = await addProductCosts(normalizeOrder(JSON.parse(event.body || '{}'), '已匯款待確認'));
    if (!/^\d{5}$/.test(order.transfer_last_five)) throw new Error('請填寫轉帳後五碼');
    const existing = await supabase(`orders?order_no=eq.${encodeURIComponent(order.order_no)}&select=*`);
    const savedOrder = existing[0] || (await supabase('orders', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(order)
    }))[0];
    let sheetSynced = true;
    try {
      await syncSheet(savedOrder);
    } catch (error) {
      sheetSynced = false;
      console.error('Order saved, but Google Sheet sync failed', error);
    }
    return {
      statusCode: existing[0] ? 200 : 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.order_no, sheetSynced })
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
  }
};
