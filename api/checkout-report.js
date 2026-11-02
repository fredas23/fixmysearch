function appUrl(req) {
  const url = process.env.APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  return url.replace(/\/$/, '');
}

export function parseQuery(body = {}) {
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 5) return { error: 'Busca inválida.' };
  if (query.length > 400) return { error: 'Busca muito longa.' };
  return { query };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_REPORT_PRICE_ID) {
    return res.status(503).json({ error: 'Pagamento não configurado.' });
  }

  const input = parseQuery(req.body);
  if (input.error) return res.status(400).json({ error: input.error });

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': process.env.STRIPE_REPORT_PRICE_ID,
    'line_items[0][quantity]': '1',
    success_url: `${appUrl(req)}/obrigado.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl(req)}/?q=${encodeURIComponent(input.query)}`,
    'metadata[query]': input.query,
    allow_promotion_codes: 'true',
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
    console.error('Stripe report checkout error:', session.error);
    return res.status(502).json({ error: 'Erro ao criar o pagamento.' });
  }

  return res.status(200).json({ url: session.url });
}
