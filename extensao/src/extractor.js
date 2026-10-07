// Executado DENTRO da página do painel do vendedor via chrome.scripting.executeScript.
// Precisa ser uma função autocontida: nada de variáveis ou imports de fora dela.
export function extractListings() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const host = location.hostname;
  const isUpSeller = /upseller/i.test(host);

  // No UpSeller, o marketplace vem do caminho: /products/shopee/active, /products/tiktok/active...
  const MARKETPLACES = [
    [/mercado|meli|\bml\b/i, 'Mercado Livre'],
    [/shopee/i, 'Shopee'],
    [/shein|geiwohuo/i, 'Shein'],
    [/tiktok/i, 'TikTok Shop'],
    [/temu/i, 'Temu'],
    [/kwai/i, 'Kwai Shop'],
  ];
  const source = isUpSeller ? location.pathname : host;
  const found = MARKETPLACES.find(([re]) => re.test(source));
  const marketplace = found ? found[1] + (isUpSeller ? ' (UpSeller)' : '') : host;

  // Ordem importa: colunas mais específicas primeiro, "título" por último
  // (porque "Produto" costuma aparecer em vários cabeçalhos).
  const COLUMN_PATTERNS = [
    ['sku', /\bsku\b|c[oó]digo|seller sku/i],
    ['promoPrice', /pre[cç]o com|promo|desconto|discount|sale price/i],
    ['price', /pre[cç]o|price|valor/i],
    ['stock', /estoque|stock|invent[aá]rio|inventory|quantidade/i],
    ['sales', /vendid|vendas|sold|sales|pedidos/i],
    ['status', /status|situa[cç][aã]o/i],
    ['title', /produto|product|nome|name|t[ií]tulo|title|item|an[uú]ncio/i],
  ];

  const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  // Muitas bibliotecas de UI (Arco, Ant Design) separam o cabeçalho e o corpo
  // da tabela em dois <table>. Subimos até achar um ancestral que tenha os dois.
  function findGridRoot(start) {
    let el = start;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
      const hasHeader = el.querySelector('th, [role="columnheader"]');
      const hasRows = el.querySelector('tbody tr td, [role="row"] [role="gridcell"], [role="row"] [role="cell"]');
      if (hasHeader && hasRows) return el;
    }
    return null;
  }

  function readGrid(root) {
    const headerEls = [...root.querySelectorAll('th, [role="columnheader"]')].filter(isVisible);
    const headers = headerEls.map((h) => norm(h.innerText));

    const columnOf = {};
    const used = new Set();
    for (const [key, re] of COLUMN_PATTERNS) {
      const idx = headers.findIndex((h, i) => !used.has(i) && h && re.test(h));
      if (idx >= 0) {
        columnOf[key] = idx;
        used.add(idx);
      }
    }

    // Ignora linhas aninhadas (ex.: variantes expandidas dentro de uma célula).
    const rows = [...root.querySelectorAll('tbody tr, [role="row"]')].filter((r) =>
      isVisible(r) &&
      r.querySelector('td, [role="gridcell"], [role="cell"]') &&
      !r.parentElement.closest('td, [role="gridcell"], [role="cell"]'),
    );
    const cellsOf = (row) => {
      const direct = [...row.querySelectorAll(':scope > td')];
      return direct.length ? direct : [...row.querySelectorAll('[role="gridcell"], [role="cell"]')];
    };
    // "-" significa vazio; preço/estoque sem número (ex.: botão "+ Adicionar") também.
    const clean = (v) => (/^[-–—]*$/.test(v) ? '' : v);
    const numeric = (v) => (/\d/.test(v) ? v : '');
    const countIn = (text, re) => {
      const m = text.match(re);
      return m ? m[1] : '';
    };

    return rows
      .map((row) => {
        const allCells = cellsOf(row);
        // Se o número de células não bate com o de cabeçalhos (ex.: foto sem cabeçalho),
        // casa cada coluna com a célula que está embaixo do cabeçalho na tela.
        const cellFor = (idx) => {
          if (allCells.length === headerEls.length) return allCells[idx];
          const h = headerEls[idx].getBoundingClientRect();
          const center = h.left + h.width / 2;
          return (
            allCells.find((c) => {
              const r = c.getBoundingClientRect();
              return r.width && r.left <= center && center <= r.right;
            }) || allCells[idx]
          );
        };
        const cells = [];
        for (const idx of Object.values(columnOf)) cells[idx] = cellFor(idx);
        const texts = allCells.map((c) => norm(c.innerText));
        const at = (key) => (columnOf[key] !== undefined ? norm(cells[columnOf[key]]?.innerText) : '');
        const rowText = texts.join(' ');

        let title = at('title');
        let store = '';
        if (title && columnOf.title !== undefined) {
          const lines = (cells[columnOf.title]?.innerText || '')
            .split('\n')
            .map(norm)
            .filter((l) => l && !/^variantes?\b/i.test(l));
          if (isUpSeller) {
            // UpSeller: 1ª linha = nome do anúncio, 2ª linha = nome da loja.
            title = lines[0] || title;
            store = lines[1] || '';
          } else if (lines.length > 1) {
            // A célula de produto costuma juntar nome + SKU + ID; o nome é a linha mais longa.
            title = lines.reduce((a, b) => (b.length > a.length ? b : a));
          }
        }
        if (!title) title = texts.reduce((a, b) => (b.length > a.length ? b : a), '');

        // SKU no UpSeller vem com o ID do anúncio embaixo: 1ª linha = SKU, número longo = ID.
        const skuLines = (columnOf.sku !== undefined ? cells[columnOf.sku]?.innerText || '' : '')
          .split('\n')
          .map(norm);
        const sku = skuLines[0] || '';
        const listingId = skuLines.slice(1).find((l) => /^\d{6,}$/.test(l)) || '';

        return {
          title,
          store,
          sku: clean(sku),
          listingId,
          price: numeric(at('price')),
          promoPrice: numeric(at('promoPrice')),
          stock: numeric(at('stock')),
          // "Desempenho" do UpSeller: "Vendas: 0 Eu gosto: 0 Visitas: 2"
          sales: at('sales') || countIn(rowText, /vendas?\s*:\s*([\d.,]+)/i),
          likes: countIn(rowText, /eu gosto\s*:\s*([\d.,]+)/i),
          visits: countIn(rowText, /visitas?\s*:\s*([\d.,]+)/i),
          variants: countIn(rowText, /variantes?\s*\((\d+)\)/i),
          status: clean(at('status')),
          images: row.querySelectorAll('img').length,
        };
      })
      .filter((l) => l.title);
  }

  // 1) Modo lista: tabelas de produtos.
  const roots = new Set();
  for (const cell of document.querySelectorAll('th, [role="columnheader"]')) {
    const root = findGridRoot(cell);
    if (root) roots.add(root);
  }
  // Evita contar a mesma tabela duas vezes quando um root contém outro.
  const outerRoots = [...roots].filter((r) => ![...roots].some((o) => o !== r && o.contains(r)));
  const listings = outerRoots.flatMap(readGrid);
  if (listings.length) {
    return { marketplace, url: location.href, mode: 'list', listings };
  }

  // 2) Modo anúncio único: página de edição/criação de produto.
  const fieldByHint = (re, selector) =>
    [...document.querySelectorAll(selector)].find((el) => {
      const label = el.closest('[class*="form-item"], [class*="FormItem"], label, div')?.innerText || '';
      return re.test([el.name, el.id, el.placeholder, el.getAttribute('aria-label'), label].join(' '));
    });

  const titleEl = fieldByHint(/t[ií]tulo|title|nome do produto|product name/i, 'input[type="text"], input:not([type]), textarea');
  if (titleEl) {
    const descEl = fieldByHint(/descri[cç][aã]o|description/i, 'textarea, [contenteditable="true"]');
    const uploadArea = document.querySelector('[class*="upload"]');
    const images = uploadArea
      ? uploadArea.closest('[class*="form-item"], section, form')?.querySelectorAll('img').length ?? 0
      : 0;
    return {
      marketplace,
      url: location.href,
      mode: 'single',
      listings: [
        {
          title: norm(titleEl.value || titleEl.innerText),
          description: norm(descEl ? descEl.value ?? descEl.innerText : ''),
          images,
          price: '',
          stock: '',
          sales: '',
          status: '',
          sku: '',
        },
      ],
    };
  }

  return { marketplace, url: location.href, mode: 'none', listings: [] };
}
