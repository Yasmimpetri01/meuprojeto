import { extractListings } from './src/extractor.js';
import { evaluateAll, toCsv } from './src/rules.js';

const $ = (id) => document.getElementById(id);
let lastReport = null;

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = !text;
}

function scoreClass(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'mid';
  return 'bad';
}

function render(report) {
  lastReport = report;
  const { summary, listings, marketplace, url, analyzedAt } = report;

  $('summary').hidden = false;
  $('export').disabled = !listings.length;
  $('meta').textContent = `${marketplace} · ${new Date(analyzedAt).toLocaleString('pt-BR')} · ${url}`;
  $('total').textContent = summary.total;
  $('avg').textContent = summary.averageScore;
  $('critical').textContent = summary.withCritical;
  $('warning').textContent = summary.withWarning;

  const onlyProblems = $('onlyProblems').checked;
  const list = $('results');
  list.replaceChildren();

  for (const l of listings) {
    if (onlyProblems && !l.issues.length) continue;
    const li = document.createElement('li');

    const row = document.createElement('div');
    row.className = 'row';
    const score = document.createElement('span');
    score.className = `score ${scoreClass(l.score)}`;
    score.textContent = l.score;
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = l.title || '(sem título)';
    row.append(score, title);

    const details = document.createElement('div');
    details.className = 'details';
    details.textContent = [
      l.sku && `SKU ${l.sku}`,
      l.price && `Preço ${l.price}`,
      l.stock && `Estoque ${l.stock}`,
      l.sales && `Vendas ${l.sales}`,
      l.status && `Status ${l.status}`,
    ].filter(Boolean).join(' · ');

    const issues = document.createElement('ul');
    issues.className = 'issues';
    for (const issue of l.issues) {
      const item = document.createElement('li');
      item.className = issue.severity;
      item.textContent = issue.message;
      issues.append(item);
    }

    li.append(row);
    if (details.textContent) li.append(details);
    if (l.issues.length) li.append(issues);
    list.append(li);
  }

  if (onlyProblems && !list.children.length && listings.length) {
    showMessage('Nenhum problema encontrado nos anúncios desta página. 🎉');
  }
}

async function analyze() {
  showMessage('');
  $('analyze').disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractListings,
    });

    if (!result || !result.listings.length) {
      showMessage(
        'Não encontrei anúncios nesta página. Abra a lista de produtos (Gerenciar produtos) ' +
          'ou a página de edição de um anúncio e tente de novo.',
      );
      return;
    }

    const report = {
      ...evaluateAll(result.listings, { mode: result.mode }),
      marketplace: result.marketplace,
      url: result.url,
      mode: result.mode,
      analyzedAt: Date.now(),
    };
    await chrome.storage.local.set({ lastReport: report });
    render(report);
  } catch (err) {
    showMessage(`Não foi possível ler esta página: ${err.message}`);
  } finally {
    $('analyze').disabled = false;
  }
}

function exportCsv() {
  if (!lastReport) return;
  // BOM para o Excel abrir os acentos corretamente.
  const blob = new Blob(['﻿' + toCsv(lastReport.listings)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const stamp = new Date(lastReport.analyzedAt).toISOString().slice(0, 10);
  a.download = `anuncios-${lastReport.marketplace.replace(/\s+/g, '-').toLowerCase()}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('analyze').addEventListener('click', analyze);
$('export').addEventListener('click', exportCsv);
$('onlyProblems').addEventListener('change', () => {
  showMessage('');
  if (lastReport) render(lastReport);
});

// Mostra a última análise ao reabrir o popup.
chrome.storage.local.get('lastReport').then(({ lastReport: saved }) => {
  if (saved) render(saved);
});
