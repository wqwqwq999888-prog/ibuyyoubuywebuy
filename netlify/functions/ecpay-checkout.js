const crypto = require('crypto');

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

  const params = JSON.parse(event.body);

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
