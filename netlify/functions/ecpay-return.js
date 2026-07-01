const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;

  const params = Object.fromEntries(new URLSearchParams(event.body));
  const receivedMac = params.CheckMacValue;
  delete params.CheckMacValue;

  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  let str = `HashKey=${HASH_KEY}`;
  sorted.forEach(key => { str += `&${key}=${params[key]}`; });
  str += `&HashIV=${HASH_IV}`;
  str = encodeURIComponent(str).toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_')
    .replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');

  const computedMac = crypto
    .createHash('sha256').update(str).digest('hex').toUpperCase();

  if (computedMac !== receivedMac) {
    console.error('CheckMacValue 驗證失敗');
    return { statusCode: 200, body: '0|Error' };
  }

  if (params.RtnCode === '1') {
    const orderId = params.MerchantTradeNo;
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwRwtyxF3-EdHy9nT_7ZOn_LLoRPqw-Pf3vTY4m0yISa1YM2tiCSgdpWoLXghAeMo643w/exec';
    try {
      await fetch(`${APPS_SCRIPT_URL}?action=updatePayment&orderId=${orderId}&status=已付款`);
    } catch(e) {
      console.error('更新試算表失敗:', e);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: '1|OK',
  };
};
