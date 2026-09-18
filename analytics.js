(function () {
  'use strict';

  const MEASUREMENT_ID = 'G-FRZ2RMV82S';
  const ATTRIBUTION_KEY = 'ibuy-ga4-attribution-v1';
  const CAMPAIGN_KEY = 'ibuy-campaign-context';
  const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'campaign'];

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: true });

  function readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }

  function attribution() {
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
    return { client_id: clientId(), session_id: sessionId(), ...attribution() };
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target) return;
    const label = target.dataset.analyticsLabel;
    if (label) track('select_content', { content_type: 'cta', content_id: label });
  });

  window.IBuyAnalytics = { attribution, orderAttribution, productReference, track };
})();
