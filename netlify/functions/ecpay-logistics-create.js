const { supabase } = require('./_orders');
const { checkMacValue, logisticsCredentials } = require('./_ecpay-logistics');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const text = value => String(value || '').replace(/[<>&'"%]/g, ' ').trim();

function canCreateLogistics(order) {
  return order.payment_status === '已付款'
    || (order.payment_method === 'bank' && order.payment_status === '已匯款待確認');
}

const cityZipCodes = {
  '台北市': '100', '新北市': '220', '基隆市': '200', '桃園市': '330', '新竹市': '300',
  '新竹縣': '302', '苗栗縣': '360', '台中市': '400', '彰化縣': '500', '南投縣': '540',
  '雲林縣': '640', '嘉義市': '600', '嘉義縣': '602', '台南市': '700', '高雄市': '800',
  '屏東縣': '900', '宜蘭縣': '260', '花蓮縣': '970', '台東縣': '950', '澎湖縣': '880', '金門縣': '890'
};

async function requireAdmin(event) {
  const authorization = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt || jwt.startsWith('sb_secret_')) throw Object.assign(new Error('登入已過期，請重新登入'), { statusCode: 401 });
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${jwt}` }
  });
  if (!response.ok) throw Object.assign(new Error('登入已過期，請重新登入'), { statusCode: 401 });
  const user = await response.json();
  const admins = await supabase(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
  if (!admins.length) throw Object.assign(new Error('此帳號沒有管理員權限'), { statusCode: 403 });
}

function formatDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    await requireAdmin(event);
    const { orderNo } = JSON.parse(event.body || '{}');
    const rows = await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo || '')}&select=*`);
    if (!rows.length) throw new Error('找不到訂單');
    const order = rows[0];
    if (!canCreateLogistics(order)) throw new Error('只有已付款訂單或已送出匯款資料的銀行匯款訂單可以建立綠界物流單');
    if (order.logistics_trade_no) throw new Error('此訂單已建立綠界物流單');
    const subtype = { '711': 'UNIMARTC2C', family: 'FAMIC2C', kuroneko: 'TCAT' }[order.shipping_method];
    if (!subtype) throw new Error('此配送方式不支援綠界物流');
    const isHomeDelivery = subtype === 'TCAT';
    const details = order.shipping_details || {};
    const storeId = subtype === 'UNIMARTC2C' ? details.store711 : subtype === 'FAMIC2C' ? details.storefamily : '';
    if (!isHomeDelivery && !storeId) throw new Error('訂單缺少取貨門市代號');
    const receiverZipCode = text(details.zipcode || cityZipCodes[details.city]);
    const receiverAddress = text(`${details.city || ''}${details.address || ''}`);
    if (isHomeDelivery && (!receiverZipCode || !receiverAddress)) throw new Error('訂單缺少宅配郵遞區號或地址');

    const credentials = logisticsCredentials();
    if (!credentials.hashKey || !credentials.hashIv) throw new Error('綠界物流環境變數尚未設定');
    const siteUrl = (process.env.URL || 'https://douzhenmai.com').replace(/\/$/, '');
    const params = {
      MerchantID: credentials.merchantId,
      MerchantTradeNo: String(order.order_no).slice(0, 20),
      MerchantTradeDate: formatDate(),
      LogisticsType: isHomeDelivery ? 'HOME' : 'CVS', LogisticsSubType: subtype,
      GoodsAmount: String(Math.round(Number(order.order_amount))),
      CollectionAmount: '0', IsCollection: 'N',
      GoodsName: text((order.items || []).map(item => `${item.name}x${item.qty}`).join('#')).slice(0, 60),
      SenderName: text(process.env.ECPAY_LOGISTICS_SENDER_NAME || '鬥陣買').slice(0, 10),
      SenderCellPhone: text(process.env.ECPAY_LOGISTICS_SENDER_PHONE || '').slice(0, 10),
      ReceiverName: text(order.customer_name).slice(0, 10),
      ReceiverCellPhone: text(order.customer_phone).slice(0, 10),
      ReceiverEmail: text(order.customer_email).slice(0, 50),
      ServerReplyURL: `${siteUrl}/.netlify/functions/ecpay-logistics-callback`,
      Remark: text(order.note).slice(0, 40)
    };
    if (isHomeDelivery) {
      const senderZipCode = text(process.env.ECPAY_LOGISTICS_SENDER_ZIPCODE);
      const senderAddress = text(process.env.ECPAY_LOGISTICS_SENDER_ADDRESS);
      if (!senderZipCode || !senderAddress) throw new Error('黑貓宅配需要設定寄件人郵遞區號與地址');
      Object.assign(params, {
        SenderZipCode: senderZipCode.slice(0, 6), SenderAddress: senderAddress.slice(0, 60),
        ReceiverZipCode: receiverZipCode.slice(0, 6), ReceiverAddress: receiverAddress.slice(0, 60),
        Temperature: '0001', Distance: '00', Specification: '0001',
        ScheduledPickupTime: '4', ScheduledDeliveryTime: '4'
      });
    } else {
      params.ReceiverStoreID = text(storeId);
    }
    params.CheckMacValue = checkMacValue(params, credentials.hashKey, credentials.hashIv);
    const response = await fetch('https://logistics.ecpay.com.tw/Express/Create', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params)
    });
    const reply = (await response.text()).trim();
    const [code, logisticsTradeNo] = reply.split('|');
    if (!response.ok || code !== '1' || !logisticsTradeNo) throw new Error(`綠界物流建單失敗：${reply || response.status}`);
    const updated = await supabase(`orders?order_no=eq.${encodeURIComponent(order.order_no)}&logistics_trade_no=eq.`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ logistics_trade_no: logisticsTradeNo, logistics_status: '已建立', logistics_message: reply, logistics_created_at: new Date().toISOString() })
    });
    if (!updated.length) throw new Error('此訂單已建立綠界物流單');
    return json(200, updated[0]);
  } catch (error) {
    return json(error.statusCode || 400, { error: error.message || '建立物流單失敗' });
  }
};
