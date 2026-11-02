import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../api/checkout-report.js';

test('aceita e normaliza busca válida', () => {
  assert.deepEqual(parseQuery({ query: '  como cuidar de planta  ' }), { query: 'como cuidar de planta' });
});

test('rejeita busca curta', () => {
  assert.equal(parseQuery({ query: 'abc' }).error, 'Busca inválida.');
});

test('rejeita busca longa', () => {
  assert.equal(parseQuery({ query: 'a'.repeat(401) }).error, 'Busca muito longa.');
});

test('rejeita busca que não é string', () => {
  assert.equal(parseQuery({ query: 123 }).error, 'Busca inválida.');
});

test('rejeita corpo vazio', () => {
  assert.equal(parseQuery().error, 'Busca inválida.');
});
