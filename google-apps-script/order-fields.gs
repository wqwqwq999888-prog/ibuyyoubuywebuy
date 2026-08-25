// 加入既有「鬥陣買訂單系統」的 order-sync.gs。
// 此檔不宣告 doPost；既有 doPost 必須先將 Netlify webhook 導向 handleOrderWebhook。
// Supabase 是唯一主資料庫；新版 webhook 只寫 Sheet。下方回寫函式僅供舊正式網站過渡期相容。

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

function handleOrderWebhook(e, request) {
  var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var supplied = e && e.parameter && e.parameter.secret;
  if (!expected || supplied !== expected) return ContentService.createTextOutput('Unauthorized');

  var order = request.order;
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheets().find(function(candidate) {
    return typeof SHEET_GID !== 'undefined' && candidate.getSheetId() === Number(SHEET_GID);
  }) || spreadsheet.getSheetByName('訂單');
  if (!sheet) return ContentService.createTextOutput('Order sheet not found');

  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function(row, index) {
    return index > 0 && String(row[1]) === String(order.order_no);
  });
  var itemsText = (order.items || []).map(function(item) {
    return item.name + ' × ' + item.qty;
  }).join('、');
  var row = [
    order.created_at, order.order_no, order.customer_name, order.customer_phone,
    order.customer_email, itemsText, 'NT$ ' + order.order_amount, order.shipping_method,
    JSON.stringify(order.shipping_details || {}), order.transfer_last_five,
    order.transfer_time || '', order.note, order.payment_status, order.shipping_status,
    order.trade_no, order.shipped_at || '', order.completed_at || '', order.product_cost,
    order.product_amount, order.discount_amount, order.shipping_fee, order.discount_code || '',
    order.partner_name || '', order.gross_profit
  ];
  if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, 24).setValues([row]);
  else sheet.appendRow(row);
  return ContentService.createTextOutput('OK');
}
