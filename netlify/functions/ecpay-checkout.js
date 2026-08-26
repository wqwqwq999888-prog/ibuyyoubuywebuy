const crypto = require('crypto');
const { supabase, normalizeOrder } = require('./_orders');

function ecpayEncode(str) {
  return encodeURIComponent(str)
    .toLowerCase()
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, '+');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;

  const request = JSON.parse(event.body || '{}');
  const params = request.params || request;
  if (request.order) {
    const pending = normalizeOrder(request.order, '待付款');
    if (pending.order_no !== params.MerchantTradeNo || Number(params.TotalAmount) !== pending.order_amount) {
      return { statusCode: 400, body: JSON.stringify({ error: '付款資料與訂單不一致' }) };
    }
    await supabase('pending_ecpay_orders?on_conflict=order_no', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ order_no: pending.order_no, payload: request.order, expected_amount: pending.order_amount })
    });
  }

  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  let raw = `HashKey=${HASH_KEY}`;
  sorted.forEach(key => { raw += `&${key}=${params[key]}`; });
  raw += `&HashIV=${HASH_IV}`;

  const encoded = ecpayEncode(raw);

  const checkMacValue = crypto
    .createHash('sha256').update(encoded).digest('hex').toUpperCase();

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ CheckMacValue: checkMacValue }),
  };
};
