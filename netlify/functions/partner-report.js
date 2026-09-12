const { supabase } = require('./_orders');
const json = (statusCode, body) => ({ statusCode, headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' }, body:JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { access_token: token, report_year: year, report_month: month } = JSON.parse(event.body || '{}');
    if (!token || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('報表參數錯誤');
    const campaigns = await supabase(`campaigns?report_token=eq.${encodeURIComponent(token)}&enabled=eq.true&select=name,partner_name,discount_code,commission_rate`);
    const campaign = campaigns[0];
    if (!campaign) return json(404, { error: '找不到團購報表' });
    const start = new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000).toISOString();
    const orders = await supabase(`orders?discount_code=eq.${encodeURIComponent(campaign.discount_code)}&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&select=payment_status,product_amount,discount_amount`);
    const paid = orders.filter(order => order.payment_status === '已付款');
    const productAmount = paid.reduce((sum, order) => sum + Number(order.product_amount || 0), 0);
    const discountAmount = paid.reduce((sum, order) => sum + Number(order.discount_amount || 0), 0);
    const netAmount = productAmount - discountAmount;
    return json(200, {
      campaign_name:campaign.name, partner_name:campaign.partner_name, discount_code:campaign.discount_code,
      commission_rate:Number(campaign.commission_rate || 0), uses:orders.length, paid_orders:paid.length,
      pending_orders:orders.length-paid.length, product_amount:productAmount, discount_amount:discountAmount,
      net_product_amount:netAmount, commission_amount:Math.round(netAmount * Number(campaign.commission_rate || 0) / 100)
    });
  } catch (error) {
    console.error(error);
    return json(400, { error: error.message || '報表讀取失敗' });
  }
};
