const { supabase } = require('./_orders');
const { checkMacValue, requireAdmin } = require('./_ecpay');
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const clean = (value, max) => String(value || '').replace(/[&<>]/g, '').slice(0, max);
const pad = value => String(value).padStart(2, '0');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const user = await requireAdmin(event);
    const admins = await supabase(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    if (!admins.length) return json(403, { error: '此帳號沒有管理員權限' });
    const { orderNo } = JSON.parse(event.body || '{}');
    const rows = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (!rows.length) return json(404, { error: '找不到訂單' });
    const order = rows[0];
    if (!['已付款', '已匯款待確認'].includes(order.payment_status)) return json(400, { error: '訂單尚未付款，無法建立物流單' });
    if (order.logistics_trade_no) return json(409, { error: '此訂單已建立綠界物流單' });

    const details = order.shipping_details || {};
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const params = {
      MerchantID: process.env.ECPAY_MERCHANT_ID || '3504484',
      MerchantTradeNo: clean(order.order_no, 20),
      MerchantTradeDate: `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      LogisticsType: order.shipping_method === 'kuroneko' ? 'HOME' : 'CVS',
      LogisticsSubType: ({ '711': 'UNIMARTC2C', family: 'FAMIC2C', kuroneko: 'TCAT' })[order.shipping_method],
      GoodsAmount: String(Math.max(1, Number(order.order_amount) - Number(order.shipping_fee || 0))),
      CollectionAmount: '0', IsCollection: 'N', GoodsName: clean((order.items || []).map(item => item.name).join('#'), 60),
      SenderName: clean(process.env.ECPAY_SENDER_NAME || '鬥陣買肉乾', 10),
      SenderCellPhone: clean(process.env.ECPAY_SENDER_PHONE || '0900000000', 20),
      ReceiverName: clean(order.customer_name, 10), ReceiverCellPhone: clean(order.customer_phone, 20),
      ReceiverEmail: clean(order.customer_email, 50),
      ServerReplyURL: `${process.env.URL || process.env.DEPLOY_PRIME_URL}/.netlify/functions/ecpay-logistics-callback`
    };
    if (params.LogisticsType === 'CVS') params.ReceiverStoreID = clean(order.shipping_method === '711' ? details.store711Id : details.storefamilyId, 10);
    else Object.assign(params, { ReceiverZipCode: clean(details.zipcode, 5), ReceiverAddress: clean(`${details.city || ''}${details.address || ''}`, 60), Temperature: '0001', Distance: '00', Specification: '0001', ScheduledDeliveryTime: '4', PackageCount: '1' });
    if (!params.LogisticsSubType || (params.LogisticsType === 'CVS' && !params.ReceiverStoreID) || (params.LogisticsType === 'HOME' && (!params.ReceiverZipCode || !params.ReceiverAddress))) return json(400, { error: '配送資料不完整' });
    params.CheckMacValue = checkMacValue(params, 'md5');
    const response = await fetch('https://logistics.ecpay.com.tw/Express/Create', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    const text = await response.text();
    const result = Object.fromEntries(new URLSearchParams(text));
    if (!response.ok || result.RtnCode !== '300') throw new Error(result.RtnMsg || `綠界物流建單失敗 (${response.status})`);
    const updated = await supabase(`orders?order_no=eq.${encodeURIComponent(order.order_no)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ logistics_trade_no: result.AllPayLogisticsID, logistics_status: result.RtnCode, logistics_message: result.RtnMsg || '', logistics_created_at: new Date().toISOString() }) });
    return json(200, updated[0]);
  } catch (error) { return json(error.statusCode || 400, { error: error.message }); }
};
