const assert = require('node:assert/strict');
const { logisticsParams, checkMacValue } = require('../netlify/functions/ecpay-logistics-create');

const baseOrder = {
  order_no: 'DZM1787770123456',
  order_amount: 650,
  customer_name: '測試收件人',
  customer_phone: '0912345678',
  customer_email: 'buyer@example.com',
  items: [{ name: '全家大小都會愛', qty: 1 }],
  note: '請勿出貨',
  shipping_details: {
    store711Id: '123456',
    storefamilyId: '987654'
  }
};

const env = {
  ECPAY_MERCHANT_ID: '3504484',
  ECPAY_LOGISTICS_SENDER_NAME: '鬥陣買',
  ECPAY_LOGISTICS_SENDER_PHONE: '0911111111',
  URL: 'https://douzhenmai.com'
};

const family = logisticsParams({ ...baseOrder, shipping_method: 'family' }, env);
assert.equal(family.LogisticsSubType, 'FAMIC2C');
assert.equal(family.ReceiverStoreID, '987654');
assert.equal(family.ReceiverName, '測試收件人');
assert.equal(family.ReceiverCellPhone, '0912345678');
assert.equal(family.ReceiverEmail, 'buyer@example.com');
assert.equal(family.IsCollection, 'N');
assert.equal(family.GoodsAmount, '650');
assert.match(family.MerchantTradeDate, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
assert.equal(family.ServerReplyURL, 'https://douzhenmai.com/.netlify/functions/ecpay-logistics-callback');

const sevenEleven = logisticsParams({ ...baseOrder, shipping_method: '711' }, env);
assert.equal(sevenEleven.LogisticsSubType, 'UNIMARTC2C');
assert.equal(sevenEleven.ReceiverStoreID, '123456');

assert.throws(
  () => logisticsParams({ ...baseOrder, shipping_method: 'kuroneko' }, env),
  /只支援 7-ELEVEN 與全家/
);
assert.throws(
  () => logisticsParams({ ...baseOrder, shipping_method: 'family' }, { ...env, ECPAY_LOGISTICS_SENDER_NAME: '' }),
  /寄件人姓名或手機/
);

const mac = checkMacValue(family, 'test-key', 'test-iv');
assert.match(mac, /^[A-F0-9]{32}$/);

console.log('ECPay logistics checks passed.');
