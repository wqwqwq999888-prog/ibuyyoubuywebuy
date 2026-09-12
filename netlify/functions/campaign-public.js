const { supabase } = require('./_orders');

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  try {
    const id = String(event.queryStringParameters?.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('團購連結不正確');
    const rows = await supabase(`campaigns?id=eq.${encodeURIComponent(id)}&enabled=eq.true&select=id,name,partner_name,discount_code,starts_at,ends_at`);
    if (!rows.length) return json(404, { error: '找不到這個團購活動' });
    const campaign = rows[0];
    const now = Date.now();
    const status = Date.parse(campaign.starts_at) > now ? 'upcoming' : Date.parse(campaign.ends_at) < now ? 'ended' : 'active';
    return json(200, { ...campaign, status });
  } catch (error) { return json(400, { error: error.message }); }
};
