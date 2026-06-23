const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;

  const params = JSON.parse(event.body);

  // 1. 依字母排序
  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  // 2. 組成字串
  let str = `HashKey=${HASH_KEY}`;
  sorted.forEach(key => { str += `&${key}=${params[key]}`; });
  str += `&HashIV=${HASH_IV}`;

  // 3. URL encode 轉小寫
  str = encodeURIComponent(str).toLowerCase();

  // 4. .NET 特殊字元替換
  str = str
    .replace(/%2d/g, '-').replace(/%5f/g, '_')
    .replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')');

  // 5. SHA256 轉大寫
  const checkMacValue = crypto
    .createHash('sha256').update(str).digest('hex').toUpperCase();

  return {
    statusCode: 200,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ CheckMacValue: checkMacValue }),
  };
};
