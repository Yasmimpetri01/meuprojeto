// Regras de avaliação dos anúncios. São recomendações gerais de boas práticas,
// não os limites oficiais das plataformas — ajuste os valores conforme sua realidade.
export const LIMITS = {
  titleMin: 25,
  titleMax: 150,
  lowStock: 5,
  minImagesSingle: 5,
  descriptionMin: 100,
  // Visitas sem nenhuma venda a partir das quais o anúncio tem problema de conversão.
  visitsWithoutSales: 30,
};

// Limites de título por marketplace (o Mercado Livre corta em 60 caracteres).
export const TITLE_MAX_BY_MARKETPLACE = {
  'Mercado Livre': 60,
  Shopee: 120,
};

function titleMaxFor(marketplace = '') {
  const key = Object.keys(TITLE_MAX_BY_MARKETPLACE).find((m) => marketplace.startsWith(m));
  return key ? TITLE_MAX_BY_MARKETPLACE[key] : LIMITS.titleMax;
}

const PENALTY = { critical: 30, warning: 10, info: 2 };

const BAD_STATUS = /rejeitad|reprovad|recusad|rejected|failed|suspens|suspended|bloquead|banned|violat|infra[cç]/i;
const INACTIVE_STATUS = /inativ|desativ|deactivat|inactive|offline|delisted|fora do ar/i;
const DRAFT_STATUS = /rascunho|draft/i;

// Converte "R$ 1.234,56", "1,234.56", "12 un." etc. em número. Retorna null se não houver número.
export function parseNumber(text) {
  if (text === null || text === undefined) return null;
  const m = String(text).match(/-?\d[\d.,]*/);
  if (!m) return null;
  let s = m[0];
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // "1,234" → milhar; "12,5" / "12,50" → decimal
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    // "1.234" → milhar (padrão BR); "12.5" / "12.50" → decimal
    if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Estoque pode vir dividido, ex. Shopee: "FBS 0 Vendedor 451". Soma todas as partes.
export function parseStock(text) {
  const parts = String(text ?? '').match(/-?\d[\d.,]*/g);
  if (!parts) return null;
  return parts.reduce((sum, p) => sum + (parseNumber(p) ?? 0), 0);
}

export function evaluateListing(listing, { mode = 'list', marketplace = '' } = {}) {
  const issues = [];
  const add = (severity, message) => issues.push({ severity, message });
  const title = (listing.title || '').trim();

  if (!title) {
    add('critical', 'Anúncio sem título.');
  } else {
    if (title.length < LIMITS.titleMin) {
      add('warning', `Título curto (${title.length} caracteres). Inclua marca, tipo de produto e características principais.`);
    }
    const titleMax = titleMaxFor(marketplace);
    if (title.length > titleMax) {
      add('warning', `Título muito longo (${title.length} caracteres; limite recomendado ${titleMax}). Títulos longos são cortados.`);
    }
    const letters = title.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letters.length >= 10 && letters === letters.toUpperCase()) {
      add('warning', 'Título todo em MAIÚSCULAS. Isso prejudica a leitura e pode violar regras da plataforma.');
    }
    const counts = {};
    for (const w of title.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []) counts[w] = (counts[w] || 0) + 1;
    const repeated = Object.keys(counts).filter((w) => counts[w] >= 3);
    if (repeated.length) {
      add('warning', `Palavra repetida no título (${repeated.join(', ')}). Repetição excessiva é vista como spam de palavras-chave.`);
    }
  }

  if (listing.price !== '' && listing.price !== undefined) {
    const price = parseNumber(listing.price);
    if (price === null || price <= 0) add('critical', 'Preço ausente ou zerado.');
  }

  if (listing.stock !== '' && listing.stock !== undefined) {
    const stock = parseStock(listing.stock);
    if (stock !== null && stock <= 0) add('critical', 'Sem estoque — o anúncio não vende.');
    else if (stock !== null && stock < LIMITS.lowStock) add('warning', `Estoque baixo (${stock}).`);
  }

  const price = parseNumber(listing.price);
  const promoPrice = parseNumber(listing.promoPrice);
  if (price && promoPrice && promoPrice > price) {
    add('warning', 'Preço com desconto maior que o preço original.');
  }

  const sales = listing.sales !== '' && listing.sales !== undefined ? parseNumber(listing.sales) : null;
  const visits = listing.visits !== '' && listing.visits !== undefined ? parseNumber(listing.visits) : null;
  if (sales === 0 && visits !== null && visits >= LIMITS.visitsWithoutSales) {
    add('warning', `${visits} visitas e nenhuma venda: o anúncio atrai, mas não converte. Revise preço, fotos, frete e descrição.`);
  } else if (sales === 0 && visits === 0) {
    add('info', 'Nenhuma visita ainda. Melhore palavras-chave do título ou impulsione o anúncio.');
  } else if (sales === 0) {
    add('info', 'Nenhuma venda registrada. Revise preço, fotos e título.');
  }

  const status = listing.status || '';
  if (BAD_STATUS.test(status)) add('critical', `Status com problema: "${status}".`);
  else if (INACTIVE_STATUS.test(status)) add('warning', `Anúncio inativo: "${status}".`);
  else if (DRAFT_STATUS.test(status)) add('info', 'Anúncio ainda em rascunho.');

  if (mode === 'list') {
    if (listing.images === 0) add('warning', 'Nenhuma imagem visível na lista.');
  } else {
    if (listing.images === 0) add('critical', 'Anúncio sem imagens.');
    else if (listing.images < LIMITS.minImagesSingle) {
      add('warning', `Apenas ${listing.images} imagem(ns). Recomendado: ${LIMITS.minImagesSingle} ou mais.`);
    }
    const desc = listing.description || '';
    if (!desc) add('warning', 'Descrição não encontrada ou vazia.');
    else if (desc.length < LIMITS.descriptionMin) {
      add('warning', `Descrição curta (${desc.length} caracteres). Detalhe medidas, material e uso.`);
    }
  }

  const score = Math.max(0, issues.reduce((s, i) => s - PENALTY[i.severity], 100));
  return { ...listing, issues, score };
}

export function evaluateAll(listings, options) {
  const evaluated = listings.map((l) => evaluateListing(l, options));

  // Títulos duplicados competem entre si na busca.
  const byTitle = {};
  for (const l of evaluated) {
    const key = (l.title || '').toLowerCase().trim();
    if (key) (byTitle[key] ||= []).push(l);
  }
  for (const group of Object.values(byTitle)) {
    if (group.length > 1) {
      for (const l of group) {
        l.issues.push({ severity: 'warning', message: `Título duplicado em ${group.length} anúncios.` });
        l.score = Math.max(0, l.score - PENALTY.warning);
      }
    }
  }

  evaluated.sort((a, b) => a.score - b.score);
  const count = (sev) => evaluated.filter((l) => l.issues.some((i) => i.severity === sev)).length;
  return {
    listings: evaluated,
    summary: {
      total: evaluated.length,
      averageScore: evaluated.length
        ? Math.round(evaluated.reduce((s, l) => s + l.score, 0) / evaluated.length)
        : 0,
      withCritical: count('critical'),
      withWarning: count('warning'),
    },
  };
}

const SMALL_WORDS = new Set(
  'a o as os ao aos à às de da do das dos e em no na nos nas com sem para pra por ou até um uma'.split(' '),
);
const ACRONYMS = new Set(['UV', 'FPS', 'LED', 'USB', 'TV', 'PVC', 'EVA', 'ABS', 'DIY', 'BB']);

function fixWordCase(word, isFirst) {
  return word
    .split('-')
    .map((part, i) => {
      if (!part) return part;
      if (/\d/.test(part) || ACRONYMS.has(part)) return part; // UV50+, 100%, 4
      // Siglas e tamanhos sem vogal: RN, P, M, G, GG, PP
      if (/^[A-Z]{1,3}$/.test(part) && !/[AEIOU]/.test(part)) return part;
      const lower = part.toLocaleLowerCase('pt-BR');
      if (!(isFirst && i === 0) && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join('-');
}

// Sugere um título corrigido e lista o que ainda precisa de revisão manual.
export function suggestTitle(title, { marketplace = '', duplicates = 0 } = {}) {
  const original = (title || '').replace(/\s+/g, ' ').trim();
  let suggested = original;
  const changes = [];
  const review = [];

  const letters = original.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length >= 10 && letters === letters.toUpperCase()) {
    suggested = original
      .split(' ')
      .map((w, i) => fixWordCase(w, i === 0))
      .join(' ');
    changes.push('Maiúsculas convertidas');
  }

  if (duplicates > 1) {
    review.push(`Título igual em ${duplicates} anúncios: diferencie (cor, tamanho, quantidade, modelo)`);
  }
  const max = titleMaxFor(marketplace);
  if (suggested.length > max) review.push(`Acima de ${max} caracteres: encurte`);
  if (suggested.length < LIMITS.titleMin) review.push('Título curto: acrescente características');
  const counts = {};
  for (const w of suggested.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []) counts[w] = (counts[w] || 0) + 1;
  const repeated = Object.keys(counts).filter((w) => counts[w] >= 3);
  if (repeated.length) review.push(`Palavra repetida: ${repeated.join(', ')}`);

  return { suggested, changes, review };
}

// Planilha só com os anúncios cujo título precisa de ajuste.
export function toTitlesCsv(listings, marketplace = '') {
  const byTitle = {};
  for (const l of listings) {
    const key = (l.title || '').toLowerCase().trim();
    byTitle[key] = (byTitle[key] || 0) + 1;
  }
  const header = [
    'Marketplace', 'Loja', 'ID do anúncio', 'SKU', 'Título atual', 'Título sugerido',
    'Caracteres', 'O que mudou', 'Revisar manualmente',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [];
  for (const l of listings) {
    const duplicates = byTitle[(l.title || '').toLowerCase().trim()];
    const { suggested, changes, review } = suggestTitle(l.title, { marketplace, duplicates });
    if (!changes.length && !review.length) continue;
    rows.push(
      [marketplace, l.store, l.listingId, l.sku, l.title, suggested, suggested.length, changes.join(' | '), review.join(' | ')]
        .map(esc)
        .join(';'),
    );
  }
  return { csv: [header.join(';'), ...rows].join('\n'), count: rows.length };
}

export function toCsv(listings) {
  const cols = ['score', 'title', 'store', 'listingId', 'sku', 'price', 'promoPrice', 'stock', 'sales', 'visits', 'likes', 'variants', 'status', 'issues'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = listings.map((l) =>
    cols
      .map((c) => (c === 'issues' ? l.issues.map((i) => `[${i.severity}] ${i.message}`).join(' | ') : l[c]))
      .map(esc)
      .join(';'),
  );
  return [cols.join(';'), ...lines].join('\n');
}
