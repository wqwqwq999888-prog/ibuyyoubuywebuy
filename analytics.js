(function () {
  'use strict';

  const MEASUREMENT_ID = 'G-FRZ2RMV82S';
  const ATTRIBUTION_KEY = 'ibuy-ga4-attribution-v1';
  const CAMPAIGN_KEY = 'ibuy-campaign-context';
  const PURCHASED_ORDERS_KEY = 'ibuy-ga4-purchased-orders-v1';
  const DEBUG_MODE_KEY = 'ibuy-ga4-debug-mode';
  const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'campaign'];

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: true });

  function readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  function debugMode() {
    const params = new URLSearchParams(location.search);
    const current = params.has('gtm_debug') || params.get('debug_mode') === '1';
    if (current) {
      try { sessionStorage.setItem(DEBUG_MODE_KEY, '1'); } catch (_) {}
    }
    try { return current || sessionStorage.getItem(DEBUG_MODE_KEY) === '1'; }
    catch (_) { return current; }
  }

  function attribution() {
    debugMode();
    const params = new URLSearchParams(location.search);
    const current = {};
    ATTRIBUTION_PARAMS.forEach(key => {
      const value = params.get(key);
      if (value) current[key === 'campaign' ? 'campaign_id' : key] = value;
    });
    const campaign = readJson(sessionStorage, CAMPAIGN_KEY);
    if (campaign?.id) current.campaign_id = campaign.id;
    if (campaign?.name) current.campaign_name = campaign.name;
    if (campaign?.partner_name) current.campaign_partner = campaign.partner_name;
    const saved = readJson(sessionStorage, ATTRIBUTION_KEY) || {};
    const merged = { ...saved, ...current };
    try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged)); } catch (_) {}
    return merged;
  }

  function cookie(name) {
    const prefix = `${name}=`;
    const part = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : '';
  }

  function clientId() {
    const parts = cookie('_ga').split('.');
    return parts.length >= 4 ? parts.slice(-2).join('.') : '';
  }

  function sessionId() {
    const gaCookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('_ga_'));
    if (!gaCookie) return '';
    const parts = gaCookie.split('=', 2)[1].split('.');
    return parts.length >= 3 ? parts[2] : '';
  }

  function track(name, parameters = {}) {
    window.gtag('event', name, { ...attribution(), ...parameters });
  }

  function productReference(product) {
    return {
      item_id: String(product.product_no),
      item_name: String(product.name)
    };
  }

  function orderAttribution() {
    return { client_id: clientId(), session_id: sessionId(), debug_mode: debugMode() || undefined, ...attribution() };
  }

  function trackPurchase(order) {
    const transactionId = String(order?.orderId || '');
    if (!transactionId) return false;

    const trackedOrders = readJson(localStorage, PURCHASED_ORDERS_KEY);
    const transactionIds = Array.isArray(trackedOrders) ? trackedOrders : [];
    if (transactionIds.includes(transactionId)) return false;

    const items = (order.items || []).map(item => ({
      item_id: String(item.productNo),
      item_name: String(item.name),
      price: Number(item.price),
      quantity: Number(item.qty)
    }));
    track('purchase', {
      transaction_id: transactionId,
      value: Math.max(0, Number(order.productAmount ?? order.subtotal) - Number(order.discountAmount || 0)),
      currency: 'TWD',
      shipping: Number(order.shippingFee || 0),
      coupon: order.discountCode || undefined,
      items
    });

    try {
      localStorage.setItem(PURCHASED_ORDERS_KEY, JSON.stringify([...transactionIds, transactionId].slice(-50)));
    } catch (_) {}
    return true;
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target) return;
    const label = target.dataset.analyticsLabel;
    if (label) track('select_content', { content_type: 'cta', content_id: label });
  });

  window.IBuyAnalytics = { attribution, orderAttribution, productReference, track, trackPurchase };
})();
