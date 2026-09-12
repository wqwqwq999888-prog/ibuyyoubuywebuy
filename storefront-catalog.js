(function () {
  'use strict';

  const SUPABASE_URL = 'https://jzaribewfglfczwcbgrh.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_nsz5_SpxrT5_GpI32jYpTA_HNaXQF5s';
  const CATALOG_KEY = 'ibuy-storefront-catalog-v1';
  const CAMPAIGN_CONTEXT_KEY = 'ibuy-campaign-context';

  function checkoutCampaign() {
    if (!/\/checkout(?:\.html)?$/.test(location.pathname)) return;
    let campaign;
    try {
      campaign = JSON.parse(sessionStorage.getItem(CAMPAIGN_CONTEXT_KEY) || 'null');
    } catch (_) {
      return;
    }
    if (!campaign || !campaign.discount_code) return;

    const style = document.createElement('style');
    style.textContent = '.checkout-campaign-banner{display:flex;justify-content:space-between;gap:20px;max-width:1100px;margin:18px auto 0;padding:14px 20px;border:1px solid var(--gold);background:rgba(184,138,59,.1);color:var(--cream)}.checkout-campaign-banner span{color:var(--gold)}@media(max-width:600px){.checkout-campaign-banner{margin-inline:16px;flex-direction:column;gap:5px}}';
    document.head.appendChild(style);

    const banner = document.createElement('aside');
    banner.className = 'checkout-campaign-banner';
    const title = document.createElement('strong');
    title.textContent = `${campaign.partner_name}｜${campaign.name}`;
    const code = document.createElement('span');
    code.textContent = `專屬折扣碼 ${campaign.discount_code}`;
    banner.append(title, code);
    document.querySelector('nav')?.after(banner);

    let attempts = 0;
    const applyWhenReady = setInterval(async () => {
      const input = document.getElementById('discountCode');
      const orderItems = document.getElementById('orderItems');
      if (++attempts > 24) return clearInterval(applyWhenReady);
      if (!input || !orderItems?.children.length || typeof window.applyDiscountCode !== 'function') return;
      clearInterval(applyWhenReady);
      input.value = campaign.discount_code;
      await window.applyDiscountCode();
    }, 250);
  }

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
  window.addEventListener('DOMContentLoaded', checkoutCampaign);
})();
