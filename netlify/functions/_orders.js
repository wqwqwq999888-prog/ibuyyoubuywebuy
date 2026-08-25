const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase server environment is not configured');
  // sb_secret_ is an API key, not a JWT. Never send it as a Bearer token.
  return { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...extra };
}

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options, headers: supabaseHeaders(options.headers)
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function normalizeOrder(data, paymentStatus) {
  if (!data || !data.orderId || !data.customer?.name || !data.customer?.phone || !data.customer?.email) throw new Error('訂單資料不完整');
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('購物車不可為空');
  const productAmount = Number(data.productAmount ?? data.subtotal);
  const discountAmount = Number(data.discountAmount || 0);
  const shippingFee = Number(data.shippingFee || 0);
  const orderAmount = Number(data.total);
  if (![productAmount, discountAmount, shippingFee, orderAmount].every(Number.isFinite) || orderAmount < 0) throw new Error('訂單金額錯誤');
  return {
    order_no: String(data.orderId), customer_name: String(data.customer.name), customer_phone: String(data.customer.phone),
    customer_email: String(data.customer.email), email_marketing_consent: data.emailMarketingConsent === true,
    items: data.items, product_amount: productAmount, discount_amount: discountAmount, shipping_fee: shippingFee,
    order_amount: orderAmount, shipping_method: String(data.shipping?.method || ''), shipping_details: data.shipping || {},
    transfer_last_five: String(data.transfer5 || ''), transfer_time: data.transferTime || null, note: String(data.note || ''),
    payment_method: String(data.payment || ''), payment_status: paymentStatus, shipping_status: '待出貨',
    trade_no: String(data.tradeNo || ''), discount_code: data.discountCode || null, partner_name: data.partnerName || null
  };
}

async function syncSheet(order, action = 'upsertOrder') {
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) return;
  const url = new URL(process.env.GOOGLE_SHEET_WEBHOOK_URL);
  if (process.env.GOOGLE_SHEET_WEBHOOK_SECRET) url.searchParams.set('secret', process.env.GOOGLE_SHEET_WEBHOOK_SECRET);
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, order })
  });
  if (!response.ok) throw new Error(`Google Sheet sync ${response.status}`);
}

module.exports = { supabase, normalizeOrder, syncSheet };
