// Regras de avaliação dos anúncios. São recomendações gerais de boas práticas,
// não os limites oficiais das plataformas — ajuste os valores conforme sua realidade.
export const LIMITS = {
  titleMin: 25,
  titleMax: 150,
  lowStock: 5,
  minImagesSingle: 5,
  descriptionMin: 100,
};

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

export function evaluateListing(listing, { mode = 'list' } = {}) {
  const issues = [];
  const add = (severity, message) => issues.push({ severity, message });
  const title = (listing.title || '').trim();

  if (!title) {
    add('critical', 'Anúncio sem título.');
  } else {
    if (title.length < LIMITS.titleMin) {
      add('warning', `Título curto (${title.length} caracteres). Inclua marca, tipo de produto e características principais.`);
    }
    if (title.length > LIMITS.titleMax) {
      add('warning', `Título muito longo (${title.length} caracteres). Títulos longos são cortados na busca.`);
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
    const stock = parseNumber(listing.stock);
    if (stock !== null && stock <= 0) add('critical', 'Sem estoque — o anúncio não vende.');
    else if (stock !== null && stock < LIMITS.lowStock) add('warning', `Estoque baixo (${stock}).`);
  }

  if (listing.sales !== '' && listing.sales !== undefined && parseNumber(listing.sales) === 0) {
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

export function toCsv(listings) {
  const cols = ['score', 'title', 'sku', 'price', 'stock', 'sales', 'status', 'images', 'issues'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = listings.map((l) =>
    cols
      .map((c) => (c === 'issues' ? l.issues.map((i) => `[${i.severity}] ${i.message}`).join(' | ') : l[c]))
      .map(esc)
      .join(';'),
  );
  return [cols.join(';'), ...lines].join('\n');
}
