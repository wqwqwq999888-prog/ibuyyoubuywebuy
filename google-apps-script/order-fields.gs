// 加入既有「鬥陣買訂單系統」的 order-sync.gs。
// 此檔不宣告 doPost；既有 doPost 必須先將 Netlify webhook 導向 handleOrderWebhook。
// Supabase 是唯一主資料庫，本檔絕不把 service/secret key 傳成 Bearer，也不回寫 Supabase。

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
