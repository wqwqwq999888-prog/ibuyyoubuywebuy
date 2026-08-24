const config = window.ADMIN_CONFIG || {};
const isLocal = config.mode !== 'supabase';
const STORAGE_KEY = 'ibuy-admin-data-v1';
const pageMeta = {
  products: { title: '商品管理', action: '新增商品' },
  shipping: { title: '物流管理', action: '' },
  discounts: { title: '折扣管理', action: '新增折扣碼' },
  campaigns: { title: '團購管理', action: '新增團購' }
};

const seedData = {
  products: structuredClone(window.ADMIN_SEED_PRODUCTS || []),
  shipping_methods: [
    { id: '711', name: '7-ELEVEN', fee: 65, free_threshold: 1500, enabled: true, sort_order: 1 },
    { id: 'family', name: '全家', fee: 65, free_threshold: 1500, enabled: true, sort_order: 2 },
    { id: 'kuroneko', name: '黑貓宅配', fee: 130, free_threshold: 3000, enabled: true, sort_order: 3 }
  ],
  discounts: [],
  campaigns: [],
  orders: []
};

const state = { data: structuredClone(seedData), page: 'products', editor: null, token: '' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function localLoad() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(seedData);
  try {
    const loaded={ ...structuredClone(seedData), ...JSON.parse(saved) };
    loaded.orders=loaded.orders||[];
    loaded.campaigns=(loaded.campaigns||[]).map(c=>({...c,commission_rate:Number(c.commission_rate||0),report_token:c.report_token||newId()}));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(loaded));
    return loaded;
  }
  catch { return structuredClone(seedData); }
}

function localSave() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); }

async function api(path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${state.token || config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!response.ok) throw new Error((await response.text()) || '雲端服務發生錯誤');
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function cloudLogin(email, password) {
  const result = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: JSON.stringify({ email, password })
  });
  state.token = result.access_token;
  sessionStorage.setItem('ibuy-admin-token', state.token);
}

async function cloudLoad() {
  let [products, shipping, discounts, campaigns] = await Promise.all([
    api('/rest/v1/products?select=*&order=sort_order.asc,product_no.asc'),
    api('/rest/v1/shipping_methods?select=*&order=sort_order.asc'),
    api('/rest/v1/discounts?select=*&order=created_at.desc'),
    api('/rest/v1/campaigns?select=*&order=created_at.desc')
  ]);
  // 新建立的雲端資料庫沒有商品時，自動放入官網目前的商品。
  // 僅在完全空白時執行，之後不會覆蓋後台所做的修改。
  if (products.length === 0 && seedData.products.length > 0) {
    await api('/rest/v1/products', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(seedData.products)
    });
    products = await api('/rest/v1/products?select=*&order=sort_order.asc,product_no.asc');
  }
  return { products, shipping_methods: shipping, discounts, campaigns };
}

async function saveRecord(table, record, idField = 'id') {
  if (isLocal) {
    const records = state.data[table];
    const index = records.findIndex(item => String(item[idField]) === String(record[idField]));
    if (index >= 0) records[index] = record; else records.push(record);
    localSave();
    return record;
  }
  const existing = state.data[table].some(item => String(item[idField]) === String(record[idField]));
  const path = existing ? `/rest/v1/${table}?${idField}=eq.${encodeURIComponent(record[idField])}` : `/rest/v1/${table}`;
  await api(path, { method: existing ? 'PATCH' : 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(record) });
  return record;
}

async function deleteRecord(table, id, idField = 'id') {
  if (isLocal) {
    state.data[table] = state.data[table].filter(item => String(item[idField]) !== String(id));
    localSave();
    return;
  }
  await api(`/rest/v1/${table}?${idField}=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function uploadImage(file, productNo) {
  if (!file) return '';
  if (isLocal) return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
  });
  const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${productNo}/${Date.now()}.${extension}`;
  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/product-images/${path}`, {
    method: 'POST',
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${state.token}`, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'false' },
    body: file
  });
  if (!response.ok) throw new Error('圖片上傳失敗');
  return `${config.supabaseUrl}/storage/v1/object/public/product-images/${path}`;
}

function showAdmin() {
  $('#loginView').classList.add('hidden'); $('#adminView').classList.remove('hidden');
  $('#modeBadge').textContent = isLocal ? '本地操作模式' : '雲端資料庫';
  $('#logoutButton').classList.toggle('hidden', isLocal);
  $('#localGuide').classList.toggle('hidden', !isLocal || localStorage.getItem('ibuy-admin-guide-seen') === 'yes');
  renderAll();
}

function setPage(page) {
  state.page = page;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  $$('.page').forEach(section => section.classList.toggle('active', section.id === `${page}Page`));
  $('#pageTitle').textContent = pageMeta[page].title;
  $('#primaryAction').textContent = pageMeta[page].action;
  $('#primaryAction').classList.toggle('hidden', !pageMeta[page].action);
}

function money(value) { return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`; }
function dateText(value) { return value ? new Date(value).toLocaleDateString('zh-TW') : '不限'; }
function isCurrentlyActive(item) {
  if (!item.enabled) return false;
  const now = Date.now();
  return (!item.starts_at || new Date(item.starts_at).getTime() <= now) && (!item.ends_at || new Date(item.ends_at).getTime() >= now);
}
function statusBadge(enabled, activeText = '啟用') { return `<span class="badge ${enabled ? 'active' : 'inactive'}">${enabled ? activeText : '停用'}</span>`; }

function renderProducts() {
  const query = $('#productSearch').value.trim().toLowerCase();
  const rows = state.data.products.filter(product => `${product.product_no} ${product.name}`.toLowerCase().includes(query));
  $('#productRows').innerHTML = rows.map(product => `<tr>
    <td><div class="product-cell">${product.image_url ? `<img class="product-thumb" src="${escapeHtml(product.image_url)}" alt="">` : '<span class="product-thumb product-placeholder">尚無圖片</span>'}<div><div class="cell-title">${escapeHtml(product.name)}</div><div class="cell-sub">${escapeHtml(product.description || '')}</div></div></div></td>
    <td>${escapeHtml(product.product_no)}</td><td>${escapeHtml(product.specification || '—')}</td><td>${money(product.price)}</td><td>${statusBadge(product.enabled, '上架')}</td>
    <td><div class="row-actions"><button class="row-button" data-edit="product" data-id="${escapeHtml(product.product_no)}">編輯</button><button class="row-button danger" data-archive="product" data-id="${escapeHtml(product.product_no)}">封存</button></div></td></tr>`).join('');
  $('#productEmpty').classList.toggle('hidden', rows.length > 0);
  $('#productCount').textContent = state.data.products.length;
  $('#activeProductCount').textContent = state.data.products.filter(item => item.enabled).length;
  $('#inactiveProductCount').textContent = state.data.products.filter(item => !item.enabled).length;
}

function renderShipping() {
  $('#shippingCards').innerHTML = state.data.shipping_methods.map(method => `<article class="shipping-card" data-shipping-id="${escapeHtml(method.id)}">
    <header><h3>${escapeHtml(method.name)}</h3><label class="toggle" aria-label="啟用 ${escapeHtml(method.name)}"><input name="enabled" type="checkbox" ${method.enabled ? 'checked' : ''}><span></span></label></header>
    <div class="field-grid"><div class="field"><label>基本運費</label><input name="fee" type="number" min="0" step="1" value="${Number(method.fee)}" required></div><div class="field"><label>免運門檻</label><input name="free_threshold" type="number" min="0" step="1" value="${Number(method.free_threshold)}" required></div></div>
  </article>`).join('');
}

function renderDiscounts() {
  $('#discountRows').innerHTML = state.data.discounts.map(item => `<tr><td><strong>${escapeHtml(item.code)}</strong><div class="cell-sub">${escapeHtml(item.name)}</div></td><td>${item.discount_type === 'percent' ? `${Number(item.discount_value)} 折` : `折 ${money(item.discount_value)}`}</td><td>${money(item.minimum_amount)}</td><td>${dateText(item.starts_at)} ～ ${dateText(item.ends_at)}</td><td>${statusBadge(isCurrentlyActive(item))}</td><td><div class="row-actions"><button class="row-button" data-edit="discount" data-id="${item.id}">編輯</button><button class="row-button danger" data-delete="discount" data-id="${item.id}">刪除</button></div></td></tr>`).join('');
  $('#discountEmpty').classList.toggle('hidden', state.data.discounts.length > 0);
  $('#discountCount').textContent = state.data.discounts.length;
  $('#activeDiscountCount').textContent = state.data.discounts.filter(isCurrentlyActive).length;
}

function campaignLink(item) { return `${location.origin}/partner-report.html?token=${encodeURIComponent(item.report_token)}`; }
function renderCampaigns() {
  $('#campaignRows').innerHTML = state.data.campaigns.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><div class="cell-sub">團主：${escapeHtml(item.partner_name)} · 佣金 ${Number(item.commission_rate || 0)}%</div></td><td>${escapeHtml(item.discount_code)}</td><td>${dateText(item.starts_at)} ～ ${dateText(item.ends_at)}</td><td><button class="row-button" data-copy="${escapeHtml(campaignLink(item))}">複製報表連結</button></td><td>${statusBadge(isCurrentlyActive(item), '進行中')}</td><td><div class="row-actions"><button class="row-button" data-edit="campaign" data-id="${item.id}">編輯</button><button class="row-button danger" data-delete="campaign" data-id="${item.id}">刪除</button></div></td></tr>`).join('');
  $('#campaignEmpty').classList.toggle('hidden', state.data.campaigns.length > 0);
  $('#campaignCount').textContent = state.data.campaigns.length;
  $('#activeCampaignCount').textContent = state.data.campaigns.filter(isCurrentlyActive).length;
}

function renderAll() { renderProducts(); renderShipping(); renderDiscounts(); renderCampaigns(); setPage(state.page); }
function input(name, label, value = '', options = {}) {
  const wide = options.wide ? 'wide' : '';
  if (options.type === 'textarea') return `<div class="${wide}"><label for="field-${name}">${label}</label><textarea id="field-${name}" name="${name}" ${options.required ? 'required' : ''}>${escapeHtml(value)}</textarea></div>`;
  if (options.type === 'select') return `<div class="${wide}"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}">${options.choices.map(([key,text]) => `<option value="${key}" ${String(value) === key ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
  return `<div class="${wide}"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${options.type || 'text'}" value="${escapeHtml(value)}" ${options.min !== undefined ? `min="${options.min}"` : ''} ${options.step ? `step="${options.step}"` : ''} ${options.required ? 'required' : ''}></div>`;
}

function openProduct(product = {}) {
  state.editor = { type: 'product', originalId: product.product_no || '' }; $('#modalTitle').textContent = product.product_no ? '編輯商品' : '新增商品';
  $('#editorFields').innerHTML = `
    ${input('product_no','固定商品編號（純數字）',product.product_no)}
    ${input('name','商品名稱',product.name)}
    ${input('price','售價',product.price || 0,{type:'number',min:0,required:true})}
    ${input('cost','成本（選填）',product.cost || 0,{type:'number',min:0,step:'0.01'})}
    ${input('specification','規格',product.specification || '200 克／包',{wide:true,required:true})}
    ${input('description','商品說明、成分、食品添加物、過敏原',product.description || '',{type:'textarea',wide:true})}
    <div class="wide image-editor"><img id="imagePreview" class="image-preview" src="${escapeHtml(product.image_url || '')}" alt="商品圖片預覽"><div><label for="productImage">商品圖片（每個商品一張）</label><input id="productImage" name="productImage" type="file" accept="image/jpeg,image/png,image/webp"><input name="image_url" type="hidden" value="${escapeHtml(product.image_url || '')}"><p class="image-help">建議使用正方形 JPG、PNG 或 WebP。正式雲端模式會自動上傳並保存圖片網址。</p></div></div>
    ${input('sort_order','顯示順序',product.sort_order ?? 0,{type:'number',min:0})}
    ${input('enabled','商品狀態',String(product.enabled ?? true),{type:'select',choices:[['true','上架'],['false','下架']]})}`;
  $('#field-product_no').required = true; $('#field-product_no').pattern = '[0-9]+'; $('#field-name').required = true;
  $('#productImage').addEventListener('change', event => { const file = event.target.files[0]; if (file) $('#imagePreview').src = URL.createObjectURL(file); });
  showModal();
}

function openDiscount(item = {}) {
  state.editor = { type: 'discount', originalId: item.id || '' }; $('#modalTitle').textContent = item.id ? '編輯折扣碼' : '新增折扣碼';
  $('#editorFields').innerHTML = `${input('name','折扣名稱',item.name || '',{required:true})}${input('code','折扣碼',item.code || '',{required:true})}${input('discount_type','折扣方式',item.discount_type || 'fixed',{type:'select',choices:[['fixed','固定金額'],['percent','百分比（輸入 9 代表 9 折）']]})}${input('discount_value','折扣值',item.discount_value || 0,{type:'number',min:0,step:'0.01',required:true})}${input('minimum_amount','最低消費',item.minimum_amount || 0,{type:'number',min:0,required:true})}${input('usage_limit','總使用上限（0 代表不限）',item.usage_limit || 0,{type:'number',min:0})}${input('starts_at','開始時間',toLocalInput(item.starts_at),{type:'datetime-local'})}${input('ends_at','結束時間',toLocalInput(item.ends_at),{type:'datetime-local'})}${input('enabled','狀態',String(item.enabled ?? true),{type:'select',choices:[['true','啟用'],['false','停用']]})}`;
  showModal();
}

function openCampaign(item = {}) {
  state.editor = { type: 'campaign', originalId: item.id || '' }; $('#modalTitle').textContent = item.id ? '編輯團購活動' : '新增團購活動';
  const discountChoices = [['','請選擇專屬折扣碼'],...state.data.discounts.map(d => [d.code,d.code])];
  $('#editorFields').innerHTML = `${input('name','活動名稱',item.name || '',{required:true})}${input('partner_name','團主名稱',item.partner_name || '',{required:true})}${input('discount_code','專屬折扣碼',item.discount_code || '',{type:'select',choices:discountChoices})}${input('commission_rate','佣金比例（%）',item.commission_rate || 0,{type:'number',min:0,step:'0.01',required:true})}${input('starts_at','開始時間',toLocalInput(item.starts_at),{type:'datetime-local',required:true})}${input('ends_at','結束時間',toLocalInput(item.ends_at),{type:'datetime-local',required:true})}${input('enabled','狀態',String(item.enabled ?? true),{type:'select',choices:[['true','啟用'],['false','停用']]})}`;
  showModal();
}

function toLocalInput(value) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function showModal() { $('#modalBackdrop').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modalBackdrop').classList.add('hidden'); document.body.style.overflow = ''; state.editor = null; }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.add('hidden'), 2600); }
function setSaving(saving) { $('#saveStatus').textContent = saving ? '儲存中…' : '資料已同步'; }
function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }

async function submitEditor(event) {
  event.preventDefault(); setSaving(true);
  try {
    const data = Object.fromEntries(new FormData(event.target));
    if (state.editor.type === 'product') {
      if (!/^\d+$/.test(data.product_no)) throw new Error('商品編號只能使用數字');
      const duplicate = state.data.products.some(p => p.product_no === data.product_no && p.product_no !== state.editor.originalId);
      if (duplicate) throw new Error('商品編號已經存在');
      const file = $('#productImage').files[0];
      const record = { product_no:data.product_no,name:data.name.trim(),price:Number(data.price),cost:Number(data.cost || 0),specification:data.specification.trim(),description:data.description.trim(),image_url:file ? await uploadImage(file,data.product_no) : data.image_url,sort_order:Number(data.sort_order || 0),enabled:data.enabled==='true' };
      if (state.editor.originalId && state.editor.originalId !== record.product_no) await deleteRecord('products', state.editor.originalId, 'product_no');
      await saveRecord('products', record, 'product_no');
    } else if (state.editor.type === 'discount') {
      const value = Number(data.discount_value); if (data.discount_type === 'percent' && (value <= 0 || value > 10)) throw new Error('百分比請輸入大於 0 且不超過 10 的折數');
      const record = { id:state.editor.originalId || newId(),name:data.name.trim(),code:data.code.trim().toUpperCase(),discount_type:data.discount_type,discount_value:value,minimum_amount:Number(data.minimum_amount || 0),usage_limit:Number(data.usage_limit || 0),starts_at:data.starts_at ? new Date(data.starts_at).toISOString() : null,ends_at:data.ends_at ? new Date(data.ends_at).toISOString() : null,enabled:data.enabled==='true' };
      await saveRecord('discounts', record);
    } else {
      if (!data.discount_code) throw new Error('請選擇團購主專屬折扣碼');
      const record = { id:state.editor.originalId || newId(),name:data.name.trim(),partner_name:data.partner_name.trim(),discount_code:data.discount_code,commission_rate:Number(data.commission_rate || 0),report_token:(state.data.campaigns.find(c=>c.id===state.editor.originalId)||{}).report_token || newId(),starts_at:new Date(data.starts_at).toISOString(),ends_at:new Date(data.ends_at).toISOString(),enabled:data.enabled==='true' };
      if (new Date(record.ends_at) <= new Date(record.starts_at)) throw new Error('結束時間必須晚於開始時間');
      await saveRecord('campaigns', record);
    }
    state.data = isLocal ? localLoad() : await cloudLoad(); renderAll(); closeModal(); toast('儲存完成');
  } catch (error) { toast(error.message); }
  finally { setSaving(false); }
}

async function saveShipping(event) {
  event.preventDefault(); setSaving(true);
  try {
    for (const card of $$('.shipping-card')) {
      const existing = state.data.shipping_methods.find(item => item.id === card.dataset.shippingId);
      const record = { ...existing, enabled:card.querySelector('[name=enabled]').checked,fee:Number(card.querySelector('[name=fee]').value),free_threshold:Number(card.querySelector('[name=free_threshold]').value) };
      await saveRecord('shipping_methods', record);
    }
    state.data = isLocal ? localLoad() : await cloudLoad(); renderAll(); toast('物流設定已儲存');
  } catch (error) { toast(error.message); }
  finally { setSaving(false); }
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-page]'); if (nav) return setPage(nav.dataset.page);
  const edit = event.target.closest('[data-edit]');
  if (edit) { const map={product:['products','product_no'],discount:['discounts','id'],campaign:['campaigns','id']}; const [table,key]=map[edit.dataset.edit]; const item=state.data[table].find(row=>String(row[key])===edit.dataset.id); return edit.dataset.edit==='product'?openProduct(item):edit.dataset.edit==='discount'?openDiscount(item):openCampaign(item); }
  const archive = event.target.closest('[data-archive]'); if (archive) { const item=state.data.products.find(row=>row.product_no===archive.dataset.id); if(item && confirm(`確定要封存「${item.name}」嗎？`)){await saveRecord('products',{...item,enabled:false},'product_no');state.data=isLocal?localLoad():await cloudLoad();renderAll();toast('商品已封存');} return; }
  const remove = event.target.closest('[data-delete]'); if(remove && confirm('確定要刪除這筆資料嗎？')){const table=remove.dataset.delete==='discount'?'discounts':'campaigns';await deleteRecord(table,remove.dataset.id);state.data=isLocal?localLoad():await cloudLoad();renderAll();toast('資料已刪除');return;}
  const copy = event.target.closest('[data-copy]'); if(copy){try{await navigator.clipboard.writeText(copy.dataset.copy);toast('專屬連結已複製');}catch{window.prompt('請複製這個專屬連結：',copy.dataset.copy);} }
});

$('#primaryAction').addEventListener('click', () => state.page==='products'?openProduct():state.page==='discounts'?openDiscount():openCampaign());
$('#closeModal').addEventListener('click', closeModal); $('#cancelModal').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', event => { if(event.target===event.currentTarget) closeModal(); });
$('#editorForm').addEventListener('submit', submitEditor); $('#shippingForm').addEventListener('submit', saveShipping);
$('#productSearch').addEventListener('input', renderProducts);
$('#dismissGuide').addEventListener('click', () => { localStorage.setItem('ibuy-admin-guide-seen','yes'); $('#localGuide').classList.add('hidden'); });
$('#logoutButton').addEventListener('click', () => { sessionStorage.removeItem('ibuy-admin-token'); location.reload(); });
$('#loginForm').addEventListener('submit', async event => { event.preventDefault(); $('#loginError').textContent=''; try{await cloudLogin($('#loginEmail').value,$('#loginPassword').value);state.data=await cloudLoad();showAdmin();}catch(error){$('#loginError').textContent='登入失敗，請確認帳號與密碼。';} });

async function init() {
  if (isLocal) { state.data=localLoad(); showAdmin(); return; }
  if (!config.supabaseUrl || !config.supabaseAnonKey) { $('#loginView').classList.remove('hidden'); $('#loginError').textContent='尚未設定雲端後台連線。'; return; }
  state.token=sessionStorage.getItem('ibuy-admin-token')||'';
  if(state.token){try{state.data=await cloudLoad();showAdmin();return;}catch{sessionStorage.removeItem('ibuy-admin-token');}}
  $('#loginView').classList.remove('hidden');
}
init();
