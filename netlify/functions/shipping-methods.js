const { supabase } = require('./_orders');

exports.handler = async event => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const methods = await supabase('shipping_methods?enabled=eq.true&select=id,name,fee,free_threshold,sort_order&order=sort_order.asc');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(methods)
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '無法取得物流設定' }) };
  }
};
