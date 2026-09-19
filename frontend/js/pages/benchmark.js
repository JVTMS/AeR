/**
 * AeR — Benchmark (v1.0)
 * Testes de performance de CPU, Disco e RAM com histórico local.
 */

import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Benchmark';
const HISTORY_KEY = 'aer:benchmark:history';

// Limites para as barras de progresso visual (100% da barra)
const MAX_SCORE = { cpu: 5_000_000, disk: 3000, ram: 60 };

// ─── Mount / Unmount ─────────────────────────────────────────────────────────

export async function mount(container) {
  Logger.info(MODULE, 'Montando Benchmark...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root bench-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Benchmark</h1>
          <p class="dash-subtitle">Teste a performance real do seu hardware</p>
        </div>
        <button id="bench-run-all" class="btn-bench-all">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Executar Todos
        </button>
      </div>

      <!-- Cards de teste -->
      <div class="bench-cards">
        ${testCard('cpu',  '🖥️', 'CPU',  'Processador',  'SHA-256 hashes/s',     '~5 segundos')}
        ${testCard('disk', '💾', 'Disco', 'Armazenamento', 'Leitura/Escrita MB/s', '~10 segundos')}
        ${testCard('ram',  '🧠', 'RAM',  'Memória',       'Velocidade GB/s',      '~3 segundos')}
      </div>

      <!-- Histórico -->
      <div class="bench-history-section">
        <div class="bench-section-header">
          <h2 class="bench-section-title">Histórico de Resultados</h2>
          <button id="bench-clear-history" class="btn-clear-hist">Limpar Histórico</button>
        </div>
        <div id="bench-history" class="bench-history"></div>
      </div>
    </div>
  `;

  // Bind botões individuais
  container.querySelectorAll('.btn-bench-run').forEach(btn => {
    btn.addEventListener('click', () => runTest(btn.dataset.type));
  });

  // Executar todos
  container.querySelector('#bench-run-all').addEventListener('click', runAllTests);

  // Limpar histórico
  container.querySelector('#bench-clear-history').addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  renderHistory();
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando Benchmark...');
}

// ─── Template de card ─────────────────────────────────────────────────────────

function testCard(type, icon, title, subtitle, metric, duration) {
  return `
    <div class="bench-card" id="bench-card-${type}">
      <div class="bench-card-header">
        <span class="bench-card-icon">${icon}</span>
        <div>
          <div class="bench-card-title">${title}</div>
          <div class="bench-card-sub">${subtitle}</div>
        </div>
        <button class="btn-bench-run" data-type="${type}">Testar</button>
      </div>
      <div class="bench-card-body" id="bench-body-${type}">
        <div class="bench-idle">
          <div class="bench-metric-label">${metric}</div>
          <div class="bench-metric-value" id="bench-score-${type}">—</div>
          <div class="bench-bar-wrap">
            <div class="bench-bar" id="bench-bar-${type}" style="width:0%"></div>
          </div>
          <div class="bench-rating" id="bench-rating-${type}"></div>
          <div class="bench-duration">${duration}</div>
        </div>
      </div>
    </div>`;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

const RUNNING = new Set();

async function runTest(type) {
  if (RUNNING.has(type)) return;
  RUNNING.add(type);

  const btn     = document.querySelector(`.btn-bench-run[data-type="${type}"]`);
  const scoreEl = document.getElementById(`bench-score-${type}`);
  const barEl   = document.getElementById(`bench-bar-${type}`);
  const ratingEl= document.getElementById(`bench-rating-${type}`);
  const card    = document.getElementById(`bench-card-${type}`);

  if (btn)  { btn.disabled = true; btn.textContent = 'Testando...'; }
  if (card) card.classList.add('running');
  if (scoreEl) scoreEl.textContent = '…';
  if (barEl)   barEl.style.width = '0%';
  if (ratingEl) ratingEl.textContent = '';

  // Animação de progresso falsa enquanto aguarda
  let fakeProgress = 0;
  const fakeTimer = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 3, 90);
    if (barEl) barEl.style.width = fakeProgress + '%';
  }, 200);

  try {
    const payload = type === 'cpu' ? { durationSec: 5 } : {};
    const cmd     = `benchmark:${type}:start`;
    const result  = await invoke(cmd, payload);
    clearInterval(fakeTimer);
    displayResult(type, result);
    saveHistory(type, result);
    renderHistory();
  } catch (err) {
    clearInterval(fakeTimer);
    Logger.error(MODULE, `Erro no benchmark ${type}:`, err);
    if (scoreEl)  scoreEl.textContent = 'Erro';
    if (ratingEl) ratingEl.textContent = err?.message ?? 'Falha';
    if (barEl)    barEl.style.width = '0%';
  } finally {
    RUNNING.delete(type);
    if (btn)  { btn.disabled = false; btn.textContent = 'Testar'; }
    if (card) card.classList.remove('running');
  }
}

async function runAllTests() {
  const btn = document.getElementById('bench-run-all');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-bench"></span> Executando...'; }
  for (const type of ['cpu', 'disk', 'ram']) {
    await runTest(type);
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Executar Todos'; }
}

// ─── Exibição ─────────────────────────────────────────────────────────────────

function displayResult(type, r) {
  const scoreEl  = document.getElementById(`bench-score-${type}`);
  const barEl    = document.getElementById(`bench-bar-${type}`);
  const ratingEl = document.getElementById(`bench-rating-${type}`);

  const { label, barPct } = formatResult(type, r);
  const ratingCls = { Excelente: 'rat-excellent', Bom: 'rat-good', 'Médio': 'rat-mid', Fraco: 'rat-bad' }[r.rating] ?? '';

  if (scoreEl)  scoreEl.textContent = label;
  if (barEl)    { barEl.style.width = barPct + '%'; barEl.className = `bench-bar ${ratingCls}`; }
  if (ratingEl) { ratingEl.textContent = r.rating ?? ''; ratingEl.className = `bench-rating ${ratingCls}`; }
}

function formatResult(type, r) {
  let label = '—', barPct = 0;
  if (type === 'cpu') {
    const score = r.score ?? 0;
    label  = formatNum(score) + ' H/s';
    barPct = Math.min(100, (score / MAX_SCORE.cpu) * 100);
  } else if (type === 'disk') {
    const avg = r.score ?? 0;
    label  = `${avg} MB/s  (↑${r.writeMBps} / ↓${r.readMBps})`;
    barPct = Math.min(100, (avg / MAX_SCORE.disk) * 100);
  } else if (type === 'ram') {
    const score = r.score ?? 0;
    label  = score + ' GB/s';
    barPct = Math.min(100, (score / MAX_SCORE.ram) * 100);
  }
  return { label, barPct: Math.round(barPct) };
}

// ─── Histórico ────────────────────────────────────────────────────────────────

function saveHistory(type, result) {
  const history = loadHistory();
  history.unshift({ type, result, time: new Date().toISOString() });
  // Manter no máximo 30 entradas
  const trimmed = history.slice(0, 30);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch { }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function renderHistory() {
  const el = document.getElementById('bench-history');
  if (!el) return;
  const history = loadHistory();
  if (!history.length) {
    el.innerHTML = `<div class="bench-no-hist">Nenhum teste executado ainda. Execute um benchmark acima.</div>`;
    return;
  }

  const icons = { cpu: '🖥️', disk: '💾', ram: '🧠' };
  const labels = { cpu: 'CPU', disk: 'Disco', ram: 'RAM' };

  el.innerHTML = history.map(h => {
    const r = h.result;
    const { label } = formatResult(h.type, r);
    const time = new Date(h.time).toLocaleString('pt-BR');
    const ratingCls = { Excelente: 'rat-excellent', Bom: 'rat-good', 'Médio': 'rat-mid', Fraco: 'rat-bad' }[r.rating] ?? '';
    return `
      <div class="bench-hist-item">
        <span class="bench-hist-icon">${icons[h.type] ?? '📊'}</span>
        <span class="bench-hist-type">${labels[h.type] ?? h.type}</span>
        <span class="bench-hist-score">${label}</span>
        <span class="bench-hist-rating ${ratingCls}">${r.rating ?? ''}</span>
        <span class="bench-hist-time">${time}</span>
      </div>`;
  }).join('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('bench-styles')) return;
  const s = document.createElement('style');
  s.id = 'bench-styles';
  s.textContent = `
    .bench-page { display:flex; flex-direction:column; gap:var(--space-5); height:100%; overflow-y:auto; }
    .btn-bench-all { display:flex; align-items:center; gap:6px; background:var(--color-accent-primary); border:none; border-radius:var(--radius-sm); color:#000; cursor:pointer; padding:8px 18px; font-size:var(--text-sm); font-weight:600; transition:var(--transition-fast); }
    .btn-bench-all:hover { filter:brightness(1.1); }
    .btn-bench-all:disabled { opacity:.6; cursor:not-allowed; }

    /* Cards */
    .bench-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:var(--space-4); }
    .bench-card { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); padding:var(--space-5); transition:border-color var(--transition-fast); }
    .bench-card.running { border-color:var(--color-accent-primary); animation:bench-pulse 1.5s ease-in-out infinite; }
    @keyframes bench-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,255,136,0)} 50%{box-shadow:0 0 0 4px rgba(0,255,136,.15)} }
    .bench-card-header { display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-4); }
    .bench-card-icon { font-size:1.8rem; flex-shrink:0; }
    .bench-card-title { font-size:var(--text-base); font-weight:600; color:var(--color-text-primary); }
    .bench-card-sub { font-size:var(--text-xs); color:var(--color-text-muted); }
    .btn-bench-run { margin-left:auto; background:transparent; border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:5px 14px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-xs); font-weight:500; transition:var(--transition-fast); white-space:nowrap; }
    .btn-bench-run:hover { border-color:var(--color-accent-primary); color:var(--color-accent-primary); }
    .btn-bench-run:disabled { opacity:.5; cursor:not-allowed; }

    .bench-metric-label { font-size:var(--text-xs); color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:var(--space-2); }
    .bench-metric-value { font-size:1.6rem; font-weight:700; color:var(--color-text-primary); min-height:2rem; font-family:var(--font-mono); }
    .bench-bar-wrap { height:6px; background:var(--color-bg-surface-3); border-radius:3px; overflow:hidden; margin:var(--space-3) 0 var(--space-2); }
    .bench-bar { height:6px; border-radius:3px; background:var(--color-accent-primary); transition:width .6s ease; }
    .bench-bar.rat-excellent { background:#2ecc71; }
    .bench-bar.rat-good      { background:#3498db; }
    .bench-bar.rat-mid       { background:#f1c40f; }
    .bench-bar.rat-bad       { background:#e74c3c; }
    .bench-rating { font-size:var(--text-sm); font-weight:600; min-height:1.2rem; }
    .bench-rating.rat-excellent { color:#2ecc71; }
    .bench-rating.rat-good      { color:#3498db; }
    .bench-rating.rat-mid       { color:#f1c40f; }
    .bench-rating.rat-bad       { color:#e74c3c; }
    .bench-duration { font-size:var(--text-xs); color:var(--color-text-muted); margin-top:var(--space-2); }

    /* Histórico */
    .bench-history-section { display:flex; flex-direction:column; gap:var(--space-3); }
    .bench-section-header { display:flex; align-items:center; justify-content:space-between; }
    .bench-section-title { font-size:var(--text-base); font-weight:600; color:var(--color-text-primary); margin:0; }
    .btn-clear-hist { background:transparent; border:1px solid var(--color-border-subtle); color:var(--color-text-muted); padding:4px 12px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-xs); transition:var(--transition-fast); }
    .btn-clear-hist:hover { border-color:#e74c3c; color:#e74c3c; }
    .bench-history { display:flex; flex-direction:column; gap:var(--space-2); }
    .bench-hist-item { display:flex; align-items:center; gap:var(--space-4); background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-md); padding:10px 16px; font-size:var(--text-sm); }
    .bench-hist-icon { font-size:1.1rem; flex-shrink:0; }
    .bench-hist-type { font-weight:600; color:var(--color-text-primary); min-width:50px; }
    .bench-hist-score { color:var(--color-text-secondary); font-family:var(--font-mono); font-size:var(--text-xs); flex:1; }
    .bench-hist-rating { font-size:var(--text-xs); font-weight:600; min-width:70px; }
    .bench-hist-rating.rat-excellent { color:#2ecc71; }
    .bench-hist-rating.rat-good      { color:#3498db; }
    .bench-hist-rating.rat-mid       { color:#f1c40f; }
    .bench-hist-rating.rat-bad       { color:#e74c3c; }
    .bench-hist-time { font-size:var(--text-xs); color:var(--color-text-muted); margin-left:auto; white-space:nowrap; }
    .bench-no-hist { text-align:center; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); }

    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-bench { width:14px; height:14px; border:2px solid rgba(0,0,0,.3); border-top-color:#000; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}
