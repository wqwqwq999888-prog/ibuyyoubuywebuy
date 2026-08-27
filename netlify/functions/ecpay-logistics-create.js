const crypto = require('crypto');
const { supabase } = require('./_orders');

const LOGISTICS_ENDPOINT = 'https://logistics.ecpay.com.tw/Express/Create';
const SUBTYPES = { '711': 'UNIMARTC2C', family: 'FAMIC2C' };

function encodeEcpay(value) {
  return encodeURIComponent(value)
    .toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_')
    .replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');
}

function checkMacValue(params, hashKey, hashIv) {
  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  let raw = `HashKey=${hashKey}`;
  sorted.forEach(key => { raw += `&${key}=${params[key]}`; });
  raw += `&HashIV=${hashIv}`;
  return crypto.createHash('md5').update(encodeEcpay(raw)).digest('hex').toUpperCase();
}

function json(statusCode, payload) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) };
}

function clean(value, maxLength) {
  return String(value || '').replace(/[\r\n|]/g, ' ').trim().slice(0, maxLength);
}

function goodsName(items) {
  const value = (Array.isArray(items) ? items : []).map(item =>
    `${clean(item.name, 24)}x${Math.max(1, Number(item.qty) || 1)}`
  ).join('#');
  return clean(value || '鬥陣買商品', 50);
}

function logisticsParams(order, env = process.env) {
  const subtype = SUBTYPES[order.shipping_method];
  if (!subtype) throw new Error('目前只支援 7-ELEVEN 與全家超商建立綠界物流單');

  const details = order.shipping_details || {};
  const receiverStoreId = order.shipping_method === '711' ? details.store711Id : details.storefamilyId;
  if (!receiverStoreId) throw new Error('訂單缺少收件門市代號');

  const merchantId = env.ECPAY_MERCHANT_ID || '3504484';
  const senderName = clean(env.ECPAY_LOGISTICS_SENDER_NAME, 10);
  const senderCellPhone = clean(env.ECPAY_LOGISTICS_SENDER_PHONE, 20);
  if (!senderName || !senderCellPhone) throw new Error('Netlify 尚未設定綠界物流寄件人姓名或手機');

  const siteUrl = String(env.URL || env.SITE_URL || 'https://douzhenmai.com').replace(/\/$/, '');
  return {
    MerchantID: merchantId,
    MerchantTradeNo: clean(order.order_no, 20),
    MerchantTradeDate: new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date()).replace(/-/g, '/'),
    LogisticsType: 'CVS',
    LogisticsSubType: subtype,
    GoodsAmount: String(Math.round(Number(order.order_amount))),
    CollectionAmount: '0',
    IsCollection: 'N',
    GoodsName: goodsName(order.items),
    SenderName: senderName,
    SenderCellPhone: senderCellPhone,
    ReceiverName: clean(order.customer_name, 10),
    ReceiverCellPhone: clean(order.customer_phone, 20),
    ReceiverEmail: clean(order.customer_email, 100),
    ReceiverStoreID: clean(receiverStoreId, 10),
    TradeDesc: clean(`鬥陣買訂單 ${order.order_no}`, 50),
    ServerReplyURL: `${siteUrl}/.netlify/functions/ecpay-logistics-callback`,
    LogisticsC2CReplyURL: `${siteUrl}/.netlify/functions/ecpay-logistics-callback`,
    Remark: clean(order.note, 60)
  };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const authorization = event.headers.authorization || event.headers.Authorization || '';
    const jwt = authorization.replace(/^Bearer\s+/i, '');
    if (!jwt) return json(401, { error: '請先登入管理後台' });

    const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${jwt}` }
    });
    if (!auth.ok) return json(401, { error: '登入已過期，請重新登入' });

    const { orderNo } = JSON.parse(event.body || '{}');
    const orders = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}&select=*`);
    if (!orders.length) return json(404, { error: '找不到訂單' });
    const order = orders[0];
    if (order.payment_status !== '已付款') {
      return json(400, { error: '訂單尚未確認付款，不能建立物流單' });
    }
    if (order.logistics_trade_no) {
      return json(200, { existing: true, logisticsTradeNo: order.logistics_trade_no, status: order.logistics_status });
    }

    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIv = process.env.ECPAY_HASH_IV;
    if (!hashKey || !hashIv) throw new Error('Netlify 尚未設定綠界 HashKey 或 HashIV');
    const params = logisticsParams(order);
    params.CheckMacValue = checkMacValue(params, hashKey, hashIv);

    const response = await fetch(process.env.ECPAY_LOGISTICS_CREATE_URL || LOGISTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`綠界物流 API HTTP ${response.status}`);
    const result = responseText.includes('=')
      ? Object.fromEntries(new URLSearchParams(responseText))
      : (() => {
          const [rtnCode, ...rest] = responseText.split('|');
          return { RtnCode: rtnCode, AllPayLogisticsID: rtnCode === '1' ? rest.join('|').trim() : '', RtnMsg: rtnCode === '1' ? '' : rest.join('|').trim() };
        })();
    if (String(result.RtnCode) !== '1' || !result.AllPayLogisticsID) {
      throw new Error(result.RtnMsg || responseText || '綠界物流單建立失敗');
    }

    const updated = await supabase(`orders?order_no=eq.${encodeURIComponent(order.order_no)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        logistics_trade_no: String(result.AllPayLogisticsID),
        logistics_status: String(result.RtnCode),
        logistics_message: String(result.RtnMsg || ''),
        logistics_created_at: new Date().toISOString()
      })
    });
    return json(200, {
      logisticsTradeNo: updated[0]?.logistics_trade_no || String(result.AllPayLogisticsID),
      status: updated[0]?.logistics_status || String(result.RtnCode),
      message: result.RtnMsg || '綠界物流單已建立'
    });
  } catch (error) {
    console.error('建立綠界物流單失敗:', error);
    return json(400, { error: error.message || '建立綠界物流單失敗' });
  }
};

module.exports.logisticsParams = logisticsParams;
module.exports.checkMacValue = checkMacValue;
