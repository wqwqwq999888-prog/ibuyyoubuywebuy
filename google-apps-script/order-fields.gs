// 加入既有「鬥陣買訂單系統」的 order-sync.gs。
// 此檔不宣告 doPost；既有 doPost 必須先將 Netlify webhook 導向 handleOrderWebhook。
// Supabase 是唯一主資料庫；新版 webhook 只寫 Sheet。下方回寫函式僅供舊正式網站過渡期相容。

// 訂單副本固定寫回既有正式試算表，不使用 Apps Script 當下綁定的新試算表。
var ORDER_SPREADSHEET_ID = '1jmAqYQ8SUJJ9331o6kfKUTHJ0XNJsKaa39mxpObXlGE';
var ORDER_FROM_EMAIL = 'dzhenmai@gmail.com';

// 舊版正式網站在切換完成前仍會使用；保留 24 欄 row builder 以避免中斷現行訂單。
function buildOrderRow(data, itemsText, shippingText, deliveryInfo, paymentStatus, tradeNo) {
  var productAmount = Number(data.productAmount != null ? data.productAmount : data.subtotal || 0);
  var discountAmount = Number(data.discountAmount || 0);
  var shippingFee = Number(data.shippingFee || 0);
  var orderAmount = Number(data.total || Math.max(0, productAmount - discountAmount) + shippingFee);
  var productCost = (data.items || []).reduce(function(sum, item) {
    return sum + Number(item.cost || 0) * Number(item.qty || 0);
  }, 0);
  return [
    new Date().toLocaleString('zh-TW', {timeZone:'Asia/Taipei'}), data.orderId,
    data.customer.name, data.customer.phone, data.customer.email, itemsText,
    'NT$ ' + orderAmount, shippingText, deliveryInfo, data.transfer5 || '',
    data.transferTime || '', data.note || '', paymentStatus, '待出貨', tradeNo || '',
    '', '', productCost, productAmount, discountAmount, shippingFee,
    data.discountCode || '', data.partnerName || '', orderAmount - shippingFee - productCost
  ];
}

// 過渡期相容舊正式網站；新版上線後不再由此路徑建立訂單。
// sb_secret_ 只放 apikey；只有舊 JWT service_role key 才能放 Authorization Bearer。
function syncOrderToSupabase(data, itemsText, paymentStatus) {
  var properties = PropertiesService.getScriptProperties();
  var supabaseUrl = properties.getProperty('SUPABASE_URL');
  var apiKey = properties.getProperty('SUPABASE_SECRET_KEY') || properties.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !apiKey) throw new Error('尚未設定 Supabase 訂單同步資料');
  var productAmount = Number(data.productAmount != null ? data.productAmount : data.subtotal || 0);
  var discountAmount = Number(data.discountAmount || 0);
  var shippingFee = Number(data.shippingFee || 0);
  var headers = {apikey:apiKey,Prefer:'resolution=merge-duplicates,return=minimal'};
  if (apiKey.indexOf('sb_secret_') !== 0) headers.Authorization = 'Bearer ' + apiKey;
  var order = {
    order_no:data.orderId, product_amount:productAmount, discount_amount:discountAmount,
    shipping_fee:shippingFee, order_amount:Number(data.total || Math.max(0,productAmount-discountAmount)+shippingFee),
    product_cost:(data.items||[]).reduce(function(sum,item){return sum+Number(item.cost||0)*Number(item.qty||0);},0),
    discount_code:data.discountCode||null, partner_name:data.partnerName||null,
    customer_name:data.customer?data.customer.name:'', customer_phone:data.customer?data.customer.phone:'',
    customer_email:data.customer?data.customer.email:'', items:data.items||[], note:data.note||'',
    payment_method:data.payment||'', payment_status:paymentStatus||'待付款', shipping_status:'待出貨'
  };
  var response=UrlFetchApp.fetch(supabaseUrl+'/rest/v1/orders?on_conflict=order_no',{
    method:'post',contentType:'application/json',headers:headers,payload:JSON.stringify(order),muteHttpExceptions:true
  });
  if(response.getResponseCode()<200||response.getResponseCode()>=300) throw new Error('Supabase 訂單同步失敗：'+response.getContentText());
}

function isOrderWebhookRequest(request) {
  return Boolean(request && request.action && request.order && request.order.order_no);
}

function shippingMethodText_(method) {
  return ({'711':'7-11超商取貨','family':'全家超商取貨','kuroneko':'黑貓宅配'})[method] || method || '';
}

function deliveryInfoText_(method, details) {
  details = details || {};
  if (method === '711') {
    return ['7-11：' + (details.store711 || ''), details.store711Address || ''].filter(String).join('／');
  }
  if (method === 'family') {
    return ['全家：' + (details.storefamily || ''), details.storefamilyAddress || ''].filter(String).join('／');
  }
  return [details.city || '', details.address || ''].filter(String).join(' ');
}

function handleOrderWebhook(e, request) {
  var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var supplied = e && e.parameter && e.parameter.secret;
  if (!expected || supplied !== expected) return ContentService.createTextOutput('Unauthorized');

  var order = request.order;
  var spreadsheet = SpreadsheetApp.openById(ORDER_SPREADSHEET_ID);
  var sheets = spreadsheet ? spreadsheet.getSheets() : [];
  var sheet = sheets.find(function(candidate) {
    return typeof SHEET_GID !== 'undefined' && candidate.getSheetId() === Number(SHEET_GID);
  }) || (spreadsheet && spreadsheet.getSheetByName('訂單')) || sheets.find(function(candidate) {
    var lastColumn = candidate.getLastColumn();
    if (!lastColumn) return false;
    var headers = candidate.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    return headers.indexOf('訂單編號') !== -1;
  }) || sheets[0];
  if (!sheet) return ContentService.createTextOutput('Order sheet not found');

  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function(row, index) {
    return index > 0 && String(row[1]) === String(order.order_no);
  });
  var itemsText = (order.items || []).map(function(item) {
    return item.name + ' × ' + item.qty;
  }).join('、');
  var shippingDetails = order.shipping_details || {};
  var row = [
    order.created_at, order.order_no, order.customer_name, order.customer_phone,
    order.customer_email, itemsText, 'NT$ ' + order.order_amount, shippingMethodText_(order.shipping_method),
    deliveryInfoText_(order.shipping_method, shippingDetails), order.transfer_last_five,
    order.transfer_time || '', order.note, order.payment_status, order.shipping_status,
    order.trade_no, order.shipped_at || '', order.completed_at || '', order.product_cost,
    order.product_amount, order.discount_amount, order.shipping_fee, order.discount_code || '',
    order.partner_name || '', order.gross_profit
  ];
  if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, 24).setValues([row]);
  else {
    sheet.appendRow(row);
    // 只有正式新建訂單寄信；後台 updateStatus 不得重複寄送確認信。
    if (request.action === 'upsertOrder') notifyNewServerOrder_(order, itemsText);
  }
  return ContentService.createTextOutput('OK');
}

function notifyNewServerOrder_(order, itemsText) {
  var details = order.shipping_details || {};
  var emailItemsText = (order.items || []).map(function(item) {
    return (item.name || '商品') + ' x ' + Number(item.qty || 0) + ' 包';
  }).join('\n') || itemsText;
  var deliveryInfo = deliveryInfoText_(order.shipping_method, details);
  var paymentInstruction = order.payment_method === 'bank' ?
    '付款方式：銀行匯款\n台灣銀行 (004)\n戶名：蕭百芳\n帳號：0000049004971344\n\n您填寫的轉帳後五碼：' + (order.transfer_last_five || '') :
    '付款方式：信用卡（已付款）';
  var fulfillmentMessage = order.payment_method === 'bank' ?
    '確認收款後，我們將盡快備貨出貨！' :
    '付款已完成，我們將盡快備貨出貨！';
  var customerBody = '親愛的 ' + order.customer_name + ' 您好，\n\n' +
    '感謝您訂購鬥陣買肉乾！以下是您的訂單資訊：\n\n' +
    '訂單編號：' + order.order_no + '\n\n' +
    '─── 訂購明細 ───\n' + emailItemsText + '\n' +
    '總金額：NT$ ' + order.order_amount + '（含運費 NT$ ' + order.shipping_fee + '）\n\n' +
    '─── 配送方式 ───\n' + shippingMethodText_(order.shipping_method) + '\n' + deliveryInfo + '\n\n' +
    '─── 付款資訊 ───\n' + paymentInstruction + '\n\n' +
    fulfillmentMessage + '\n\n' +
    '如有任何問題，歡迎加入我們的官方 LINE 聯絡：\nhttps://lin.ee/wvbqdo7\n\n' +
    '謝謝您的支持，期待與您鬥陣買！\n鬥陣買肉乾 敬上';
  var ownerBody = '新訂單：' + order.order_no + '\n客戶：' + order.customer_name +
    '\n電話：' + order.customer_phone + '\nEmail：' + order.customer_email +
    '\n商品：' + itemsText + '\n總額：NT$ ' + order.order_amount +
    '\n付款狀態：' + order.payment_status + '\n出貨狀態：' + order.shipping_status;
  var mailOptions = {name:'鬥陣買肉乾', from:ORDER_FROM_EMAIL, replyTo:ORDER_FROM_EMAIL};
  GmailApp.sendEmail(NOTIFY_EMAIL, '新訂單！' + order.customer_name + ' NT$' + order.order_amount + '－鬥陣買肉乾', ownerBody, mailOptions);
  if (order.customer_email) GmailApp.sendEmail(order.customer_email, '【鬥陣買肉乾】訂單確認 － ' + order.order_no, customerBody, mailOptions);
}
