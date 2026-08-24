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
