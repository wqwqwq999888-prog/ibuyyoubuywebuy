const { supabase } = require('./_orders');
const { checkMacValue } = require('./_ecpay');
const { completePayment, assertSamePayment } = require('./_payment-order');
const reply = body => ({ statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body });
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.ECPAY_HASH_KEY || !process.env.ECPAY_HASH_IV) return reply('0|ConfigurationError');
  const body = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body;
  const params = Object.fromEntries(new URLSearchParams(body));
  if (!params.CheckMacValue || checkMacValue(params) !== params.CheckMacValue) return reply('0|MacError');
  if (params.MerchantID !== (process.env.ECPAY_MERCHANT_ID || '3504484')) return reply('0|MerchantError');
  if (params.SimulatePaid === '1' || params.RtnCode !== '1') return reply('1|OK');
  if (!/^[a-zA-Z0-9]{1,20}$/.test(params.MerchantTradeNo || '') || !params.TradeNo) return reply('0|OrderError');
  try {
    const pending = await supabase(`pending_ecpay_orders?order_no=eq.${encodeURIComponent(params.MerchantTradeNo)}&select=*`);
    if (!pending.length) {
      const existing = await supabase(`orders?order_no=eq.${encodeURIComponent(params.MerchantTradeNo)}&select=*`);
      assertSamePayment(existing[0], params);
      return reply('1|OK');
    }
    // Once a missing payment has been flagged for review, only admin approval
    // may recover it, even if a late callback subsequently arrives.
    if (pending[0].review_required || pending[0].check_status === 'paid_missing') return reply('1|OK');
    await completePayment(pending[0], params, 'ecpay_callback');
    return reply('1|OK');
  } catch (error) {
    console.error('Payment callback incomplete', params.MerchantTradeNo, error.message);
    return reply('0|OrderError');
  }
};
