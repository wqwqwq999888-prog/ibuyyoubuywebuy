const crypto = require('crypto');

exports.handler = async (event) => {
  // 綠界會用 POST 導回來；非 POST 直接擋掉
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const HASH_KEY = process.env.ECPAY_HASH_KEY;
  const HASH_IV = process.env.ECPAY_HASH_IV;

  // 解析綠界傳來的參數
  const params = Object.fromEntries(new URLSearchParams(event.body));
  const receivedMac = params.CheckMacValue;
  delete params.CheckMacValue;

  // 驗證 CheckMacValue
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

  const macOk = computedMac === receivedMac;
  const paid = params.RtnCode === '1';
  const isSuccess = macOk && paid;
  const orderId = params.MerchantTradeNo || '';
  const tradeNo = params.TradeNo || '';
  const tradeAmt = params.TradeAmt || '';

  // 正式訂單只由 ReturnURL 的伺服器通知建立；瀏覽器導回頁絕不寫入訂單或試算表。

  const html = isSuccess
    ? renderSuccess(orderId)
    : renderFailure(params.RtnMsg || '付款未完成', orderId);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: html,
  };
};

function renderSuccess(orderId) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>付款成功 | 鬥陣買肉乾</title>
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
    <div class="icon">🎉</div>
    <h1>付款成功！</h1>
    <p class="msg">感謝你的訂購，我們已收到你的信用卡付款。</p>
    <p class="msg">訂單確認信將在幾分鐘內寄送到你的 Email。</p>
    <p class="msg-dim">📬 若未在收件匣看到，請檢查垃圾郵件資料夾。</p>

    <div class="order-box">
      <div class="order-label">你的訂單編號</div>
      <div class="order-num">${escapeHTML(orderId)}</div>
    </div>

    <p class="note">💨 我們將盡速為你備貨出貨，讓美味早點到你手中！</p>

    <a href="/" class="btn">繼續逛逛</a>
  </div>

  <script>
    // 訂單完成，清空購物車暫存
    try {
      localStorage.removeItem('cart');
      localStorage.removeItem('checkoutData');
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
