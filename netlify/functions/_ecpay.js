const crypto = require('crypto');

function encode(value) {
  return encodeURIComponent(value).toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_').replace(/%2e/g, '.')
    .replace(/%21/g, '!').replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');
}

function checkMacValue(params, algorithm = 'sha256') {
  const values = { ...params };
  delete values.CheckMacValue;
  const sorted = Object.keys(values).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const raw = `HashKey=${process.env.ECPAY_HASH_KEY}${sorted.map(key => `&${key}=${values[key]}`).join('')}&HashIV=${process.env.ECPAY_HASH_IV}`;
  return crypto.createHash(algorithm).update(encode(raw)).digest('hex').toUpperCase();
}

async function requireAdmin(event) {
  const authorization = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt || jwt.startsWith('sb_secret_')) throw Object.assign(new Error('登入已過期，請重新登入'), { statusCode: 401 });
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${jwt}` }
  });
  if (!response.ok) throw Object.assign(new Error('登入已過期，請重新登入'), { statusCode: 401 });
  return response.json();
}

module.exports = { checkMacValue, requireAdmin };
