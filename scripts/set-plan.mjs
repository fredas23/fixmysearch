#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const env = { ...process.env };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}

const [identifier, plan = 'pro'] = process.argv.slice(2);
if (!identifier || !['pro', 'free'].includes(plan)) {
  console.error('Uso: node scripts/set-plan.mjs <email-ou-id> [pro|free]');
  process.exit(1);
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  process.exit(1);
}

const adminHeaders = { apikey: key, Authorization: `Bearer ${key}` };
const restHeaders = { apikey: key, 'Content-Type': 'application/json' };

async function findUserId() {
  if (!identifier.includes('@')) return identifier;
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders });
  if (!res.ok) throw new Error(`Supabase admin ${res.status}: ${await res.text()}`);
  const { users = [] } = await res.json();
  const user = users.find((u) => (u.email || '').toLowerCase() === identifier.toLowerCase());
  if (!user) throw new Error(`Usuário não encontrado: ${identifier}`);
  return user.id;
}

const id = await findUserId();
const patch = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
  method: 'PATCH',
  headers: { ...restHeaders, Prefer: 'return=representation' },
  body: JSON.stringify({ plan }),
});
if (!patch.ok) throw new Error(`Supabase REST ${patch.status}: ${await patch.text()}`);
const rows = await patch.json();
if (!rows.length) {
  const insert = await fetch(`${url}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ id, plan }),
  });
  if (!insert.ok) throw new Error(`Supabase REST ${insert.status}: ${await insert.text()}`);
}
console.log(`OK: ${identifier} -> ${plan}`);
