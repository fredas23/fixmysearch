import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { slugify, escapeHtml, metaDescription } from '../lib/seo.js';

test('seo/data.json tem 100 slugs únicos', () => {
  const items = JSON.parse(fs.readFileSync(new URL('../seo/data.json', import.meta.url))).items;
  assert.equal(items.length, 100);
  assert.equal(new Set(items.map((item) => item.slug)).size, 100);
});

test('páginas prioritárias têm conteúdo, FAQ e fontes', () => {
  const items = JSON.parse(fs.readFileSync(new URL('../seo/data.json', import.meta.url))).items;
  const priority = [
    'como-fazer-curriculo-sem-experiencia',
    'como-acabar-com-a-insonia-naturalmente',
    'como-se-preparar-para-o-enem-em-pouco-tempo',
    'como-se-sair-bem-em-entrevista-de-emprego-sem-experiencia',
    'como-emagrecer-rapido-sem-dieta-e-sem-academia',
    'como-aprender-ingles-sozinho-em-casa',
    'como-sair-das-dividas',
    'como-dormir-melhor',
    'como-se-destacar-no-linkedin',
    'como-passar-em-concurso-publico'
  ];
  for (const slug of priority) {
    const item = items.find((entry) => entry.slug === slug);
    assert.ok(item, `página ausente: ${slug}`);
    assert.ok(item.data.steps.length >= 3, `passos ausentes: ${slug}`);
    assert.ok(item.data.details.length >= 3, `seções ausentes: ${slug}`);
    assert.ok(item.data.faq.length >= 3, `FAQ ausente: ${slug}`);
    assert.ok(item.data.sources.length >= 1, `fontes ausentes: ${slug}`);
  }
});

test('slugify remove acentos e pontuação', () => {
  assert.equal(slugify('Minha planta está amarelando?!'), 'minha-planta-esta-amarelando');
});

test('escapeHtml neutraliza tags', () => {
  assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

test('metaDescription respeita 160 caracteres', () => {
  const text = metaDescription('x'.repeat(200), 'busca');
  assert.ok(text.length <= 160);
  assert.ok(text.endsWith('...'));
  assert.ok(!metaDescription('Intenção clara.', 'busca').includes('..'));
});
