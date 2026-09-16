(function (root) {
  function monthKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit'
    }).formatToParts(date);
    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    return `${year}-${month}`;
  }

  function campaignForOrder(order, campaigns) {
    const id = order.shipping_details?.campaign_id;
    if (id) return campaigns.find(campaign => campaign.id === id) || null;
    if (!order.discount_code) return null;
    const matches = campaigns.filter(campaign => campaign.discount_code === order.discount_code);
    if (matches.length === 1) return matches[0];
    const byPartner = matches.filter(campaign => campaign.partner_name === order.partner_name);
    return byPartner.length === 1 ? byPartner[0] : null;
  }

  function orderFinance(order, campaigns) {
    const campaign = campaignForOrder(order, campaigns);
    const grossProfit = Number(order.gross_profit ?? (Number(order.order_amount || 0) - Number(order.shipping_fee || 0) - Number(order.product_cost || 0)));
    const discountedProducts = Math.max(0, Number(order.product_amount || 0) - Number(order.discount_amount || 0));
    const commission = campaign ? Math.round(discountedProducts * Number(campaign.commission_rate || 0) / 100) : 0;
    return { grossProfit, commission, profitAfterCommission: grossProfit - commission };
  }

  const api = { monthKey, campaignForOrder, orderFinance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdminOrderFinance = api;
})(typeof window !== 'undefined' ? window : globalThis);
