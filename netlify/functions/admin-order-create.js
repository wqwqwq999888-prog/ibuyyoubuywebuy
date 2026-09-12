const { supabase, syncSheet, requireAdmin } = require('./_orders');

const paymentStatuses = ['待付款', '已付款', '已匯款待確認'];
const shippingStatuses = ['待出貨', '已完成'];
const paymentMethods = ['cash', 'bank'];
const contactTypes = ['line', 'facebook', 'instagram', 'phone'];
const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function manualOrderNo() {
  const date = new Date();
  const stamp = date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `MAN-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    await requireAdmin(event);
    const data = JSON.parse(event.body || '{}');
    const customer = data.customer || {};
    const contact = data.contact || {};
    if (!String(customer.name || '').trim()) throw new Error('請填寫客戶姓名');
    if (!contactTypes.includes(contact.type) || !String(contact.value || '').trim()) throw new Error('請選擇聯繫管道並填寫帳號或電話');
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('請至少選擇一項商品');
    if (!paymentMethods.includes(data.paymentMethod) || !paymentStatuses.includes(data.paymentStatus) || !shippingStatuses.includes(data.shippingStatus)) throw new Error('付款或交付狀態不正確');

    const requested = new Map();
    for (const item of data.items) {
      const productNo = String(item.productNo || '');
      const qty = Number(item.qty);
      if (!/^\d+$/.test(productNo) || !Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error('商品或數量不正確');
      requested.set(productNo, (requested.get(productNo) || 0) + qty);
    }
    const productNos = [...requested.keys()];
    const products = await supabase(`products?product_no=in.(${productNos.map(encodeURIComponent).join(',')})&select=product_no,name,price,cost`);
    if (products.length !== productNos.length) throw new Error('包含不存在的商品，請重新選擇');
    const byNo = Object.fromEntries(products.map(product => [String(product.product_no), product]));
    const items = productNos.map(productNo => ({ productNo, name: String(byNo[productNo].name), price: Number(byNo[productNo].price), qty: requested.get(productNo) }));
    const productAmount = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const discountAmount = Number(data.discountAmount || 0);
    if (!Number.isInteger(discountAmount) || discountAmount < 0 || discountAmount > productAmount) throw new Error('折扣金額不可小於 0 或超過商品小計');
    const shipping = data.shipping || {};
    const shippingMethod = String(shipping.method || '');
    const shippingDetails = { ...(shipping.details || {}), contact_type: contact.type, contact_value: String(contact.value).trim() };
    let shippingFee = 0;
    if (shippingMethod !== 'meetup') {
      const methods = await supabase(`shipping_methods?id=eq.${encodeURIComponent(shippingMethod)}&enabled=eq.true&select=id,fee,free_threshold`);
      const method = methods[0];
      if (!method) throw new Error('此物流方式目前未啟用');
      if (!String(customer.phone || '').trim()) throw new Error('寄送訂單必須填寫收件人手機');
      if (['711', 'family'].includes(shippingMethod)) {
        const prefix = shippingMethod === '711' ? 'store711' : 'storefamily';
        if (!String(shippingDetails[`${prefix}Id`] || '').trim() || !String(shippingDetails[prefix] || '').trim()) throw new Error('請填寫門市代號與門市名稱');
      } else if (shippingMethod === 'kuroneko') {
        if (!String(shippingDetails.zipcode || '').trim() || !String(shippingDetails.city || '').trim() || !String(shippingDetails.address || '').trim()) throw new Error('請填寫完整宅配地址');
      } else throw new Error('不支援的物流方式');
      if (productAmount - discountAmount < Number(method.free_threshold)) shippingFee = Number(method.fee);
    }
    const order = {
      order_no: manualOrderNo(), customer_name: String(customer.name).trim(), customer_phone: String(customer.phone).trim(),
      customer_email: String(customer.email || '').trim(), email_marketing_consent: false, items,
      product_amount: productAmount, discount_amount: discountAmount, shipping_fee: shippingFee, order_amount: productAmount - discountAmount + shippingFee,
      shipping_method: shippingMethod, shipping_details: shippingDetails, transfer_last_five: '', transfer_time: null,
      note: String(data.note || '').trim(), payment_method: data.paymentMethod, payment_status: data.paymentStatus,
      shipping_status: data.shippingStatus, trade_no: '', discount_code: null, partner_name: null,
      product_cost: items.reduce((sum, item) => sum + Number(byNo[item.productNo].cost || 0) * item.qty, 0)
    };
    const saved = (await supabase('orders', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(order) }))[0];
    let sheetSynced = true;
    try { await syncSheet(saved, 'manualOrder'); }
    catch (error) { sheetSynced = false; console.error('Manual order saved, but Google Sheet sync failed', error); }
    return json(201, { order: saved, sheetSynced });
  } catch (error) {
    console.error(error);
    return json(error.statusCode || 400, { error: error.message });
  }
};
