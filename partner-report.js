const config = window.ADMIN_CONFIG || {};
const isCloud = config.mode === 'supabase' && config.supabaseUrl && config.supabaseAnonKey;
const token = new URLSearchParams(location.search).get('token');
const money = value => `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
const year = document.querySelector('#year');
const month = document.querySelector('#month');
const now = new Date();

for (let value = now.getFullYear() - 2; value <= now.getFullYear() + 1; value++) {
  year.add(new Option(`${value} 年`, value, value === now.getFullYear(), value === now.getFullYear()));
}
for (let value = 1; value <= 12; value++) {
  month.add(new Option(`${value} 月`, value, value === now.getMonth() + 1, value === now.getMonth() + 1));
}

function showError() {
  document.querySelector('#report').classList.add('hidden');
  document.querySelector('#error').classList.remove('hidden');
}

function showReport(report) {
  document.querySelector('#error').classList.add('hidden');
  document.querySelector('#report').classList.remove('hidden');
  document.querySelector('#campaignName').textContent = `${report.campaign_name}｜團購月報表`;
  document.querySelector('#partnerName').textContent = `團主：${report.partner_name}　專屬折扣碼：${report.discount_code}　佣金：${report.commission_rate}%`;
  document.querySelector('#uses').textContent = report.uses;
  document.querySelector('#paid').textContent = report.paid_orders;
  document.querySelector('#revenue').textContent = money(report.net_product_amount);
  document.querySelector('#commission').textContent = money(report.commission_amount);
  document.querySelector('#rows').innerHTML = `<tr><td>已付款且未退款</td><td>${report.paid_orders}</td><td>${money(report.product_amount)}</td><td>${money(report.discount_amount)}</td><td>${money(report.net_product_amount)}</td></tr><tr><td>取消／退款</td><td>${report.cancelled_orders}</td><td>—</td><td>—</td><td>—</td></tr>`;
}

async function renderCloud() {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/partner_monthly_report`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ access_token: token, report_year: Number(year.value), report_month: Number(month.value) })
  });
  if (!response.ok) throw new Error('報表讀取失敗');
  const reports = await response.json();
  if (!reports.length) return showError();
  showReport(reports[0]);
}

function renderLocal() {
  const data = JSON.parse(localStorage.getItem('ibuy-admin-data-v1') || '{}');
  const campaign = (data.campaigns || []).find(item => item.report_token === token && item.enabled);
  if (!campaign) return showError();
  const orders = (data.orders || []).filter(order => order.discount_code === campaign.discount_code && new Date(order.created_at).getFullYear() === Number(year.value) && new Date(order.created_at).getMonth() + 1 === Number(month.value));
  const paid = orders.filter(order => order.payment_status === '已付款' && !['已取消', '已退款'].includes(order.order_status));
  const productAmount = paid.reduce((sum, order) => sum + Number(order.product_amount || 0), 0);
  const discountAmount = paid.reduce((sum, order) => sum + Number(order.discount_amount || 0), 0);
  const netAmount = productAmount - discountAmount;
  showReport({ campaign_name: campaign.name, partner_name: campaign.partner_name, discount_code: campaign.discount_code, commission_rate: campaign.commission_rate, uses: orders.length, paid_orders: paid.length, cancelled_orders: orders.length - paid.length, product_amount: productAmount, discount_amount: discountAmount, net_product_amount: netAmount, commission_amount: Math.round(netAmount * Number(campaign.commission_rate || 0) / 100) });
  document.querySelector('#localNote').classList.toggle('hidden', Boolean(data.orders?.length));
}

async function render() {
  if (!token) return showError();
  try {
    if (isCloud) await renderCloud(); else renderLocal();
  } catch {
    showError();
  }
}

year.onchange = month.onchange = render;
render();
