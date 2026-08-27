const crypto = require('crypto');

function encode(value) {
  return encodeURIComponent(value).toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_').replace(/%2e/g, '.')
    .replace(/%21/g, '!').replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');
}

function checkMacValue(params, hashKey, hashIv) {
  const values = { ...params };
  delete values.CheckMacValue;
  const body = Object.keys(values)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(key => `${key}=${values[key]}`).join('&');
  return crypto.createHash('md5')
    .update(encode(`HashKey=${hashKey}&${body}&HashIV=${hashIv}`))
    .digest('hex').toUpperCase();
}

function logisticsCredentials() {
  return {
    merchantId: process.env.ECPAY_LOGISTICS_MERCHANT_ID || process.env.ECPAY_MERCHANT_ID || '3504484',
    hashKey: process.env.ECPAY_LOGISTICS_HASH_KEY || process.env.ECPAY_HASH_KEY,
    hashIv: process.env.ECPAY_LOGISTICS_HASH_IV || process.env.ECPAY_HASH_IV
  };
}

module.exports = { checkMacValue, logisticsCredentials };
