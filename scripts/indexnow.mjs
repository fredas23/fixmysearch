import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const key = 'c9f5f7708c927cfb57473927f074f954';
const base = (process.env.APP_URL || 'https://fixmysearch-deploy.vercel.app').replace(/\/+$/, '');
const items = JSON.parse(fs.readFileSync(path.join(root, 'seo', 'data.json'), 'utf8')).items;
const urlList = [`${base}/`, `${base}/p`, ...items.map((item) => `${base}/p/${item.slug}`)];

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(base).host,
    key,
    keyLocation: `${base}/${key}.txt`,
    urlList
  })
});

const text = await response.text();
console.log(`IndexNow: ${response.status} ${text || 'sem resposta'}`);
console.log(`${urlList.length} URLs enviadas`);
if (!response.ok) process.exit(1);
