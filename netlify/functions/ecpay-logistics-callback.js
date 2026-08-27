const { supabase } = require('./_orders');
const { checkMacValue, logisticsCredentials } = require('./_ecpay-logistics');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const params = Object.fromEntries(new URLSearchParams(event.body || ''));
  const credentials = logisticsCredentials();
  if (!params.CheckMacValue || checkMacValue(params, credentials.hashKey, credentials.hashIv) !== params.CheckMacValue.toUpperCase()) {
    return { statusCode: 200, body: '0|CheckMacValueError' };
  }
  try {
    const logisticsTradeNo = params.AllPayLogisticsID || '';
    const orderNo = params.MerchantTradeNo || '';
    const filter = logisticsTradeNo
      ? `logistics_trade_no=eq.${encodeURIComponent(logisticsTradeNo)}`
      : `order_no=eq.${encodeURIComponent(orderNo)}`;
    await supabase(`orders?${filter}`, {
      method: 'PATCH',
      body: JSON.stringify({ logistics_status: String(params.RtnCode || ''), logistics_message: String(params.RtnMsg || '') })
    });
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '1|OK' };
  } catch (error) {
    console.error('更新物流狀態失敗:', error);
    return { statusCode: 200, body: '0|UpdateError' };
  }
};
