// lib/supabase.js — PostgREST + Auth via fetch, sem dependências

export const FREE_DAILY = 5;
export const PRO_DAILY = 200;
export const ANON_DAILY = 10;

const base = () => process.env.SUPABASE_URL;
const service = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = () => process.env.SUPABASE_ANON_KEY;

export function authConfigured() {
  return Boolean(base() && service() && anon());
}

async function rest(path, options = {}) {
  return fetch(`${base()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: service(),
      ...(service().startsWith('eyJ') ? { Authorization: `Bearer ${service()}` } : {}),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

export function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export async function getUser(token) {
  if (!token || !authConfigured()) return null;
  const res = await fetch(`${base()}/auth/v1/user`, {
    headers: { apikey: anon(), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getProfile(userId) {
  const res = await rest(`profiles?id=eq.${encodeURIComponent(userId)}&select=plan,stripe_customer_id`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

export async function countSearches(userId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await rest(`searches?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${since}&select=id`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range') || '';
  return Number(range.split('/')[1] || 0);
}

export async function hashIp(ip) {
  const data = new TextEncoder().encode(`${process.env.IP_HASH_SALT || 'fms'}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function countAnonSearches(ipHash) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await rest(`anon_searches?ip_hash=eq.${ipHash}&created_at=gte.${since}&select=id`, {
    headers: { Prefer: 'count=exact', Range: '0-0' },
  });
  const range = res.headers.get('content-range') || '';
  return Number(range.split('/')[1] || 0);
}

export async function insertAnonSearch(ipHash) {
  try {
    const res = await rest('anon_searches', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ip_hash: ipHash }),
    });
    if (!res.ok) console.error('insertAnonSearch:', res.status);
  } catch (err) {
    console.error('insertAnonSearch:', err.message);
  }
}

export async function insertSearch(userId, query, result) {
  try {
    const res = await rest('searches', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, query, result }),
    });
    if (!res.ok) console.error('insertSearch:', res.status);
  } catch (err) {
    console.error('insertSearch:', err.message);
  }
}

export async function listSearches(userId, limit = 50) {
  const res = await rest(
    `searches?user_id=eq.${encodeURIComponent(userId)}&select=query,result,created_at&order=created_at.desc&limit=${limit}`
  );
  if (!res.ok) return [];
  return res.json();
}

export async function patchProfile(filter, patch) {
  const res = await rest(`profiles?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`patchProfile ${res.status}`);
}
