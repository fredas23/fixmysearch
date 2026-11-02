import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, aiProvider } from '../api/fix.js';

test('parseInput aceita modo negócio completo', () => {
  const p = parseInput({ mode: 'business', business: ' Clínica Sorriso ', niche: 'dentista', city: 'Curitiba' });
  assert.equal(p.mode, 'business');
  assert.equal(p.business, 'Clínica Sorriso');
  assert.equal(p.label, '[Negócio] Clínica Sorriso · dentista · Curitiba');
});

test('parseInput exige os três campos do modo negócio', () => {
  assert.match(parseInput({ mode: 'business', business: 'X', niche: 'Y' }).error, /negócio/);
  assert.match(parseInput({ mode: 'business', business: 'X', niche: 'Y', city: ' ' }).error, /negócio/);
});

test('parseInput valida busca pessoal', () => {
  assert.match(parseInput({ query: 'oi' }).error, /inválida/);
  assert.match(parseInput({ query: 'a'.repeat(401) }).error, /longa/);
  assert.equal(parseInput({ query: '  dor nas costas  ' }).query, 'dor nas costas');
});

test('aiProvider usa Gemini quando só há chave gratuita', () => {
  assert.equal(aiProvider({ GEMINI_API_KEY: 'x' }), 'gemini');
  assert.equal(aiProvider({ GEMINI_API_KEY: 'x', AI_PROVIDER: 'anthropic' }), 'anthropic');
  assert.equal(aiProvider({ ANTHROPIC_API_KEY: 'y' }), 'anthropic');
});
