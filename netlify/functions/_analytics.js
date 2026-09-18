const MEASUREMENT_ID = 'G-FRZ2RMV82S';

function stableClientId(orderNo) {
  let hash = 0;
  for (const character of String(orderNo || 'order')) hash = ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
  return `${hash || 1}.1`;
}

function purchasePayload(order) {
  const analytics = order.shipping_details?.analytics || {};
  const parameters = {
    transaction_id: String(order.order_no),
    currency: 'TWD',
    value: Math.max(0, Number(order.product_amount) - Number(order.discount_amount || 0)),
    tax: 0,
    shipping: Number(order.shipping_fee || 0),
    coupon: order.discount_code || undefined,
    campaign_id: analytics.campaign_id || order.shipping_details?.campaign_id || undefined,
    campaign_name: analytics.utm_campaign || analytics.campaign_name || undefined,
    campaign_partner: analytics.campaign_partner || order.partner_name || undefined,
    source: analytics.utm_source || undefined,
    medium: analytics.utm_medium || undefined,
    term: analytics.utm_term || undefined,
    content: analytics.utm_content || undefined,
    engagement_time_msec: 1,
    items: (order.items || []).map(item => ({
      item_id: String(item.productNo),
      item_name: String(item.name),
      price: Number(item.price),
      quantity: Number(item.qty)
    }))
  };
  Object.keys(parameters).forEach(key => parameters[key] === undefined && delete parameters[key]);
  if (analytics.session_id) parameters.session_id = String(analytics.session_id);
  return {
    client_id: analytics.client_id || stableClientId(order.order_no),
    events: [{ name: 'purchase', params: parameters }]
  };
}

async function sendPurchase(order) {
  const apiSecret = process.env.GA4_API_SECRET;
  if (!apiSecret) return { skipped: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${encodeURIComponent(apiSecret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchasePayload(order)),
      signal: controller.signal
    });
    if (!response.ok) console.error(`GA4 purchase tracking failed (${response.status})`);
    return { sent: response.ok };
  } catch (error) {
    console.error('GA4 purchase tracking failed:', error.message);
    return { sent: false };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { purchasePayload, sendPurchase };
