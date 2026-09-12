const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

let requestedUrl = '';
global.fetch = async url => {
  requestedUrl = String(url);
  return { ok: true, text: async () => JSON.stringify([{
    id: '11111111-1111-1111-1111-111111111111', name: '中秋團購', partner_name: '王老師',
    discount_code: 'TEACHER', starts_at: '2026-09-01T00:00:00Z', ends_at: '2099-09-30T00:00:00Z'
  }]) };
};

const { handler } = require('../netlify/functions/campaign-public');
(async () => {
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { id: '11111111-1111-1111-1111-111111111111' } });
  assert.equal(response.statusCode, 200);
  const campaign = JSON.parse(response.body);
  assert.equal(campaign.partner_name, '王老師');
  assert.equal(campaign.discount_code, 'TEACHER');
  assert.equal(campaign.status, 'active');
  assert.ok(!Object.hasOwn(campaign, 'report_token'));
  assert.match(requestedUrl, /enabled=eq\.true/);
  assert.doesNotMatch(requestedUrl, /report_token/);

  const invalid = await handler({ httpMethod: 'GET', queryStringParameters: { id: 'bad' } });
  assert.equal(invalid.statusCode, 400);
  console.log('Campaign public endpoint checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
