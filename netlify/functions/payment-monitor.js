const { supabase, syncSheet } = require('./_orders');
const { queryPayment } = require('./_payment-query');
const { recoveryOrder, assertSamePayment } = require('./_payment-order');
const patchState = data => supabase('payment_monitor_state?id=eq.1', { method: 'PATCH', body: JSON.stringify(data) });

async function checkPending(pending) {
  const path = `pending_ecpay_orders?order_no=eq.${encodeURIComponent(pending.order_no)}`;
  let status, error = null;
  try {
    const payment = await queryPayment(pending.order_no, { allowUnpaid: true });
    if (payment.TradeStatus !== '1') status = 'unpaid';
    else {
      await recoveryOrder(pending, payment);
      const existing = await supabase(`orders?order_no=eq.${encodeURIComponent(pending.order_no)}&select=*`);
      if (existing.length) { assertSamePayment(existing[0], payment); status = 'sync_pending'; }
      else status = 'paid_missing';
    }
  } catch (failure) {
    if (failure.rateLimited) throw failure;
    status = 'check_failed'; error = failure.message;
  }
  await supabase(path, { method: 'PATCH', body: JSON.stringify({
    check_status: status, check_error: error, ...(status === 'paid_missing' ? { review_required: true } : {}), ...(pending.check_status !== status ? { alerted_at: null } : {}), last_checked_at: new Date().toISOString(),
    // Older abandoned checkouts remain visible and are checked daily; never delete them.
    next_check_at: new Date(Date.now() + (Date.now() - Date.parse(pending.created_at) > 86400000 ? 86400000 : 600000)).toISOString()
  }) });
  // Re-read to avoid alarming on a callback that finished while this check ran.
  const remaining = await supabase(`${path}&select=order_no`);
  if (remaining.length && status !== 'unpaid' && (!pending.alerted_at || pending.check_status !== status)) {
    if (!process.env.GOOGLE_SHEET_WEBHOOK_URL) throw new Error('查核通知尚未設定');
    await syncSheet({ order_no: pending.order_no, order_amount: pending.expected_amount,
      alert_status: status, alert_message: error || '', alert_key: `${pending.order_no}:${status}` }, 'paymentAlert');
    await supabase(path, { method: 'PATCH', body: JSON.stringify({ alerted_at: new Date().toISOString() }) });
  }
  return status;
}

exports.handler = async () => {
  // Netlify schedules only run on published production deploys. This additional
  // guard also prevents accidental preview invocation from sending live mail.
  if (process.env.CONTEXT !== 'production' || process.env.PAYMENT_MONITOR_ENABLED !== 'true') return { statusCode: 200, body: 'Preview: monitoring disabled' };
  try {
    const rows = await supabase('rpc/claim_payment_checks', { method: 'POST', body: '{}' });
    for (const pending of rows) await checkPending(pending);
    await patchState({ last_run_at: new Date().toISOString(), last_error: null });
    return { statusCode: 200, body: JSON.stringify({ checked: rows.length }) };
  } catch (error) {
    console.error('Payment monitor failed', error.message);
    await patchState({ last_run_at: new Date().toISOString(), last_error: error.message,
      ...(error.rateLimited ? { cooldown_until: new Date(Date.now() + 1800000).toISOString() } : {}) });
    // The same mail service can be unavailable, but don't hide monitor failures.
    try {
      if (process.env.GOOGLE_SHEET_WEBHOOK_URL) await syncSheet({ order_no: 'MONITOR',
        alert_status: 'monitor_failed', alert_key: `monitor:${new Date().toISOString().slice(0, 10)}`,
        alert_message: '自動查核執行失敗，請至後台查看查核狀態。' }, 'paymentAlert');
    } catch (mailError) { console.error('Monitor failure alert failed', mailError.message); }
    return { statusCode: 500, body: 'Payment monitor failed' };
  }
};
exports.checkPending = checkPending;
