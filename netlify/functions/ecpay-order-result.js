const crypto = require('crypto');

// 綠界特殊的 URL encode 規則（與 ecpay-checkout.js 一致）
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

// 綠界會用 POST 把使用者瀏覽器導回這裡；靜態的 success.html 無法收 POST，
// 所以在這個 function 驗簽後，用 302 redirect 把使用者導去 success.html（GET）。
exports.handler = async (event) => {
  // 若被 GET 直接開啟（例如使用者按重新整理），直接送去成功頁
  if (event.httpMethod !== 'POST') {
    return { statusCode: 302, headers: { Location: '/success.html' }, body: '' };
  }

  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;

  // Netlify 對 x-www-form-urlencoded 有時會 base64；兩種都處理
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  const receivedMac = params.CheckMacValue;
  const orderId = params.MerchantTradeNo || '';
  const rtnCode = params.RtnCode || '';

  // 驗證 CheckMacValue
  let macValid = false;
  if (HASH_KEY && HASH_IV && receivedMac) {
    const p = { ...params };
    delete p.CheckMacValue;
    const sorted = Object.keys(p).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    let raw = `HashKey=${HASH_KEY}`;
    sorted.forEach(k => { raw += `&${k}=${p[k]}`; });
    raw += `&HashIV=${HASH_IV}`;
    const encoded = ecpayEncode(raw);
    const computed = crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
    macValid = (computed === receivedMac);
    if (!macValid) console.error('OrderResult CheckMacValue 驗證失敗', { orderId });
  }

  const status = (rtnCode === '1' && macValid) ? 'success' : 'fail';
  const location = `/success.html?orderId=${encodeURIComponent(orderId)}&status=${status}`;

  return {
    statusCode: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
    },
    body: '',
  };
};
