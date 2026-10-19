const message = document.getElementById('message');
const orders = document.getElementById('orders');
const refresh = document.getElementById('refresh');
let busy = false;

async function request(body) {
  const token = sessionStorage.getItem('ibuy-admin-token');
  if (!token) throw new Error('請先在此分頁登入商店後台，再回到本頁查帳。');
  const response = await fetch('/.netlify/functions/ecpay-reconcile', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '查帳失敗');
  return data;
}

function setBusy(value) {
  busy = value;
  refresh.disabled = value;
  orders.querySelectorAll('button').forEach(button => { button.disabled = value || button.dataset.ready !== 'true'; });
}

async function load() {
  if (busy) return;
  setBusy(true); message.textContent = '讀取中…';
  try {
    const data = await request();
    orders.replaceChildren();
    for (const order of data.orders) {
      const row = document.createElement('div'); row.className = 'row';
      const title = document.createElement('strong'); title.textContent = `${order.order_no} · NT$ ${order.expected_amount.toLocaleString('zh-TW')}`;
      const status = document.createElement('p'); status.className = 'status'; status.textContent = '尚未核對付款結果';
      const actions = document.createElement('div'); actions.className = 'actions';
      const inspect = document.createElement('button'); inspect.textContent = '向綠界查帳'; inspect.dataset.ready = 'true';
      const recover = document.createElement('button'); recover.textContent = '補回訂單與通知'; recover.className = 'recover'; recover.dataset.ready = 'false';
      inspect.onclick = async () => {
        if (busy) return;
        setBusy(true); recover.dataset.ready = 'false'; status.textContent = '正在核對綠界付款結果…';
        try {
          const result = await request({ orderNo: order.order_no, action: 'inspect' });
          status.textContent = `綠界已確認付款 NT$ ${result.amount}\n客戶：${result.customerName}\n團購主：${result.partnerName || '無'}\n綠界交易編號：${result.tradeNo}\n${result.existing ? '正式訂單已存在，可重試通知同步。' : '可用原始資料補回正式訂單。'}`;
          recover.dataset.ready = 'true';
        } catch (error) { status.textContent = error.message; }
        finally { setBusy(false); }
      };
      recover.onclick = async () => {
        if (busy) return;
        setBusy(true); status.textContent = '重新查帳並補回訂單…';
        try {
          const result = await request({ orderNo: order.order_no, action: 'recover' });
          status.textContent = result.sheetSynced ? '訂單已補回，試算表與通知流程已同步。請回後台重新整理查看。' : result.error;
          recover.dataset.ready = String(!result.sheetSynced);
          inspect.dataset.ready = String(!result.sheetSynced);
        } catch (error) { status.textContent = error.message; }
        finally { setBusy(false); }
      };
      actions.append(inspect, recover); row.append(title, status, actions); orders.append(row);
    }
    message.textContent = data.orders.length ? `共 ${data.orders.length} 筆待核對交易（最多顯示最新 100 筆）。請逐筆查帳。` : '沒有待核對的暫存交易。';
  } catch (error) { message.textContent = error.message; }
  finally { setBusy(false); }
}
refresh.onclick = load;
load();
