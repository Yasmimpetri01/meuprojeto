import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, parseStock, suggestTitle, toTitlesCsv, evaluateListing, evaluateAll, toCsv } from '../src/rules.js';

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

test('visitas sem vendas, desconto invertido e limite do Mercado Livre', () => {
  const r = evaluateListing(
    {
      title: 'Conjunto Bebê Menina Verão Algodão Estampado Body e Shorts Rosa',
      price: 'R$ 65,99', promoPrice: 'R$ 69,98', stock: '1200', sales: '0', visits: '45', images: 1,
    },
    { marketplace: 'Mercado Livre (UpSeller)' },
  );
  const msgs = r.issues.map((i) => i.message).join('\n');
  assert.match(msgs, /limite recomendado 60/);
  assert.match(msgs, /45 visitas e nenhuma venda/);
  assert.match(msgs, /desconto maior/);
});

test('estoque dividido (FBS + Vendedor) é somado', () => {
  assert.equal(parseStock('FBS 0 Vendedor 451'), 451);
  assert.equal(parseStock('1.200 ∨'), 1200);
  assert.equal(parseStock('FBS 0 Vendedor 0'), 0);
  const r = evaluateListing({ title: 'Kit 3 Extensor de Body Bebê Menina Alongador 4 Botões', stock: 'FBS 0 Vendedor 451', images: 1 });
  assert.ok(!r.issues.some((i) => /Sem estoque/.test(i.message)));
});

test('sugere título sem maiúsculas preservando siglas, números e tamanhos', () => {
  const { suggested, changes } = suggestTitle('KIT 3 BODY BEBÊ MENINA PROTEÇÃO SOLAR UV50+ CORES NEON VERÃO PRAIA PISCINA');
  assert.equal(suggested, 'Kit 3 Body Bebê Menina Proteção Solar UV50+ Cores Neon Verão Praia Piscina');
  assert.deepEqual(changes, ['Maiúsculas convertidas']);
  assert.equal(
    suggestTitle('KIT 2 OU 3 BODY BEBÊ RN P M G DE ALGODÃO COM FPS 50 MEIA-CALÇA').suggested,
    'Kit 2 ou 3 Body Bebê RN P M G de Algodão com FPS 50 Meia-Calça',
  );
});

test('planilha de títulos traz só os que precisam de ajuste e marca duplicados', () => {
  const t = 'KIT 3 BODY BEBÊ MENINA PROTEÇÃO SOLAR UV50+ CORES NEON VERÃO PRAIA PISCINA';
  const { csv, count } = toTitlesCsv(
    [
      { title: t, store: 'ZIPZAPBABY TIKTOK', listingId: '1737651492504438728' },
      { title: t, store: 'ZIPZAPBABY TIKTOK', listingId: '1737836918943942600' },
      { title: 'Conjunto Bebê Menina Verão Body e Shorts Algodão', store: 'ZIPZAPBABY TIKTOK' },
    ],
    'TikTok Shop (UpSeller)',
  );
  assert.equal(count, 2);
  assert.match(csv, /1737651492504438728/);
  assert.match(csv, /Título igual em 2 anúncios/);
  assert.match(csv.split('\n')[0], /^Marketplace;Loja;ID do anúncio/);
});
