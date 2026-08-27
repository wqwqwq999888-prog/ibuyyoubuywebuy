const crypto = require('crypto');
const { supabase } = require('./_orders');

function encodeEcpay(value) {
  return encodeURIComponent(value).toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_')
    .replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');
}

function expectedMac(params) {
  const sorted = Object.keys(params).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  let raw = `HashKey=${process.env.ECPAY_HASH_KEY}`;
  sorted.forEach(key => { raw += `&${key}=${params[key]}`; });
  raw += `&HashIV=${process.env.ECPAY_HASH_IV}`;
  return crypto.createHash('md5').update(encodeEcpay(raw)).digest('hex').toUpperCase();
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const params = Object.fromEntries(new URLSearchParams(event.body || ''));
    const received = params.CheckMacValue;
    delete params.CheckMacValue;
    if (!received || expectedMac(params) !== received) return { statusCode: 200, body: '0|Error' };

    const orderNo = params.MerchantTradeNo || '';
    if (!orderNo) return { statusCode: 200, body: '0|OrderError' };
    await supabase(`orders?order_no=eq.${encodeURIComponent(orderNo)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        logistics_trade_no: String(params.AllPayLogisticsID || ''),
        logistics_status: String(params.RtnCode || ''),
        logistics_message: String(params.RtnMsg || '')
      })
    });
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '1|OK' };
  } catch (error) {
    console.error('綠界物流狀態回呼失敗:', error);
    return { statusCode: 200, body: '0|Error' };
  }
};
