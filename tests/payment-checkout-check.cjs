const assert = require('node:assert/strict');
process.env.ECPAY_HASH_KEY='test';process.env.ECPAY_HASH_IV='test';
require('../netlify/functions/_orders');
let pending, path;
require.cache[require.resolve('../netlify/functions/_orders')].exports={
 campaignIdFromCookie:()=> 'campaign', normalizeOrder:o=>({order_no:o.orderId,order_amount:100,items:o.items,product_amount:100,discount_amount:0,shipping_fee:0}),
 validateProductPricing:async o=>o,
 supabase:async(p,o)=>{path=p;pending=JSON.parse(o.body);}
};
const {handler}=require('../netlify/functions/ecpay-checkout');
const {checkMacValue}=require('../netlify/functions/_ecpay');
const request={params:{MerchantID:'attacker',MerchantTradeNo:'D123',TotalAmount:'100',ReturnURL:'https://wrong.example/callback'},order:{orderId:'D123',customer:{name:'Test'},items:[{price:100,qty:1}]}};
(async()=>{
 process.env.CONTEXT='production';
 const result=JSON.parse((await handler({httpMethod:'POST',body:JSON.stringify(request)})).body);
 assert.equal(result.params.ReturnURL,'https://douzhenmai.com/.netlify/functions/ecpay-return');
 assert.equal(result.params.MerchantID,'3504484');assert.equal(result.CheckMacValue,checkMacValue(result.params));
 assert.equal(pending.expected_amount,100);assert.equal(path,'pending_ecpay_orders');
 assert.equal((await handler({httpMethod:'POST',body:JSON.stringify(request.params)})).statusCode,400);
 process.env.CONTEXT='deploy-preview';process.env.DEPLOY_PRIME_URL='https://preview.netlify.app';
 const preview=JSON.parse((await handler({httpMethod:'POST',body:JSON.stringify(request)})).body);
 assert.equal(preview.params.ReturnURL,'https://preview.netlify.app/.netlify/functions/ecpay-return');
 console.log('Server-owned callback URL, signed parameters and required pending snapshot checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
