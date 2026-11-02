import { REPORT_PROMPT } from '../lib/prompts.js';

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL) { cache.delete(key); return null; }
  return hit.value;
}

function setCached(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { time: Date.now(), value });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionId = String(req.query.session_id || '');
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ error: 'Sessão de pagamento inválida.' });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Relatório não configurado.' });
  }

  const cached = getCached(sessionId);
  if (cached) return res.status(200).json(cached);

  const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const session = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) {
    console.error('Stripe report session error:', session.error);
    return res.status(400).json({ error: 'Pagamento não encontrado.' });
  }
  if (!['paid', 'no_payment_required'].includes(session.payment_status)) {
    return res.status(402).json({ error: 'Pagamento ainda não confirmado.' });
  }

  const query = String(session.metadata?.query || '').trim();
  if (query.length < 5 || query.length > 400) {
    return res.status(400).json({ error: 'Busca do relatório inválida.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const aiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: REPORT_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `Busca: "${query}"` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: 'application/json' },
      }),
    }
  );

  const aiData = await aiRes.json().catch(() => ({}));
  if (!aiRes.ok) {
    console.error('Gemini report error:', aiData);
    return res.status(502).json({ error: 'Erro ao gerar o relatório. Tente novamente.' });
  }

  try {
    const raw = (aiData.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    const report = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!report.intention || !Array.isArray(report.reformulations) || !Array.isArray(report.plano)) {
      throw new Error('Resposta incompleta');
    }
    const payload = { query, ...report };
    setCached(sessionId, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Report parse error:', err.message);
    return res.status(502).json({ error: 'Erro ao gerar o relatório. Tente novamente.' });
  }
}
