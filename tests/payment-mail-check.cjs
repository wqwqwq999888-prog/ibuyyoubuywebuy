const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let mails = [], failCustomer = false, locked = false;
const rows = [['時間','訂單編號']], journalRows = [];
const makeSheet = values => ({
 getDataRange: () => ({getValues: () => values}),
 appendRow: row => values.push(row), hideSheet() {},
 getSheetId: () => 1, getLastColumn: () => 24,
 getRange: (r,c,n,m) => ({getDisplayValues:()=>[values[0]], setValues:data=>{values[r-1]=data[0];}})
});
const orderSheet = makeSheet(rows), journal = makeSheet(journalRows);
const spreadsheet = {getSheets:()=>[orderSheet],getSheetByName:name=>name==='_通知紀錄'?journal:orderSheet};
const context = {console, Date, NOTIFY_EMAIL:'owner@example.com',
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'secret'})},
 LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
 ContentService:{createTextOutput:s=>s},SpreadsheetApp:{openById:()=>spreadsheet,flush(){}},
 Utilities:{formatDate:()=> '2026/10/19'},
 GmailApp:{sendEmail(to,subject,body){assert.equal(locked,true);if(failCustomer&&to==='customer@example.com')throw new Error('mail failed');mails.push({to,subject,body});}}
};
vm.createContext(context);vm.runInContext(fs.readFileSync('google-apps-script/order-fields.gs','utf8'),context);
const order = {order_no:'D123',created_at:'2026-10-19',customer_name:'Test',customer_email:'customer@example.com',items:[{name:'商品',qty:1}],order_amount:100,shipping_fee:0,payment_method:'credit'};
const send = (action, data=order) => context.handleOrderWebhook({parameter:{secret:'secret'}},{action,order:data});
assert.equal(context.handleOrderWebhook({parameter:{secret:'wrong'}},{action:'upsertOrder',order}),'Unauthorized');assert.equal(mails.length,0);
failCustomer=true;assert.throws(()=>send('upsertOrder'));assert.equal(locked,false);assert.equal(rows.length,2);assert.equal(mails.length,1);
failCustomer=false;assert.equal(send('upsertOrder'),'OK');assert.equal(rows.length,2);assert.equal(mails.length,2);
assert.equal(send('upsertOrder'),'OK');assert.equal(mails.length,2);
send('updateStatus');assert.equal(mails.length,2);
const alert={order_no:'D456',order_amount:659,alert_status:'paid_missing',alert_key:'D456:paid_missing'};
assert.equal(send('paymentAlert',alert),'OK');assert.equal(rows.length,2);assert.equal(mails.length,3);assert.equal(mails[2].to,'owner@example.com');
assert.equal(send('paymentAlert',alert),'OK');assert.equal(mails.length,3);
console.log('Payment alert isolation and per-recipient notification retry checks passed.');
