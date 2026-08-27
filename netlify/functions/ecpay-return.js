const crypto = require('crypto');
const { supabase, normalizeOrder, addProductCosts, syncSheet } = require('./_orders');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;

  const params = Object.fromEntries(new URLSearchParams(event.body));
  const receivedMac = params.CheckMacValue;
  delete params.CheckMacValue;

  const sorted = Object.keys(params).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  let str = `HashKey=${HASH_KEY}`;
  sorted.forEach(key => { str += `&${key}=${params[key]}`; });
  str += `&HashIV=${HASH_IV}`;
  str = encodeURIComponent(str).toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_')
    .replace(/%2e/g, '.').replace(/%21/g, '!')
    .replace(/%2a/g, '*').replace(/%28/g, '(')
    .replace(/%29/g, ')').replace(/%20/g, '+');

  const computedMac = crypto
    .createHash('sha256').update(str).digest('hex').toUpperCase();

  if (computedMac !== receivedMac) {
    console.error('CheckMacValue 驗證失敗');
    return { statusCode: 200, body: '0|Error' };
  }

  if (params.RtnCode === '1') {
    const orderId = params.MerchantTradeNo;
    try {
      // ECPay can resend the same server callback, and the vendor portal's
      // simulated-payment action also sends another callback for an already
      // paid trade. The first successful callback removes the pending row, so
      // acknowledge an existing order idempotently instead of reporting an
      // AmountError solely because pending_ecpay_orders no longer exists.
      const existing = await supabase(`orders?order_no=eq.${encodeURIComponent(orderId)}&select=order_no,order_amount`);
      if (existing.length) {
        if (Number(params.TradeAmt) !== Number(existing[0].order_amount)) {
          console.error('重複付款通知金額不符:', orderId);
          return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '0|AmountError' };
        }
        console.log('已處理的綠界付款通知，直接回覆成功:', orderId);
        return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '1|OK' };
      }

      const pending = await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(orderId)}&select=*`);
      if (!pending.length || Number(params.TradeAmt) !== Number(pending[0].expected_amount)) {
        return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '0|AmountError' };
      }
      const order = await addProductCosts(normalizeOrder({ ...pending[0].payload, tradeNo: params.TradeNo }, '已付款'));
      const created = await supabase('orders?on_conflict=order_no', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(order) });
      if (created.length) await syncSheet(created[0]);
      await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    } catch(e) {
      console.error('建立付款訂單失敗:', e);
      return { statusCode: 200, body: '0|OrderError' };
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: '1|OK',
  };
};
