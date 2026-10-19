const { checkMacValue } = require('./_ecpay');
async function queryPayment(orderNo, { allowUnpaid = false } = {}) {
  if (!process.env.ECPAY_HASH_KEY || !process.env.ECPAY_HASH_IV) throw new Error('綠界查帳設定不完整');
  const params = { MerchantID: process.env.ECPAY_MERCHANT_ID || '3504484', MerchantTradeNo: orderNo, TimeStamp: String(Math.floor(Date.now() / 1000)) };
  params.CheckMacValue = checkMacValue(params);
  const response = await fetch('https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw Object.assign(new Error(`綠界查帳失敗 (${response.status})，請稍後重試`), { rateLimited: response.status === 403 });
  const payment = Object.fromEntries(new URLSearchParams(await response.text()));
  if (!payment.CheckMacValue || checkMacValue(payment) !== payment.CheckMacValue) throw new Error('綠界查帳回應驗證失敗');
  if (payment.MerchantID !== params.MerchantID || payment.MerchantTradeNo !== orderNo) throw new Error('綠界查帳訂單不一致');
  if (payment.SimulatePaid === '1') throw new Error('模擬付款不能建立正式訂單');
  if (payment.TradeStatus !== '1' && allowUnpaid) return payment;
  if (payment.TradeStatus !== '1') throw new Error('綠界尚未確認此筆付款成功，未變更訂單');
  if (!payment.TradeNo || !/^\d+$/.test(payment.TradeAmt || '') || Number(payment.TradeAmt) <= 0) throw new Error('綠界付款資料不完整');
  return payment;
}


module.exports = { queryPayment };
