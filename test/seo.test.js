import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, escapeHtml, metaDescription } from '../lib/seo.js';

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
