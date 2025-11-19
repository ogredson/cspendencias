export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const { phone, message, token } = req.body || {};
    const auth = token || process.env.WHATSAPP_API_TOKEN || '';
    if (!auth) {
      return res.status(400).json({ error: 'missing_token' });
    }
    if (!phone || !message) {
      return res.status(400).json({ error: 'missing_params' });
    }
    const resp = await fetch('https://v2.speedchat.dev.br/api/whatsapp/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': auth },
      body: JSON.stringify({ phone, message })
    });
    const text = await resp.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(resp.status).send(text);
  } catch (err) {
    res.status(500).json({ error: 'proxy_exception', message: err?.message || String(err) });
  }
}