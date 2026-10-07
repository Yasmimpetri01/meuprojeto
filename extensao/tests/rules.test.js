import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, evaluateListing, evaluateAll, toCsv } from '../src/rules.js';

test('parseNumber entende formatos BR e internacionais', () => {
  assert.equal(parseNumber('R$ 1.234,56'), 1234.56);
  assert.equal(parseNumber('$1,234.56'), 1234.56);
  assert.equal(parseNumber('R$ 49,90'), 49.9);
  assert.equal(parseNumber('1.234'), 1234);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('0 un.'), 0);
  assert.equal(parseNumber('--'), null);
});

test('anúncio bom não tem problemas', () => {
  const r = evaluateListing({
    title: 'Fone de Ouvido Bluetooth 5.3 Sem Fio com Cancelamento de Ruído',
    price: 'R$ 129,90', stock: '50', sales: '12', status: 'Ativo', images: 1,
  });
  assert.deepEqual(r.issues, []);
  assert.equal(r.score, 100);
});

test('detecta sem estoque, título curto, maiúsculas e status reprovado', () => {
  const r = evaluateListing({ title: 'CAMISETA PRETA', price: '0', stock: '0', sales: '0', status: 'Reprovado', images: 0 });
  const msgs = r.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /Título curto/);
  assert.match(msgs, /MAIÚSCULAS/);
  assert.match(msgs, /Sem estoque/);
  assert.match(msgs, /Preço ausente/);
  assert.match(msgs, /Reprovado/);
  assert.equal(r.score, 0);
});

test('modo anúncio único cobra imagens e descrição', () => {
  const r = evaluateListing({ title: 'Vestido Midi Floral Manga Curta Feminino Verão', images: 2, description: 'Lindo.' }, { mode: 'single' });
  const msgs = r.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /Apenas 2 imagem/);
  assert.match(msgs, /Descrição curta/);
});

test('evaluateAll marca duplicados, ordena do pior para o melhor e gera CSV', () => {
  const t = 'Tênis Esportivo Masculino Corrida Leve Confortável';
  const report = evaluateAll([
    { title: t, price: '99', stock: '10', images: 1 },
    { title: t, price: '99', stock: '0', images: 1 },
    { title: 'Mochila Escolar Impermeável Grande 30 Litros', price: '80', stock: '20', images: 1 },
  ]);
  assert.equal(report.summary.total, 3);
  assert.equal(report.summary.withCritical, 1);
  assert.equal(report.listings[0].stock, '0');
  assert.ok(report.listings[0].issues.some((i) => /duplicado/.test(i.message)));
  assert.equal(report.listings.at(-1).score, 100);
  assert.match(toCsv(report.listings), /^score;title;/);
});
