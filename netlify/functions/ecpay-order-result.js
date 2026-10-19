const { checkMacValue } = require('./_ecpay');
const { supabase } = require('./_orders');
const { queryPayment } = require('./_payment-query');
const { completePayment, assertSamePayment } = require('./_payment-order');

// The browser only transports ECPay's signed result. All verification and
// finalization happen here on the server, using the stored checkout snapshot.
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body;
  const params = Object.fromEntries(new URLSearchParams(body));
  const orderId = params.MerchantTradeNo || '';
  const valid = process.env.ECPAY_HASH_KEY && process.env.ECPAY_HASH_IV && params.CheckMacValue &&
    checkMacValue(params) === params.CheckMacValue &&
    params.MerchantID === (process.env.ECPAY_MERCHANT_ID || '3504484');
  let html;
  if (!valid) html = renderSuccess(orderId, 'unverified');
  else if (params.SimulatePaid === '1') html = renderSuccess(orderId, 'simulation');
  else if (params.RtnCode !== '1') html = renderFailure(params.RtnMsg || '付款未完成', orderId);
  else {
    let state = 'pending';
    try { state = await finishBrowserPayment(params); }
    catch (error) {
      // Never show "pay again" for an authenticated successful payment whose
      // database or mail synchronization is temporarily unavailable.
      console.error('Browser payment finalization incomplete', orderId, error.message);
    }
    html = renderSuccess(orderId, state);
  }
  return { statusCode: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'
  }, body: html };
};

async function finishBrowserPayment(params) {
  if (!/^[a-zA-Z0-9]{1,20}$/.test(params.MerchantTradeNo || '') || !params.TradeNo ||
      !/^\d+$/.test(params.TradeAmt || '')) throw new Error('Invalid payment reference');
  const pendingPath = `pending_ecpay_orders?order_no=eq.${encodeURIComponent(params.MerchantTradeNo)}&select=*`;
  const existingPath = `orders?order_no=eq.${encodeURIComponent(params.MerchantTradeNo)}&select=*`;
  let pending = (await supabase(pendingPath))[0];
  if (!pending) {
    assertSamePayment((await supabase(existingPath))[0], params);
    return 'complete';
  }
  if (pending.review_required || pending.check_status === 'paid_missing') return 'review';
  const payment = await queryPayment(params.MerchantTradeNo);
  if (payment.TradeNo !== params.TradeNo || Number(payment.TradeAmt) !== Number(params.TradeAmt)) {
    throw new Error('Payment result and query do not match');
  }
  // A callback or the monitor may have completed/flagged it while querying.
  pending = (await supabase(pendingPath))[0];
  if (!pending) {
    assertSamePayment((await supabase(existingPath))[0], payment);
    return 'complete';
  }
  if (pending.review_required || pending.check_status === 'paid_missing') return 'review';
  await completePayment(pending, payment, 'ecpay_browser_query');
  return 'complete';
}

function renderSuccess(orderId, state = 'complete') {
  const complete = state === 'complete';
  const messages = {
    complete: ['付款成功！', '訂單已成立，訂單確認信已送出。', '若未在收件匣看到，請檢查垃圾郵件資料夾。'],
    pending: ['付款結果處理中', '已收到綠界付款成功結果，訂單或通知仍在處理中。', '請勿重複付款。若未收到確認信，請提供下方訂單編號聯絡我們。'],
    review: ['付款結果待核對', '這筆交易已交由商家核對，確認後會通知你。', '請勿重複付款，並保留下方訂單編號。'],
    unverified: ['付款狀態確認中', '目前無法驗證這次付款結果。', '請勿重複付款，請提供訂單編號聯絡我們確認。'],
    simulation: ['付款通知測試', '這是模擬通知，沒有建立訂單或寄出確認信。', '此畫面不代表實際付款結果。']
  };
  const message = messages[state];
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${message[0]} | 鬥陣買肉乾</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --gold:#C9A84C; --gold-light:#E8C96A;
    --dark:#111; --dark2:#1A1A1A; --dark3:#262626;
    --text:#E8E0D0; --text-dim:#998F7E; --green:#27AE60;
    --serif:'Noto Serif TC',Georgia,serif;
    --sans:'Noto Sans TC','PingFang TC',sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--dark);color:var(--text);font-family:var(--sans);min-height:100vh}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--dark3)}
  .brand-title{font-family:var(--serif);font-size:22px;color:var(--gold);font-weight:700;letter-spacing:2px}
  .brand-sub{font-size:10px;color:var(--text-dim);letter-spacing:4px;margin-top:2px}
  .nav a{color:var(--text-dim);text-decoration:none;font-size:13px}
  .progress{display:flex;align-items:center;justify-content:center;gap:12px;padding:24px 16px;border-bottom:1px solid var(--dark3);flex-wrap:wrap}
  .step{display:flex;align-items:center;gap:10px}
  .dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;background:var(--green)}
  .dot.now{background:var(--gold);color:var(--dark)}
  .step-txt{font-size:13px;color:var(--text)}
  .line{width:40px;height:1px;background:var(--dark3)}
  .wrap{max-width:560px;margin:0 auto;padding:56px 24px 48px;text-align:center}
  .icon{font-size:72px;margin-bottom:24px}
  h1{font-family:var(--serif);font-size:34px;color:var(--gold);margin-bottom:24px;font-weight:700;letter-spacing:2px}
  .msg{font-size:15px;line-height:1.9;color:var(--text)}
  .msg-dim{font-size:14px;color:var(--text-dim);line-height:1.9;margin-top:4px}
  .order-box{margin:36px auto 32px;padding:22px 20px;border:1px solid var(--gold);border-radius:6px;max-width:420px}
  .order-label{font-size:13px;color:var(--text-dim);margin-bottom:10px}
  .order-num{font-family:var(--serif);font-size:26px;color:var(--gold);font-weight:700;letter-spacing:2px;word-break:break-all}
  .note{font-size:14px;color:var(--text-dim);line-height:1.9;margin-bottom:40px;padding:0 8px}
  .btn{display:inline-block;padding:14px 44px;background:var(--gold);color:var(--dark);text-decoration:none;border-radius:4px;font-size:15px;font-weight:700;letter-spacing:3px;transition:background .2s}
  .btn:hover{background:var(--gold-light)}
</style>
</head>
<body>
  <div class="nav">
    <div>
      <div class="brand-title">鬥陣買肉乾</div>
      <div class="brand-sub">I BUY. YOU BUY. WE BUY.</div>
    </div>
    <a href="/">繼續購物</a>
  </div>

  <div class="progress">
    <div class="step"><div class="dot">✓</div><div class="step-txt">填寫資料</div></div>
    <div class="line"></div>
    <div class="step"><div class="dot">✓</div><div class="step-txt">確認訂單</div></div>
    <div class="line"></div>
    <div class="step"><div class="dot now">3</div><div class="step-txt">付款完成</div></div>
  </div>

  <div class="wrap">
    <div class="icon">${complete ? "🎉" : "⏳"}</div>
    <h1>${message[0]}</h1>
    <p class="msg">${message[1]}</p>
    <p class="msg-dim">${message[2]}</p>

    <div class="order-box">
      <div class="order-label">你的訂單編號</div>
      <div class="order-num">${escapeHTML(orderId)}</div>
    </div>

    <p class="note">${complete ? "我們將盡速為你備貨出貨，讓美味早點到你手中！" : "需要協助時，請透過官方 LINE 與我們聯絡。"}<br><a href="https://lin.ee/wvbqdo7" style="color:var(--gold)">聯絡我們</a></p>

    <a href="/" class="btn">繼續逛逛</a>
  </div>

  <script>
    // 訂單完成，清空購物車暫存
    try {
      if (${complete}) {
        localStorage.removeItem('cart');
        localStorage.removeItem('checkoutData');
      }
    } catch(e){}
  </script>
</body>
</html>`;
}

function renderFailure(reason, orderId) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>付款未完成 | 鬥陣買肉乾</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700&family=Noto+Sans+TC:wght@400;500&display=swap" rel="stylesheet">
<style>
  body{background:#111;color:#E8E0D0;font-family:'Noto Sans TC',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;margin:0}
  .card{background:#1A1A1A;border:1px solid #333;border-radius:12px;padding:48px 32px;max-width:480px;width:100%;text-align:center}
  .icon{font-size:64px;margin-bottom:24px}
  h1{font-family:'Noto Serif TC',serif;font-size:26px;color:#C9A84C;margin-bottom:20px;font-weight:700}
  p{color:#998F7E;font-size:14px;line-height:1.9;margin-bottom:8px}
  .reason{color:#C0392B;margin-top:16px;font-size:14px}
  .oid{color:#998F7E;font-size:12px;margin-top:8px}
  .btn{display:inline-block;margin-top:32px;padding:14px 36px;background:#C9A84C;color:#111;text-decoration:none;border-radius:4px;font-size:15px;font-weight:700;letter-spacing:2px}
</style>
</head>
<body>
<div class="card">
  <div class="icon">😢</div>
  <h1>付款未完成</h1>
  <p>很抱歉，這筆付款沒有成功完成。</p>
  <p class="reason">原因：${escapeHTML(reason)}</p>
  ${orderId ? `<p class="oid">訂單編號：${escapeHTML(orderId)}</p>` : ''}
  <p style="margin-top:16px">你可以回到購物車重新結帳，或改用其他付款方式。</p>
  <a href="/checkout.html" class="btn">重新付款</a>
</div>
</body>
</html>`;
}

function escapeHTML(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
