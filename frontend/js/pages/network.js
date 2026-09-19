/**
 * AeR — Rede (v1.0)
 * Adaptadores de rede e diagnóstico de ping.
 */
import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Network';

export async function mount(container) {
  Logger.info(MODULE, 'Montando Rede...');
  injectStyles();
  container.innerHTML = `
    <div class="dash-root network-page">
      <div class="dash-header">
        <div><h1 class="dash-title">Rede</h1><p class="dash-subtitle">Adaptadores e diagnóstico de conectividade</p></div>
        <button id="net-refresh" class="btn-net-refresh">↺ Atualizar</button>
      </div>

      <div id="net-adapters" class="net-adapters">
        <div class="net-loading"><span class="spinner-net"></span> Carregando adaptadores...</div>
      </div>

      <div class="net-ping-section">
        <h2 class="net-section-title">Diagnóstico de Ping</h2>
        <div class="net-ping-row">
          <input id="net-ping-host" class="net-ping-input" type="text" value="8.8.8.8" placeholder="Host ou IP...">
          <button id="net-ping-btn" class="btn-net-ping">▶ Ping</button>
        </div>
        <div id="net-ping-result" class="net-ping-result"></div>
      </div>
    </div>`;

  container.querySelector('#net-refresh').addEventListener('click', loadAdapters);
  container.querySelector('#net-ping-btn').addEventListener('click', runPing);
  container.querySelector('#net-ping-host').addEventListener('keydown', e => { if (e.key === 'Enter') runPing(); });
  await loadAdapters();
}

export function unmount() {}

async function loadAdapters() {
  const el = document.getElementById('net-adapters');
  if (el) el.innerHTML = `<div class="net-loading"><span class="spinner-net"></span> Carregando...</div>`;
  try {
    const adapters = await invoke('network:adapters');
    renderAdapters(adapters ?? []);
  } catch (e) {
    if (el) el.innerHTML = `<div class="net-error">⚠️ ${e?.message ?? 'Erro'}</div>`;
  }
}

function renderAdapters(adapters) {
  const el = document.getElementById('net-adapters');
  if (!el) return;
  const active = adapters.filter(a => a.status === 'Up');
  const inactive = adapters.filter(a => a.status !== 'Up');
  const all = [...active, ...inactive];
  if (!all.length) { el.innerHTML = `<div class="net-empty">Nenhum adaptador encontrado.</div>`; return; }
  el.innerHTML = all.map(a => {
    const up   = a.status === 'Up';
    const spd  = a.speedMbps > 0 ? `${a.speedMbps >= 1000 ? (a.speedMbps/1000).toFixed(0)+'Gbps' : a.speedMbps+'Mbps'}` : '';
    return `
      <div class="net-adapter-card ${up ? '' : 'adapter-down'}">
        <div class="net-adapter-header">
          <span class="net-status-dot ${up ? 'dot-up' : 'dot-down'}"></span>
          <span class="net-adapter-name">${a.name}</span>
          <span class="net-adapter-type">${a.type}</span>
          ${spd ? `<span class="net-adapter-speed">${spd}</span>` : ''}
          <span class="net-adapter-status">${a.status}</span>
        </div>
        ${up ? `
        <div class="net-adapter-details">
          <div class="net-detail"><span>IPv4</span><strong>${a.ipv4 || '—'}</strong></div>
          <div class="net-detail"><span>DNS</span><strong>${a.dns?.join(', ') || '—'}</strong></div>
          <div class="net-detail"><span>MAC</span><strong>${a.macAddress || '—'}</strong></div>
          <div class="net-detail"><span>Descrição</span><strong>${a.description}</strong></div>
        </div>` : ''}
      </div>`;
  }).join('');
}

async function runPing() {
  const host   = document.getElementById('net-ping-host')?.value?.trim() || '8.8.8.8';
  const btn    = document.getElementById('net-ping-btn');
  const result = document.getElementById('net-ping-result');
  btn.disabled = true; btn.textContent = '⏳ Pingando...';
  if (result) result.innerHTML = '';
  try {
    const r = await invoke('network:ping', { host });
    if (result) result.innerHTML = `
      <div class="net-ping-stats">
        <div class="ping-stat"><span>Enviados</span><strong>${r.sent}</strong></div>
        <div class="ping-stat"><span>Recebidos</span><strong>${r.received}</strong></div>
        <div class="ping-stat"><span>Perdidos</span><strong class="${r.lost > 0 ? 'ping-bad' : ''}">${r.lost}</strong></div>
        <div class="ping-stat"><span>Mín.</span><strong>${r.minMs >= 0 ? r.minMs+'ms' : '—'}</strong></div>
        <div class="ping-stat"><span>Máx.</span><strong>${r.maxMs >= 0 ? r.maxMs+'ms' : '—'}</strong></div>
        <div class="ping-stat"><span>Média</span><strong>${r.avgMs >= 0 ? r.avgMs+'ms' : '—'}</strong></div>
      </div>
      <div class="ping-packets">${(r.results ?? []).map((ms, i) =>
        `<span class="ping-pkt ${ms < 0 ? 'pkt-lost' : ms < 50 ? 'pkt-good' : ms < 150 ? 'pkt-mid' : 'pkt-bad'}">${ms < 0 ? 'X' : ms+'ms'}</span>`
      ).join('')}</div>`;
  } catch (e) {
    if (result) result.innerHTML = `<div class="net-error">⚠️ ${e?.message ?? 'Erro no ping'}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '▶ Ping';
  }
}

function injectStyles() {
  if (document.getElementById('network-styles')) return;
  const s = document.createElement('style');
  s.id = 'network-styles';
  s.textContent = `
    .network-page { display:flex; flex-direction:column; gap:var(--space-5); height:100%; overflow-y:auto; }
    .btn-net-refresh { background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:7px 14px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-sm); transition:var(--transition-fast); }
    .btn-net-refresh:hover { color:var(--color-accent-primary); border-color:var(--color-accent-primary); }
    .net-adapters { display:flex; flex-direction:column; gap:var(--space-3); }
    .net-adapter-card { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); padding:var(--space-4); }
    .net-adapter-card.adapter-down { opacity:.6; }
    .net-adapter-header { display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap; }
    .net-status-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .dot-up { background:#2ecc71; box-shadow:0 0 6px #2ecc71; }
    .dot-down { background:#e74c3c; }
    .net-adapter-name { font-weight:600; color:var(--color-text-primary); font-size:var(--text-sm); }
    .net-adapter-type { font-size:var(--text-xs); background:var(--color-bg-surface-3); padding:1px 6px; border-radius:var(--radius-sm); color:var(--color-text-muted); }
    .net-adapter-speed { font-size:var(--text-xs); color:var(--color-accent-primary); font-weight:600; }
    .net-adapter-status { font-size:var(--text-xs); margin-left:auto; color:var(--color-text-muted); }
    .net-adapter-details { display:grid; grid-template-columns:repeat(2,1fr); gap:var(--space-2); margin-top:var(--space-3); padding-top:var(--space-3); border-top:1px solid var(--color-border-subtle); }
    .net-detail { display:flex; flex-direction:column; gap:2px; font-size:var(--text-xs); }
    .net-detail span { color:var(--color-text-muted); }
    .net-detail strong { color:var(--color-text-primary); font-family:var(--font-mono); }
    .net-ping-section { display:flex; flex-direction:column; gap:var(--space-3); }
    .net-section-title { font-size:var(--text-base); font-weight:600; color:var(--color-text-primary); margin:0; }
    .net-ping-row { display:flex; gap:var(--space-3); }
    .net-ping-input { flex:1; background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-sm); color:var(--color-text-primary); padding:8px 12px; font-size:var(--text-sm); font-family:var(--font-mono); outline:none; }
    .net-ping-input:focus { border-color:var(--color-accent-primary); }
    .btn-net-ping { background:var(--color-accent-primary); border:none; color:#000; font-weight:700; padding:8px 20px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-sm); transition:var(--transition-fast); }
    .btn-net-ping:disabled { opacity:.6; cursor:not-allowed; }
    .net-ping-result { margin-top:var(--space-2); }
    .net-ping-stats { display:flex; gap:var(--space-4); flex-wrap:wrap; background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg); padding:var(--space-4); margin-bottom:var(--space-3); }
    .ping-stat { display:flex; flex-direction:column; align-items:center; gap:2px; }
    .ping-stat span { font-size:var(--text-xs); color:var(--color-text-muted); }
    .ping-stat strong { font-size:var(--text-base); font-weight:700; font-family:var(--font-mono); color:var(--color-text-primary); }
    .ping-stat strong.ping-bad { color:#e74c3c; }
    .ping-packets { display:flex; gap:var(--space-2); flex-wrap:wrap; }
    .ping-pkt { font-size:var(--text-xs); font-family:var(--font-mono); padding:3px 8px; border-radius:var(--radius-sm); font-weight:600; }
    .pkt-good { background:rgba(46,204,113,.2); color:#2ecc71; }
    .pkt-mid  { background:rgba(241,196,15,.2); color:#f1c40f; }
    .pkt-bad  { background:rgba(231,76,60,.2); color:#e74c3c; }
    .pkt-lost { background:rgba(150,150,150,.2); color:#999; }
    .net-loading,.net-error,.net-empty { text-align:center; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); display:flex; align-items:center; justify-content:center; gap:8px; }
    .net-error { color:#e74c3c; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-net { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}
