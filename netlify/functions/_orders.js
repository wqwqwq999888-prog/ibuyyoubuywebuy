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

async function validateProductPricing(order) {
  const requested = new Map();
  for (const item of order.items) {
    const productNo = String(item.productNo || '');
    const qty = Number(item.qty);
    if (!/^\d+$/.test(productNo) || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('商品資料或數量錯誤');
    requested.set(productNo, (requested.get(productNo) || 0) + qty);
  }

  const productNos = [...requested.keys()];
  const products = await supabase(`products?product_no=in.(${productNos.map(encodeURIComponent).join(',')})&enabled=eq.true&select=product_no,name,price`);
  if (products.length !== productNos.length) throw new Error('購物車包含已下架或不存在的商品，請重新整理後再試');

  const byNo = Object.fromEntries(products.map(product => [String(product.product_no), product]));
  order.items = productNos.map(productNo => {
    const product = byNo[productNo];
    return { productNo, name: String(product.name), price: Number(product.price), qty: requested.get(productNo) };
  });
  const productAmount = order.items.reduce((total, item) => total + item.price * item.qty, 0);
  const discountAmount = Number(order.discount_amount);
  const shippingFee = Number(order.shipping_fee);
  if (discountAmount < 0 || discountAmount > productAmount || shippingFee < 0) throw new Error('折扣或運費金額錯誤');
  const expectedTotal = productAmount - discountAmount + shippingFee;
  if (order.product_amount !== productAmount || order.order_amount !== expectedTotal) {
    throw new Error('商品價格已更新，請重新整理購物車後再下單');
  }
  order.product_amount = productAmount;
  order.order_amount = expectedTotal;
  return order;
}

async function addProductCosts(order) {
  const productNos = [...new Set(order.items.map(item => String(item.productNo || '')).filter(Boolean))];
  if (!productNos.length) return order;
  const products = await supabase(`products?product_no=in.(${productNos.map(encodeURIComponent).join(',')})&select=product_no,cost`);
  const costs = Object.fromEntries(products.map(product => [String(product.product_no), Number(product.cost || 0)]));
  order.product_cost = order.items.reduce((total, item) => total + (costs[String(item.productNo)] || 0) * Number(item.qty || 0), 0);
  return order;
}

async function syncSheet(order, action = 'upsertOrder') {
  if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) {
    if (action === 'deleteOrder') throw new Error('尚未設定 Google Sheet webhook，無法安全刪除訂單');
    return;
  }
  const url = new URL(process.env.GOOGLE_SHEET_WEBHOOK_URL);
  if (process.env.GOOGLE_SHEET_WEBHOOK_SECRET) url.searchParams.set('secret', process.env.GOOGLE_SHEET_WEBHOOK_SECRET);
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, order })
  });
  const responseText = (await response.text()).trim();
  const expectedResponse = action === 'deleteOrder' ? 'DELETED' : 'OK';
  if (!response.ok || responseText !== expectedResponse) throw new Error(`Google Sheet sync ${response.status}: ${responseText}`);
}

async function requireAdmin(event) {
  const authorization = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt || jwt.startsWith('sb_secret_')) {
    const error = new Error('登入已過期，請重新登入'); error.statusCode = 401; throw error;
  }
  const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jwt}` } });
  if (!auth.ok) { const error = new Error('登入已過期，請重新登入'); error.statusCode = 401; throw error; }
  const user = await auth.json();
  const admins = await supabase(`admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
  if (!admins.length) { const error = new Error('此帳號沒有管理員權限'); error.statusCode = 403; throw error; }
  return user;
}

module.exports = { supabase, normalizeOrder, validateProductPricing, addProductCosts, syncSheet, requireAdmin };
