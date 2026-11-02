#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from '../lib/prompts.js';
import { slugify, escapeHtml, metaDescription } from '../lib/seo.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env };
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.trim().startsWith('#')) env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}

const QUERIES = [
  'minha planta está amarelando e caindo as folhas',
  'como parar de procrastinar para estudar',
  'dor nas costas ao acordar e rigidez',
  'como aprender programação do zero sozinho',
  'como emagrecer rápido sem dieta e sem academia',
  'como tirar mancha de roupa branca encardida',
  'como economizar dinheiro todo mês ganhando pouco',
  'como estudar para concurso trabalhando',
  'como melhorar a bateria do celular que descarrega rápido',
  'como acabar com a insônia naturalmente',
  'como limpar sofá de tecido em casa',
  'como tirar mau cheiro da geladeira',
  'como eliminar formigas da cozinha',
  'como limpar prata escurecida em casa',
  'como tirar ferrugem de roupa branca',
  'como tirar cheiro de mofo de roupa',
  'como fazer currículo sem experiência',
  'como se sair bem em entrevista de emprego sem experiência',
  'como aprender inglês sozinho em casa',
  'como melhorar a memória para estudar',
  'como organizar a rotina de estudos',
  'como aliviar a ansiedade antes da prova',
  'como escolher um notebook para estudar',
  'como melhorar a postura no trabalho',
  'como começar a correr sem se machucar',
  'como cuidar de suculentas em apartamento',
  'como economizar energia elétrica em casa',
  'como se preparar para o Enem em pouco tempo',
];

const force = process.argv.includes('--force');
const base = (env.APP_URL || 'https://fixmysearch-deploy.vercel.app').replace(/\/+$/, '');
const dataPath = path.join(root, 'seo', 'data.json');

function loadData() {
  if (!fs.existsSync(dataPath)) return new Map();
  const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return new Map((parsed.items || []).map((item) => [item.query, item]));
}

async function callGemini(query) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY ausente no .env.local');
  const model = env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: `Busca: "${query}"` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1500, responseMimeType: 'application/json' },
      }),
    }
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `Gemini HTTP ${response.status}`);
  const raw = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
  if (!data.intention || !Array.isArray(data.reformulations) || data.reformulations.length < 5) {
    throw new Error('Resposta da IA incompleta');
  }
  return data;
}

function pageHtml(item, items) {
  const q = escapeHtml(item.query);
  const d = item.data;
  const url = `${base}/p/${item.slug}`;
  const title = `${q} — 5 buscas melhores | FixMySearch`;
  const desc = escapeHtml(metaDescription(d.intention, item.query));
  const reformulations = d.reformulations.map((r) => `
        <li>
          <span class="tag">${escapeHtml(r.typeLabel)}</span>
          <code>${escapeHtml(r.query)}</code>
        </li>`).join('');
  const places = (d.whereTo || []).map((w) => `
        <li><strong>${escapeHtml(w.icon)} ${escapeHtml(w.name)}</strong><span>${escapeHtml(w.reason)}</span></li>`).join('');
  const related = items
    .filter((other) => other.slug !== item.slug)
    .slice(0, 4)
    .map((other) => `<li><a href="/p/${other.slug}">${escapeHtml(other.query)}</a></li>`)
    .join('');
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: item.query,
    description: d.intention,
    url,
    inLanguage: 'pt-BR',
    isPartOf: { '@type': 'WebSite', name: 'FixMySearch', url: base },
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;background:#0F1923;color:#E6EDF5;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.6}
    a{color:#FFB432}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;border-bottom:1px solid #1E3347;max-width:860px;margin:0 auto}
    .brand{font-weight:800;color:#E6EDF5;text-decoration:none;letter-spacing:-.02em}
    .cta{background:linear-gradient(135deg,#FFB432,#FF7A00);color:#0A1929;padding:9px 16px;border-radius:9px;font-weight:700;text-decoration:none;font-size:.85rem;white-space:nowrap}
    main{max-width:760px;margin:0 auto;padding:44px 24px 64px}
    .eyebrow{color:#FFB432;font-size:.72rem;font-weight:700;letter-spacing:.12em}
    h1{font-size:clamp(1.8rem,5vw,2.8rem);line-height:1.15;letter-spacing:-.03em;margin:12px 0 16px}
    .lead{color:#8FA6BC;font-size:1.05rem;max-width:620px}
    section{margin-top:36px}
    h2{font-size:.8rem;letter-spacing:.1em;color:#8FA6BC;margin:0 0 12px}
    .intention{background:#162232;border:1px solid #1E3347;border-left:3px solid #FFB432;border-radius:10px;padding:16px 18px}
    ol,ul{margin:0;padding:0;list-style:none}
    ol li{display:flex;gap:10px;align-items:flex-start;background:#162232;border:1px solid #1E3347;border-radius:10px;padding:12px 14px;margin-bottom:8px}
    .tag{font-size:.66rem;font-weight:700;color:#FFB432;text-transform:uppercase;white-space:nowrap;padding-top:3px}
    code{font-family:inherit;font-size:.95rem;color:#E6EDF5}
    ul li{background:#162232;border:1px solid #1E3347;border-radius:10px;padding:12px 14px;margin-bottom:8px}
    ul li strong{display:block;font-size:.92rem}
    ul li span{color:#8FA6BC;font-size:.84rem}
    .big{display:block;width:100%;text-align:center;margin:36px 0;padding:16px;border:0;border-radius:11px;background:linear-gradient(135deg,#FFB432,#FF7A00);color:#0A1929;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}
    .big:disabled{opacity:.7;cursor:wait}
    #report{margin-top:-20px}
    .report-note{text-align:center;color:#8FA6BC;font-size:.78rem;margin:-26px 0 0}
    .related a{display:block;padding:10px 0;border-bottom:1px solid #1E3347;text-decoration:none;font-size:.92rem}
    footer{max-width:760px;margin:0 auto;padding:24px;border-top:1px solid #1E3347;color:#8FA6BC;font-size:.8rem}
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/">✦ FixMySearch</a>
    <a class="cta" href="/">Testar grátis</a>
  </header>
  <main>
    <div class="eyebrow">BUSCA REFORMULADA</div>
    <h1>${q}</h1>
    <p class="lead">A busca original tem uma intenção clara. O problema é que o Google não sabe disso. Veja 5 versões melhores e onde procurar.</p>

    <section>
      <h2>O QUE VOCÊ REALMENTE QUER SABER</h2>
      <div class="intention">${escapeHtml(d.intention)}</div>
    </section>

    <section>
      <h2>5 FORMAS MELHORES DE BUSCAR</h2>
      <ol>${reformulations}
      </ol>
    </section>

    <section>
      <h2>ONDE BUSCAR ALÉM DO GOOGLE</h2>
      <ul>${places}
      </ul>
    </section>

    <a class="big" href="/?q=${encodeURIComponent(item.query)}">Testar essa busca grátis →</a>
    <button class="big" id="report" data-query="${q}">Quero o relatório completo — R$9,90</button>
    <p class="report-note">Pagamento único via Stripe. Entrega imediata do relatório.</p>

    <section class="related">
      <h2>OUTRAS BUSCAS</h2>
      <ul>${related}</ul>
    </section>
  </main>
  <footer>FixMySearch · 5 buscas grátis por dia · <a href="/p">Ver todas</a><br>Conteúdo informativo; não substitui orientação profissional.</footer>
  <script>
    document.getElementById('report').addEventListener('click', async function(){
      const btn=this;
      btn.disabled=true;
      btn.textContent='Abrindo pagamento...';
      try{
        const res=await fetch('/api/checkout-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:btn.dataset.query})});
        const data=await res.json();
        if(!res.ok||!data.url) throw new Error(data.error||'Erro ao abrir o pagamento.');
        location.href=data.url;
      }catch(err){
        alert(err.message);
        btn.disabled=false;
        btn.textContent='Quero o relatório completo — R$9,90';
      }
    });
  </script>
  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
}

function indexHtml(items) {
  const links = items.map((item) => `<li><a href="/p/${item.slug}">${escapeHtml(item.query)}</a></li>`).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buscas reformuladas | FixMySearch</title>
  <meta name="description" content="Exemplos de buscas mal formuladas que ganharam 5 versões melhores.">
  <link rel="canonical" href="${base}/p">
  <style>
    body{margin:0;background:#0F1923;color:#E6EDF5;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.6}
    a{color:#FFB432}
    main{max-width:760px;margin:0 auto;padding:44px 24px}
    h1{letter-spacing:-.03em}
    li{margin-bottom:12px;background:#162232;border:1px solid #1E3347;border-radius:10px;padding:12px 14px;list-style:none}
    ul{padding:0}
    .cta{display:inline-block;margin-top:24px;background:linear-gradient(135deg,#FFB432,#FF7A00);color:#0A1929;padding:12px 18px;border-radius:10px;font-weight:800;text-decoration:none}
  </style>
</head>
<body>
  <main>
    <h1>Buscas reformuladas</h1>
    <p>Exemplos reais de buscas que ganharam 5 versões melhores, a intenção real e onde procurar.</p>
    <ul>${links}</ul>
    <a class="cta" href="/">Reformular minha busca →</a>
  </main>
  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
}

function sitemap(items) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${base}/`, `${base}/p`, ...items.map((item) => `${base}/p/${item.slug}`)];
  const body = urls.map((url) => `  <url><loc>${url}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function main() {
  const existing = loadData();
  const items = [];

  for (const query of QUERIES) {
    const cached = existing.get(query);
    if (cached && !force) {
      items.push(cached);
      console.log(`reuso: ${query}`);
      continue;
    }
    try {
      const data = await callGemini(query);
      const item = { query, slug: slugify(query), data };
      items.push(item);
      console.log(`ok: ${query}`);
    } catch (err) {
      console.error(`falhou: ${query} — ${err.message}`);
    }
  }

  if (!items.length) process.exit(1);

  const pagesDir = path.join(root, 'public', 'p');
  for (const item of items) {
    const dir = path.join(pagesDir, item.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(item, items));
  }
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.writeFileSync(path.join(pagesDir, 'index.html'), indexHtml(items));
  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), sitemap(items));
  fs.writeFileSync(
    path.join(root, 'public', 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`
  );
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));
  console.log(`\n${items.length} páginas geradas em public/p`);
}

main();
