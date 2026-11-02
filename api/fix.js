// api/fix.js — Vercel Serverless Function
// Proxy seguro: a chave da Anthropic fica aqui, nunca no frontend

import {
  authConfigured,
  bearer,
  getUser,
  getProfile,
  countSearches,
  insertSearch,
  hashIp,
  countAnonSearches,
  insertAnonSearch,
  FREE_DAILY,
  PRO_DAILY,
  ANON_DAILY,
} from '../lib/supabase.js';
import { SYSTEM_PROMPT, BUSINESS_PROMPT } from '../lib/prompts.js';

export function parseInput(body = {}) {
  if (body.mode === 'business') {
    const business = String(body.business || '').trim().slice(0, 80);
    const niche = String(body.niche || '').trim().slice(0, 80);
    const city = String(body.city || '').trim().slice(0, 80);
    if (business.length < 2 || niche.length < 2 || city.length < 2) {
      return { error: 'Informe negócio, nicho e cidade.' };
    }
    return { mode: 'business', business, niche, city, label: `[Negócio] ${business} · ${niche} · ${city}` };
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 5) return { error: 'Query inválida.' };
  if (query.length > 400) return { error: 'Query muito longa.' };
  return { mode: 'consumer', query, label: query };
}

export function aiProvider(env = process.env) {
  return (env.AI_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : 'anthropic')).toLowerCase();
}

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();

// shortcut: cache em memória dura só enquanto a instância está morna; trocar por Upstash/Vercel KV com tráfego constante
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
  // CORS — ajuste para seu domínio em produção
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'X-Plan, X-Quota-Used, X-Quota-Limit');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const input = parseInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });

  const isBusiness = input.mode === 'business';
  const label = input.label;
  const userText = isBusiness
    ? `Negócio: "${input.business}"\nNicho: "${input.niche}"\nCidade: "${input.city}"`
    : `Busca: "${input.query}"`;

  const provider = aiProvider();
  if (provider === 'gemini' ? !process.env.GEMINI_API_KEY : !process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API de IA não configurada.' });
  }

  let user = null;
  let anonHash = null;
  let plan = 'free';
  let used = 0;
  let limit = 0;

  if (authConfigured()) {
    user = await getUser(bearer(req));
    if (user) {
      const profile = await getProfile(user.id);
      plan = profile?.plan === 'pro' ? 'pro' : 'free';
      limit = plan === 'pro' ? PRO_DAILY : FREE_DAILY;
      used = await countSearches(user.id);

      if (used >= limit) {
        res.setHeader('X-Plan', plan);
        res.setHeader('X-Quota-Used', String(used));
        res.setHeader('X-Quota-Limit', String(limit));
        return res.status(429).json({
          error: plan === 'pro' ? 'Limite diário de uso atingido.' : 'Suas buscas grátis acabaram. Assine o Pro para continuar.',
        });
      }
    } else {
      const ip = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || 'unknown';
      anonHash = await hashIp(ip);
      if ((await countAnonSearches(anonHash)) >= ANON_DAILY) {
        return res.status(429).json({ error: 'Limite de buscas grátis atingido. Assine o Pro para continuar.' });
      }
    }
  }

  const finish = async (payload) => {
    if (user) {
      await insertSearch(user.id, label, payload);
      res.setHeader('X-Plan', plan);
      res.setHeader('X-Quota-Used', String(used + 1));
      res.setHeader('X-Quota-Limit', String(limit));
    } else if (anonHash) {
      await insertAnonSearch(anonHash);
    }
    return res.status(200).json(payload);
  };

  const cacheKey = `${input.mode}:${label.toLowerCase().replace(/\s+/g, ' ')}`;
  const cached = getCached(cacheKey);
  if (cached) return finish(cached);

  try {
    let raw = '';

    if (provider === 'gemini') {
      const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: isBusiness ? BUSINESS_PROMPT : SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 1500, responseMimeType: 'application/json' },
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('Gemini error:', data);
        return res.status(502).json({ error: 'Erro ao chamar IA. Tente novamente.' });
      }
      console.log('Gemini usage:', JSON.stringify(data.usageMetadata));
      raw = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    } else {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-5-5',
          max_tokens: isBusiness ? 900 : 500,
          temperature: 0,
          system: isBusiness ? BUSINESS_PROMPT : SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userText }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('Anthropic error:', err);
        return res.status(502).json({ error: 'Erro ao chamar IA. Tente novamente.' });
      }

      const data = await response.json();
      console.log('Anthropic usage:', JSON.stringify(data.usage));
      raw = data.content?.find(b => b.type === 'text')?.text || '';
    }

    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const valid = isBusiness
      ? parsed.resumo && Array.isArray(parsed.perguntas)
      : parsed.intention && Array.isArray(parsed.reformulations);
    if (!valid) throw new Error('Resposta inesperada da IA');

    setCached(cacheKey, parsed);
    return finish(parsed);
  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
