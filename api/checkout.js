import { authConfigured, bearer, getUser, getProfile } from '../lib/supabase.js';

function appUrl(req) {
  const url = process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  return url.replace(/\/$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!authConfigured() || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Pagamento não configurado.' });
  }

  const user = await getUser(bearer(req));
  if (!user) return res.status(401).json({ error: 'Faça login para assinar.' });

  const profile = await getProfile(user.id);
  if (profile?.plan === 'pro') return res.status(400).json({ error: 'Assinatura já ativa.' });

  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': process.env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: `${appUrl(req)}/?checkout=success`,
    cancel_url: `${appUrl(req)}/?checkout=cancel`,
    client_reference_id: user.id,
    customer_email: user.email,
    allow_promotion_codes: 'true',
    'subscription_data[metadata][user_id]': user.id,
  });

  const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const session = await stripe.json().catch(() => ({}));
  if (!stripe.ok) {
    console.error('Stripe checkout error:', session.error);
    return res.status(502).json({ error: 'Erro ao criar o checkout.' });
  }

  return res.status(200).json({ url: session.url });
}
