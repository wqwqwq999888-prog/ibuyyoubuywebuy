// 將這個 helper 加入現有 Apps Script 後，writeOrderAndNotify 可用
// sheet.appendRow(buildOrderRow(data, itemsText, shippingText, deliveryInfo, paymentStatus, tradeNo));
// 依目前試算表 24 欄順序輸出；舊訂單不需回填。
function buildOrderRow(data, itemsText, shippingText, deliveryInfo, paymentStatus, tradeNo) {
  var productAmount = Number(data.productAmount != null ? data.productAmount : data.subtotal || 0);
  var discountAmount = Number(data.discountAmount || 0);
  var shippingFee = Number(data.shippingFee || 0);
  var orderAmount = Number(data.total || Math.max(0, productAmount - discountAmount) + shippingFee);
  var productCost = (data.items || []).reduce(function(sum, item) {
    return sum + Number(item.cost || 0) * Number(item.qty || 0);
  }, 0);
  var grossProfit = orderAmount - shippingFee - productCost;

  return [
    new Date().toLocaleString('zh-TW', {timeZone:'Asia/Taipei'}), data.orderId,
    data.customer.name, data.customer.phone, data.customer.email, itemsText,
    'NT$ ' + orderAmount, shippingText, deliveryInfo, data.transfer5 || '',
    data.transferTime || '', data.note || '', paymentStatus, '待出貨', tradeNo || '',
    '', '', productCost, productAmount, discountAmount, shippingFee,
    data.discountCode || '', data.partnerName || '', grossProfit
  ];
}

// Netlify 使用 Script Properties 的 WEBHOOK_SECRET 呼叫；請勿將 secret 寫進程式碼。
// 試算表第一列須使用 buildOrderRow 相同的 24 欄順序，訂單編號位於第 2 欄。
function doPost(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var supplied = e && e.parameter && e.parameter.secret;
  // Apps Script Web App 無法讀取自訂 request header；正式 URL 請以 ?secret=... 設定環境變數。
  if (!expected || supplied !== expected) return ContentService.createTextOutput('Unauthorized');
  var request = JSON.parse(e.postData.contents || '{}');
  var order = request.order || {};
  var sheet = SpreadsheetApp.getActive().getSheetByName('訂單');
  if (!sheet || !order.order_no) return ContentService.createTextOutput('Bad Request');
  var values = sheet.getDataRange().getValues();
  var rowIndex = values.findIndex(function(row, index) { return index > 0 && String(row[1]) === String(order.order_no); });
  var itemsText = (order.items || []).map(function(item) { return item.name + ' × ' + item.qty; }).join('、');
  var row = [order.created_at,order.order_no,order.customer_name,order.customer_phone,order.customer_email,itemsText,
    'NT$ '+order.order_amount,order.shipping_method,JSON.stringify(order.shipping_details||{}),order.transfer_last_five,
    order.transfer_time||'',order.note,order.payment_status,order.shipping_status,order.trade_no,order.shipped_at||'',
    order.completed_at||'',order.product_cost,order.product_amount,order.discount_amount,order.shipping_fee,
    order.discount_code||'',order.partner_name||'',order.gross_profit];
  if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, 24).setValues([row]); else sheet.appendRow(row);
  return ContentService.createTextOutput('OK');
}
