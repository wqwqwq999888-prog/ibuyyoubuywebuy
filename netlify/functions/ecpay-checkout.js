const crypto = require('crypto');
const { supabase, normalizeOrder, validateProductPricing, campaignIdFromCookie } = require('./_orders');

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

  let request;
  try { request = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }
  if (!request.order || !request.params || !HASH_KEY || !HASH_IV) return { statusCode: 400, body: '付款訂單資料或設定不完整' };
  const paymentOrigin = process.env.CONTEXT === 'deploy-preview' ? process.env.DEPLOY_PRIME_URL : 'https://douzhenmai.com';
  if (!paymentOrigin || !/^https:\/\//.test(paymentOrigin)) return { statusCode: 500, body: '付款回傳設定不完整' };
  if (request.order) request.order.campaignId = campaignIdFromCookie(event);
  const requestedParams = request.params || request;
  // Keep the payment payload assembled on the server.  Besides preventing the
  // browser from accidentally dropping signed fields, this also guarantees
  // that the payer and order references reach ECPay in both checkout flows.
  const params = {
    ...requestedParams,
    MerchantID: process.env.ECPAY_MERCHANT_ID || '3504484',
    ReturnURL: `${paymentOrigin}/.netlify/functions/ecpay-return`,
    OrderResultURL: `${paymentOrigin}/.netlify/functions/ecpay-order-result`,
    CustomField1: String(request.order?.customer?.name || requestedParams.CustomField1 || ''),
    CustomField2: String(request.order?.customer?.phone || requestedParams.CustomField2 || ''),
    CustomField3: String(request.order?.customer?.email || requestedParams.CustomField3 || ''),
    CustomField4: String(request.order?.orderId || requestedParams.MerchantTradeNo || '')
  };
  if (request.order) {
    let pending;
    try {
      pending = await validateProductPricing(normalizeOrder(request.order, '待付款'));
    } catch (error) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
    }
    if (pending.order_no !== params.MerchantTradeNo || Number(params.TotalAmount) !== pending.order_amount) {
      return { statusCode: 400, body: JSON.stringify({ error: '付款資料與訂單不一致' }) };
    }
    const validatedPayload = {
      ...request.order,
      items: pending.items,
      subtotal: pending.product_amount,
      productAmount: pending.product_amount,
      discountAmount: pending.discount_amount,
      shippingFee: pending.shipping_fee,
      total: pending.order_amount
    };
    await supabase('pending_ecpay_orders', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ order_no: pending.order_no, payload: validatedPayload, expected_amount: pending.order_amount })
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
    body: JSON.stringify({ params, CheckMacValue: checkMacValue }),
  };
};
