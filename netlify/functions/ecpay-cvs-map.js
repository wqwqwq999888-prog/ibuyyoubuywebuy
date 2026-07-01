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
  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;
  const MERCHANT_ID = '3504484';

  const qs = event.queryStringParameters || {};
  const logisticsSubType = qs.type || 'UNIMART';

  const serverReplyUrl = 'https://astounding-rabanadas-a0a6e1.netlify.app/.netlify/functions/ecpay-cvs-callback';

  const params = {
    MerchantID: MERCHANT_ID,
    LogisticsType: 'CVS',
    LogisticsSubType: logisticsSubType,
    IsCollection: 'N',
    ServerReplyURL: serverReplyUrl,
    ExtraData: 'test',
    Device: '0',
  };

  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  let raw = `HashKey=${HASH_KEY}`;
  sorted.forEach(key => { raw += `&${key}=${params[key]}`; });
  raw += `&HashIV=${HASH_IV}`;

  const encoded = ecpayEncode(raw);
  const mac = crypto.createHash('md5').update(encoded).digest('hex').toUpperCase();
  params.CheckMacValue = mac;

  const inputs = Object.keys(params).map(k =>
    `<input type="hidden" name="${k}" value="${params[k]}">`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>選擇門市</title></head>
<body>
<form id="f" method="POST" action="https://logistics.ecpay.com.tw/Express/map">
${inputs}
</form>
<script>document.getElementById('f').submit();</script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  };
};
