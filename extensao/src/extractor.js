// Executado DENTRO da página do painel do vendedor via chrome.scripting.executeScript.
// Precisa ser uma função autocontida: nada de variáveis ou imports de fora dela.
export function extractListings() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const host = location.hostname;
  const marketplace = /tiktok/i.test(host)
    ? 'TikTok Shop'
    : /shein|geiwohuo/i.test(host)
      ? 'Shein'
      : host;

  // Ordem importa: colunas mais específicas primeiro, "título" por último
  // (porque "Produto" costuma aparecer em vários cabeçalhos).
  const COLUMN_PATTERNS = [
    ['sku', /\bsku\b|c[oó]digo|seller sku/i],
    ['price', /pre[cç]o|price|valor/i],
    ['stock', /estoque|stock|invent[aá]rio|inventory|quantidade dispon/i],
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
    const headers = [...root.querySelectorAll('th, [role="columnheader"]')]
      .filter(isVisible)
      .map((h) => norm(h.innerText));

    const columnOf = {};
    const used = new Set();
    for (const [key, re] of COLUMN_PATTERNS) {
      const idx = headers.findIndex((h, i) => !used.has(i) && h && re.test(h));
      if (idx >= 0) {
        columnOf[key] = idx;
        used.add(idx);
      }
    }

    const rows = [...root.querySelectorAll('tbody tr, [role="row"]')].filter((r) =>
      isVisible(r) && r.querySelector('td, [role="gridcell"], [role="cell"]'),
    );

    return rows
      .map((row) => {
        const cells = [...row.querySelectorAll('td, [role="gridcell"], [role="cell"]')];
        const texts = cells.map((c) => norm(c.innerText));
        const at = (key) => (columnOf[key] !== undefined ? texts[columnOf[key]] || '' : '');

        let title = at('title');
        // A célula de produto costuma juntar nome + SKU + ID; o nome é a linha mais longa.
        if (title && columnOf.title !== undefined) {
          const lines = (cells[columnOf.title].innerText || '').split('\n').map(norm).filter(Boolean);
          if (lines.length > 1) title = lines.reduce((a, b) => (b.length > a.length ? b : a));
        }
        if (!title) title = texts.reduce((a, b) => (b.length > a.length ? b : a), '');

        return {
          title,
          sku: at('sku'),
          price: at('price'),
          stock: at('stock'),
          sales: at('sales'),
          status: at('status'),
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
