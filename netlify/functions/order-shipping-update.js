const { supabase, syncSheet } = require('./_orders');
const { requireAdmin } = require('./_ecpay');
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    await requireAdmin(event);
    const { orderNo, zipcode, city, address } = JSON.parse(event.body || '{}');
    const values = { zipcode: String(zipcode || '').trim(), city: String(city || '').trim(), address: String(address || '').trim() };
    if (!/^\d{3,6}$/.test(values.zipcode)) throw new Error('郵遞區號格式不正確');
    if (values.city.length < 3 || values.city.length > 20) throw new Error('縣市／區域格式不正確');
    if (values.address.length < 5 || values.address.length > 60) throw new Error('宅配地址格式不正確');
    const cityArea = values.city.replace(/^[^縣市]+[縣市]/, '');
    if (!/[區鄉鎮市]/.test(`${cityArea}${values.address}`)) throw new Error('宅配地址請包含鄉鎮市區，例如：北屯區');
    const rows = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    const order = rows[0];
    if (!order) return json(404, { error: '找不到訂單' });
    if (order.shipping_method !== 'kuroneko') throw new Error('只有黑貓宅配訂單可修改宅配地址');
    if (order.logistics_trade_no) throw new Error('已建立物流單，無法修改宅配地址');
    const updated = await supabase(`orders?order_no=eq.${encodeURIComponent(order.order_no)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ shipping_details: { ...(order.shipping_details || {}), ...values } })
    });
    if (!updated.length) throw new Error('宅配地址更新失敗');
    await syncSheet(updated[0], 'updateStatus');
    return json(200, updated[0]);
  } catch (error) { return json(error.statusCode || 400, { error: error.message }); }
};
