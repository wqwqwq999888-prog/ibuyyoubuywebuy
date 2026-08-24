(function () {
  const config = window.ADMIN_CONFIG || {};
  const storageKey = 'ibuy-admin-data-v1';

  async function cloudTable(table, order = '') {
    const suffix = order ? `&order=${order}` : '';
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?select=*${suffix}`, {
      headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` }
    });
    if (!response.ok) throw new Error(`無法讀取 ${table}`);
    return response.json();
  }

  async function load() {
    if (config.mode === 'supabase' && config.supabaseUrl && config.supabaseAnonKey) {
      try {
        const [products, shipping_methods, discounts, campaigns] = await Promise.all([
          cloudTable('products', 'sort_order.asc,product_no.asc'), cloudTable('shipping_methods', 'sort_order.asc'),
          cloudTable('discounts'), cloudTable('campaigns')
        ]);
        return { products, shipping_methods, discounts, campaigns };
      } catch (error) { console.warn('雲端商店資料載入失敗，改用後台本機資料。', error); }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (saved.products?.length) return saved;
    } catch (error) { console.warn('本機商店資料格式錯誤。', error); }
    return {
      products: structuredClone(window.ADMIN_SEED_PRODUCTS || []),
      shipping_methods: [
        { id:'711', name:'7-ELEVEN', fee:65, free_threshold:1500, enabled:true },
        { id:'family', name:'全家', fee:65, free_threshold:1500, enabled:true },
        { id:'kuroneko', name:'黑貓宅配', fee:130, free_threshold:3000, enabled:true }
      ], discounts: [], campaigns: []
    };
  }

  function productKind(product) { return product.product_type || (String(product.product_no).startsWith('2') ? 'combo' : 'single'); }
  function comboContents(product) {
    if (Array.isArray(product.combo_items) && product.combo_items.length) return product.combo_items;
    const parts = product.name.split(/[－—-]/).slice(1).join('－');
    return parts ? parts.split(/[、,，]/).map(value => value.trim()).filter(Boolean) : [];
  }
  function eligibleSubtotal(discount, items) {
    // Supabase returns product numbers as strings, while an older cart may
    // contain numbers. Normalise both sides before checking applicability.
    const allowed = (discount.applicable_product_nos || []).map(String);
    return items.reduce((sum, item) => !allowed.length || allowed.includes(String(item.product_no)) ? sum + item.price * item.quantity : sum, 0);
  }
  function calculateDiscount(discount, items) {
    const amount = eligibleSubtotal(discount, items);
    if (amount < Number(discount.minimum_amount || 0)) return { amount: 0, eligibleSubtotal: amount, reason: 'minimum' };
    const value = Number(discount.discount_value || 0);
    const reduction = discount.discount_type === 'percent' ? Math.round((amount * (10 - value) / 10) + Number.EPSILON) : Math.min(amount, value);
    return { amount: Math.max(0, reduction), eligibleSubtotal: amount };
  }
  window.StorefrontData = { load, productKind, comboContents, calculateDiscount };
})();
