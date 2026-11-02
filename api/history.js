import { authConfigured, bearer, getUser, getProfile, listSearches } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!authConfigured()) return res.status(503).json({ error: 'Login não configurado.' });

  const user = await getUser(bearer(req));
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });

  const profile = await getProfile(user.id);
  if (profile?.plan !== 'pro') return res.status(403).json({ error: 'Histórico é um recurso Pro.' });

  const items = await listSearches(user.id);
  return res.status(200).json({ items });
}
