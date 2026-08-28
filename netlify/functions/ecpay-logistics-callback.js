const { supabase } = require('./_orders');
const { checkMacValue } = require('./_ecpay');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const params = Object.fromEntries(new URLSearchParams(event.body || ''));
  const received = String(params.CheckMacValue || '').toUpperCase();
  if (!received || checkMacValue(params, 'md5') !== received) return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '0|Error' };
  try {
    const logisticsTradeNo = params.AllPayLogisticsID || params.LogisticsID;
    if (logisticsTradeNo) await supabase(`orders?logistics_trade_no=eq.${encodeURIComponent(logisticsTradeNo)}`, { method: 'PATCH', body: JSON.stringify({ logistics_status: String(params.RtnCode || ''), logistics_message: String(params.RtnMsg || '') }) });
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: '1|OK' };
  } catch (error) { console.error('物流 callback 更新失敗:', error); return { statusCode: 200, body: '0|Error' }; }
};
