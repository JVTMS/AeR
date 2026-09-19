/**
 * AeR — Diagnóstico (v1.0)
 * Score de saúde do sistema + eventos críticos do Windows Event Log.
 */

import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Diagnostics';

// ─── Mount ────────────────────────────────────────────────────────────────────

export async function mount(container) {
  Logger.info(MODULE, 'Montando Diagnóstico...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root diag-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Diagnóstico</h1>
          <p class="dash-subtitle">Saúde do sistema e eventos críticos</p>
        </div>
        <button id="diag-refresh" class="btn-diag-refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Atualizar
        </button>
      </div>

      <!-- Score de Saúde -->
      <div class="diag-health-row" id="diag-health-row">
        <div class="diag-loading"><span class="spinner-diag"></span> Analisando sistema...</div>
      </div>

      <!-- Cards de detalhe -->
      <div class="diag-cards" id="diag-cards" style="display:none"></div>

      <!-- Eventos do sistema -->
      <div class="diag-events-section">
        <div class="diag-section-header">
          <h2 class="diag-section-title">Eventos Críticos — Últimas 24h</h2>
          <div class="diag-events-filters">
            <button class="diag-evt-filter active" data-type="all">Todos</button>
            <button class="diag-evt-filter" data-type="Error">Erros</button>
            <button class="diag-evt-filter" data-type="Warning">Avisos</button>
          </div>
        </div>
        <div id="diag-events-list" class="diag-events-list">
          <div class="diag-loading"><span class="spinner-diag"></span> Carregando eventos...</div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#diag-refresh').addEventListener('click', () => loadAll());

  container.querySelectorAll('.diag-evt-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.diag-evt-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEvents(btn.dataset.type);
    });
  });

  loadAll();
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando Diagnóstico...');
}

// ─── Estado ───────────────────────────────────────────────────────────────────

let allEvents = [];

// ─── Carregamento ─────────────────────────────────────────────────────────────

async function loadAll() {
  const [healthResult, eventsResult] = await Promise.allSettled([
    invoke('diagnostics:health'),
    invoke('diagnostics:events'),
  ]);

  if (healthResult.status === 'fulfilled') renderHealth(healthResult.value);
  else renderHealthError();

  if (eventsResult.status === 'fulfilled') {
    allEvents = eventsResult.value ?? [];
    renderEvents('all');
  } else renderEventsError();
}

// ─── Saúde ────────────────────────────────────────────────────────────────────

function renderHealth(data) {
  const row   = document.getElementById('diag-health-row');
  const cards = document.getElementById('diag-cards');
  if (!row || !data) return;

  const score      = data.score ?? 0;
  const statusMap  = { Saudavel: { label: 'Saudável', cls: 'health-good' }, Atencao: { label: 'Atenção', cls: 'health-warn' }, Critico: { label: 'Crítico', cls: 'health-bad' } };
  const st         = statusMap[data.status] ?? { label: data.status, cls: 'health-warn' };
  const arc        = scoreToArc(score);

  row.innerHTML = `
    <div class="diag-score-card ${st.cls}">
      <svg class="diag-gauge" viewBox="0 0 120 70">
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--color-border-subtle)" stroke-width="10" stroke-linecap="round"/>
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${arc} 157" class="diag-gauge-fill"/>
      </svg>
      <div class="diag-score-number">${Math.round(score)}</div>
      <div class="diag-score-label">${st.label}</div>
    </div>
    <div class="diag-issues">
      ${data.issues?.length
        ? data.issues.map(i => `<div class="diag-issue-item">⚠️ ${i}</div>`).join('')
        : '<div class="diag-issue-ok">✅ Sistema sem problemas detectados</div>'}
      <div class="diag-uptime">Uptime: ${formatUptime(data.details?.uptimeHours ?? 0)}</div>
    </div>`;

  if (cards && data.details) {
    cards.style.display = 'grid';
    const d = data.details;
    cards.innerHTML = `
      ${metricCard('CPU', d.cpu?.percent ?? 0, d.cpu?.score ?? 0, '%', 'var(--color-accent-primary)')}
      ${metricCard('RAM', d.ram?.percent ?? 0, d.ram?.score ?? 0, '%', '#9b59b6',
          `${d.ram?.usedGb?.toFixed(1)} / ${d.ram?.totalGb?.toFixed(1)} GB`)}
      ${metricCard('Disco Livre', 100 - (d.disk?.freeGb / Math.max(d.disk?.totalGb, 1) * 100), d.disk?.score ?? 0,
          '%', '#e67e22', `${d.disk?.freeGb?.toFixed(1)} GB livres`)}
      ${metricCard('Atividade Disco', d.disk?.activity ?? 0, 100 - (d.disk?.activity ?? 0), '%', '#e74c3c')}`;
  }
}

function metricCard(name, value, score, unit, color, sub = '') {
  const barW = Math.min(100, Math.round(value));
  return `
    <div class="diag-metric-card">
      <div class="diag-metric-header">
        <span class="diag-metric-name">${name}</span>
        <span class="diag-metric-score" style="color:${color}">${Math.round(value)}${unit}</span>
      </div>
      <div class="diag-bar-wrap">
        <div class="diag-bar" style="width:${barW}%;background:${color}"></div>
      </div>
      ${sub ? `<div class="diag-metric-sub">${sub}</div>` : ''}
    </div>`;
}

function renderHealthError() {
  const row = document.getElementById('diag-health-row');
  if (row) row.innerHTML = `<div class="diag-error">⚠️ Não foi possível obter dados de saúde.</div>`;
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function renderEvents(filterType = 'all') {
  const list = document.getElementById('diag-events-list');
  if (!list) return;

  const filtered = filterType === 'all'
    ? allEvents
    : allEvents.filter(e => e.type === filterType);

  if (!filtered.length) {
    list.innerHTML = `<div class="diag-no-events">${filterType === 'all' ? '✅ Nenhum evento crítico nas últimas 24h.' : 'Nenhum evento desse tipo.'}</div>`;
    return;
  }

  list.innerHTML = filtered.map(e => {
    const isErr  = e.type === 'Error';
    const time   = new Date(e.time).toLocaleString('pt-BR');
    const icon   = isErr ? '🔴' : '🟡';
    const cls    = isErr ? 'evt-error' : 'evt-warning';
    const msg    = String(e.message ?? '').replace(/</g, '&lt;');
    return `
      <div class="diag-event-item ${cls}">
        <div class="diag-event-meta">
          <span class="diag-event-icon">${icon}</span>
          <span class="diag-event-source">${e.source ?? '—'}</span>
          <span class="diag-event-log">${e.log}</span>
          <span class="diag-event-time">${time}</span>
          <span class="diag-event-id">ID: ${e.eventId}</span>
        </div>
        <div class="diag-event-msg">${msg}</div>
      </div>`;
  }).join('');
}

function renderEventsError() {
  const list = document.getElementById('diag-events-list');
  if (list) list.innerHTML = `<div class="diag-error">⚠️ Não foi possível ler o Event Log. Execute como Administrador.</div>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreToArc(score) {
  // Semicírculo = 157px de comprimento. Score 0–100 mapeia para 0–157.
  return Math.max(0, Math.min(157, (score / 100) * 157));
}

function formatUptime(hours) {
  if (hours < 1)   return `${Math.round(hours * 60)} minutos`;
  if (hours < 24)  return `${Math.round(hours)} horas`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${d}d ${h}h`;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('diag-styles')) return;
  const s = document.createElement('style');
  s.id = 'diag-styles';
  s.textContent = `
    .diag-page { display:flex; flex-direction:column; height:100%; overflow-y:auto; gap:var(--space-5); }
    .btn-diag-refresh { display:flex; align-items:center; gap:6px; background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-radius:var(--radius-sm); color:var(--color-text-secondary); cursor:pointer; padding:7px 14px; font-size:var(--text-sm); transition:var(--transition-fast); }
    .btn-diag-refresh:hover { color:var(--color-accent-primary); border-color:var(--color-accent-primary); }

    /* Saúde */
    .diag-health-row { display:flex; align-items:center; gap:var(--space-6); background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); padding:var(--space-5) var(--space-6); }
    .diag-score-card { display:flex; flex-direction:column; align-items:center; min-width:140px; position:relative; }
    .diag-gauge { width:140px; height:80px; }
    .diag-gauge-fill { transition:stroke-dasharray 0.8s ease; }
    .health-good .diag-gauge-fill { stroke:#2ecc71; }
    .health-warn .diag-gauge-fill { stroke:#f1c40f; }
    .health-bad  .diag-gauge-fill { stroke:#e74c3c; }
    .diag-score-number { font-size:2.2rem; font-weight:700; margin-top:-12px; color:var(--color-text-primary); }
    .diag-score-label { font-size:var(--text-xs); font-weight:600; text-transform:uppercase; letter-spacing:.8px; color:var(--color-text-muted); }
    .health-good .diag-score-label { color:#2ecc71; }
    .health-warn .diag-score-label { color:#f1c40f; }
    .health-bad  .diag-score-label { color:#e74c3c; }
    .diag-issues { flex:1; display:flex; flex-direction:column; gap:var(--space-2); }
    .diag-issue-item { background:rgba(241,196,15,.1); border-left:3px solid #f1c40f; border-radius:var(--radius-sm); padding:6px 12px; font-size:var(--text-sm); color:var(--color-text-secondary); }
    .diag-issue-ok { color:#2ecc71; font-size:var(--text-sm); font-weight:500; }
    .diag-uptime { font-size:var(--text-xs); color:var(--color-text-muted); margin-top:var(--space-2); }

    /* Cards de métricas */
    .diag-cards { display:grid; grid-template-columns:repeat(4,1fr); gap:var(--space-4); }
    .diag-metric-card { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg); padding:var(--space-4); }
    .diag-metric-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2); }
    .diag-metric-name { font-size:var(--text-xs); font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:var(--color-text-muted); }
    .diag-metric-score { font-size:var(--text-lg); font-weight:700; }
    .diag-bar-wrap { height:4px; background:var(--color-bg-surface-3); border-radius:2px; overflow:hidden; }
    .diag-bar { height:4px; border-radius:2px; transition:width .6s ease; }
    .diag-metric-sub { margin-top:var(--space-1); font-size:var(--text-xs); color:var(--color-text-muted); }

    /* Eventos */
    .diag-events-section { display:flex; flex-direction:column; gap:var(--space-3); }
    .diag-section-header { display:flex; align-items:center; justify-content:space-between; }
    .diag-section-title { font-size:var(--text-base); font-weight:600; color:var(--color-text-primary); margin:0; }
    .diag-events-filters { display:flex; gap:var(--space-2); }
    .diag-evt-filter { background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:4px 12px; border-radius:var(--radius-full); cursor:pointer; font-size:var(--text-xs); font-weight:500; transition:var(--transition-fast); }
    .diag-evt-filter.active { background:var(--color-accent-primary); border-color:var(--color-accent-primary); color:#000; }
    .diag-events-list { display:flex; flex-direction:column; gap:var(--space-2); max-height:420px; overflow-y:auto; padding-right:4px; }
    .diag-event-item { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-md); padding:var(--space-3) var(--space-4); }
    .evt-error   { border-left:3px solid #e74c3c; }
    .evt-warning { border-left:3px solid #f1c40f; }
    .diag-event-meta { display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap; margin-bottom:var(--space-2); }
    .diag-event-icon { font-size:14px; }
    .diag-event-source { font-weight:600; font-size:var(--text-sm); color:var(--color-text-primary); }
    .diag-event-log { font-size:var(--text-xs); background:var(--color-bg-surface-3); padding:1px 6px; border-radius:var(--radius-sm); color:var(--color-text-muted); }
    .diag-event-time { font-size:var(--text-xs); color:var(--color-text-muted); margin-left:auto; }
    .diag-event-id { font-size:var(--text-xs); color:var(--color-text-muted); font-family:var(--font-mono); }
    .diag-event-msg { font-size:var(--text-xs); color:var(--color-text-muted); line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .diag-no-events { text-align:center; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); }
    .diag-error { text-align:center; padding:var(--space-8); color:#e74c3c; font-size:var(--text-sm); }
    .diag-loading { display:flex; align-items:center; justify-content:center; gap:10px; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-diag { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}
