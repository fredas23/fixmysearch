import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.SUPABASE_ANON_KEY = 'anon';

const { hashIp, countSearches, patchProfile } = await import('../lib/supabase.js');
const { verify } = await import('../api/stripe-webhook.js');

test('hashIp é estável e não expõe o IP', async () => {
  const a = await hashIp('1.2.3.4');
  assert.equal(a, await hashIp('1.2.3.4'));
  assert.notEqual(a, await hashIp('1.2.3.5'));
  assert.equal(a.length, 64);
  assert.ok(!a.includes('1.2.3.4'));
});

test('countSearches lê o total do Content-Range', async () => {
  globalThis.fetch = async () => new Response(null, { status: 206, headers: { 'content-range': '0-0/7' } });
  assert.equal(await countSearches('user-id'), 7);
});

test('countSearches assume 0 sem Content-Range', async () => {
  globalThis.fetch = async () => new Response(null, { status: 200 });
  assert.equal(await countSearches('user-id'), 0);
});

test('patchProfile falha para o webhook poder tentar de novo', async () => {
  globalThis.fetch = async () => new Response('', { status: 500 });
  await assert.rejects(patchProfile('id=eq.1', { plan: 'pro' }));
});

test('verify aceita assinatura válida do Stripe', async () => {
  const secret = 'whsec_test';
  const payload = '{"type":"checkout.session.completed"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  assert.equal(await verify(payload, `t=${timestamp},v1=${signature}`, secret), true);
});

test('verify rejeita payload alterado e timestamp antigo', async () => {
  const secret = 'whsec_test';
  const payload = '{"type":"checkout.session.completed"}';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  assert.equal(await verify(`${payload} `, `t=${timestamp},v1=${signature}`, secret), false);
  assert.equal(await verify(payload, `t=${timestamp - 400},v1=${signature}`, secret), false);
});
