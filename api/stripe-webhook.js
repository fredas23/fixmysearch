import { patchProfile } from '../lib/supabase.js';

export const config = { runtime: 'edge' };

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function verify(payload, header, secret) {
  try {
    const parts = Object.fromEntries(header.split(',').map(part => part.trim().split('=')));
    const timestamp = Number(parts.t);
    if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
    const signature = hexToBytes(parts.v1 || '');
    if (!signature) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${timestamp}.${payload}`));
  } catch {
    return false;
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_URL) return new Response('Not configured', { status: 503 });

  const payload = await req.text();
  const header = req.headers.get('stripe-signature') || '';
  if (!(await verify(payload, header, secret))) return new Response('Invalid signature', { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.client_reference_id) {
        await patchProfile(`id=eq.${encodeURIComponent(session.client_reference_id)}`, {
          plan: 'pro',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        });
      }
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object;
      const plan = subscription.status === 'active' || subscription.status === 'trialing' ? 'pro' : 'free';
      await patchProfile(`stripe_customer_id=eq.${encodeURIComponent(subscription.customer)}`, {
        plan,
        stripe_subscription_id: subscription.id,
      });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
    return new Response('Server error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
