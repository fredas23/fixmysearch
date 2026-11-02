import { authConfigured, bearer, getUser, getProfile } from '../lib/supabase.js';

function appUrl(req) {
  const url = process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  return url.replace(/\/$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authConfigured() || !process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Pagamento não configurado.' });
  }

  const user = await getUser(bearer(req));
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });

  const profile = await getProfile(user.id);
  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'Nenhuma assinatura encontrada.' });
  }

  const body = new URLSearchParams({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl(req)}/`,
  });

  const stripe = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const session = await stripe.json().catch(() => ({}));
  if (!stripe.ok) {
    console.error('Stripe portal error:', session.error);
    return res.status(502).json({ error: 'Erro ao abrir o portal de assinatura.' });
  }

  return res.status(200).json({ url: session.url });
}
