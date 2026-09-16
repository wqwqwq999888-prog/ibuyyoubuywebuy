const assert = require('node:assert/strict');
const { monthKey, orderFinance } = require('../admin/order-finance.js');

const campaigns = [
  { id: 'group-one', partner_name: '團主甲', discount_code: 'GROUP10', commission_rate: 10 },
  { id: 'group-two', partner_name: '團主乙', discount_code: null, commission_rate: 15 }
];

const order = {
  shipping_details: { campaign_id: 'group-two' }, product_amount: 1000, discount_amount: 100,
  order_amount: 960, shipping_fee: 60, product_cost: 400, gross_profit: 500
};
assert.deepEqual(orderFinance(order, campaigns), { grossProfit: 500, commission: 135, profitAfterCommission: 365 });
assert.equal(orderFinance({ ...order, shipping_details: {}, discount_code: 'GROUP10' }, campaigns).commission, 90, '舊訂單可透過專屬折扣碼歸戶');
assert.equal(orderFinance({ ...order, shipping_details: { campaign_id: 'missing' }, discount_code: 'GROUP10' }, campaigns).commission, 0, '有團購 ID 的訂單不可誤歸其他活動');
assert.equal(orderFinance({ ...order, shipping_details: {}, discount_code: null }, campaigns).commission, 0, '一般訂單沒有團主分潤');
assert.equal(monthKey('2026-08-31T16:30:00.000Z'), '2026-09', '跨日訂單應依台灣時間分月');
assert.equal(monthKey('2026-09-30T15:30:00.000Z'), '2026-09');
assert.equal(monthKey('2026-09-30T16:30:00.000Z'), '2026-10');
console.log('Admin order finance checks passed.');
