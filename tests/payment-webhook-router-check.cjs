const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let legacy=0, modern=0, fail=false;
const ctx={console:{error(){}},ContentService:{createTextOutput:s=>s},
 isOrderWebhookRequest:r=>!!r.action,
 handleOrder:()=>{legacy++;return 'legacy';},
 handleOrderWebhook:()=>{modern++;if(fail)throw new Error('mail failed');return 'OK';}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('google-apps-script/webhook-router.gs','utf8'),ctx);
const event={postData:{contents:JSON.stringify({action:'upsertOrder',order:{order_no:'TEST'}})}};
assert.equal(ctx.doPost(event),'OK');fail=true;
assert.match(ctx.doPost(event),/^ERROR/);assert.equal(legacy,0);assert.equal(modern,2);
assert.equal(ctx.doPost({postData:{contents:'{}'}}),'legacy');assert.equal(legacy,1);
console.log('Webhook errors never fall through to legacy order creation.');
