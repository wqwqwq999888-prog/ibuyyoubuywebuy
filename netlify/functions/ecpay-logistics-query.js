const { supabase } = require('./_orders');
const { checkMacValue, requireAdmin } = require('./_ecpay');
const { logisticsNumbers } = require('./_ecpay-logistics-number');
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const user = await requireAdmin(event);
    const admins = await supabase(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    if (!admins.length) return json(403, { error: '此帳號沒有管理員權限' });
    const { orderNo } = JSON.parse(event.body || '{}');
    const rows = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    const order = rows[0];
    if (!order) return json(404, { error: '找不到訂單' });
    if (!order.logistics_trade_no) return json(400, { error: '此訂單尚未建立綠界物流單' });

    const params = {
      MerchantID: process.env.ECPAY_MERCHANT_ID || '3504484',
      AllPayLogisticsID: String(order.logistics_trade_no),
      TimeStamp: String(Math.floor(Date.now() / 1000))
    };
    params.CheckMacValue = checkMacValue(params, 'md5');
    const response = await fetch('https://logistics.ecpay.com.tw/Helper/QueryLogisticsTradeInfo/V5', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params)
    });
    const raw = await response.text();
    if (!response.ok || !raw.includes('=')) throw new Error(`綠界查詢寄件編號失敗：${raw.slice(0, 200) || response.status}`);
    const result = Object.fromEntries(new URLSearchParams(raw));
    if (result.MerchantID !== params.MerchantID || result.AllPayLogisticsID !== params.AllPayLogisticsID || !result.CheckMacValue || checkMacValue(result, 'md5') !== result.CheckMacValue.toUpperCase()) {
      throw new Error('綠界查詢結果驗證失敗');
    }
    const numbers = logisticsNumbers(result);
    if (!Object.keys(numbers).length) return json(404, { error: '綠界尚未提供寄件編號，請稍後再查詢' });
    const updated = await supabase(`orders?order_no=eq.${encodeURIComponent(order.order_no)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ shipping_details: { ...(order.shipping_details || {}), ...numbers } })
    });
    return json(200, updated[0]);
  } catch (error) { return json(error.statusCode || 400, { error: error.message }); }
};
