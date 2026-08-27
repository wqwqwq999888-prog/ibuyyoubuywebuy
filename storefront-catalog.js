(function () {
  'use strict';

  const SUPABASE_URL = 'https://jzaribewfglfczwcbgrh.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_nsz5_SpxrT5_GpI32jYpTA_HNaXQF5s';
  const CATALOG_KEY = 'ibuy-storefront-catalog-v1';

  async function loadStorefrontCatalog(preferCache = false) {
    if (preferCache) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(CATALOG_KEY) || 'null');
        if (Array.isArray(cached) && cached.length) return cached;
      } catch (_) {}
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=product_no,name,price,specification,description,image_url,sort_order,product_type,combo_contents&enabled=eq.true&order=sort_order.asc,product_no.asc`, {
        headers: { apikey: SUPABASE_ANON_KEY },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`商品同步失敗 (${response.status})`);
      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) throw new Error('商品目錄目前沒有上架商品');
      sessionStorage.setItem(CATALOG_KEY, JSON.stringify(products));
      return products;
    } catch (error) {
      // Deploy Preview 或 Supabase 暫時無法連線時，優先沿用本次瀏覽已成功取得的目錄。
      try {
        const cached = JSON.parse(sessionStorage.getItem(CATALOG_KEY) || 'null');
        if (Array.isArray(cached) && cached.length) return cached;
      } catch (_) {}
      console.warn(error.message || error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.STOREFRONT_CATALOG_KEY = CATALOG_KEY;
  window.loadStorefrontCatalog = loadStorefrontCatalog;
})();
