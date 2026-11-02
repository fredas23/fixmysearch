import { authConfigured, bearer, getUser, getProfile, countSearches, FREE_DAILY, PRO_DAILY } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!authConfigured()) return res.status(503).json({ error: 'Login não configurado.' });

  const user = await getUser(bearer(req));
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });

  const profile = await getProfile(user.id);
  const plan = profile?.plan === 'pro' ? 'pro' : 'free';
  const used = await countSearches(user.id);
  const limit = plan === 'pro' ? PRO_DAILY : FREE_DAILY;

  return res.status(200).json({ email: user.email, plan, used, limit });
}
