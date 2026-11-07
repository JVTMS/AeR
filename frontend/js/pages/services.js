/**
 * AeR — Serviços do Windows (v1.0)
 * Lista, inicia, para e configura Windows Services.
 */

import { Logger } from '../utils/logger.js';
import { invoke, getSystemStatus, elevateBackend } from '../api/pipe-client.js';

const MODULE = 'Services';

let services    = [];
let filterText  = '';
let filterState = 'all';
let isAdmin     = true;

// ─── Mount / Unmount ─────────────────────────────────────────────────────────

export async function mount(container) {
  Logger.info(MODULE, 'Montando Serviços...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root svc-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Serviços</h1>
          <p class="dash-subtitle">Gerenciamento de Windows Services</p>
        </div>
        <div class="svc-header-actions">
          <div class="svc-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="svc-search" class="svc-search" type="text" placeholder="Filtrar serviços..." autocomplete="off"/>
          </div>
          <button id="svc-refresh" class="btn-svc-refresh" title="Recarregar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="svc-filters">
        <button class="svc-filter-btn active" data-state="all">Todos</button>
        <button class="svc-filter-btn" data-state="Running">Rodando</button>
        <button class="svc-filter-btn" data-state="Stopped">Parados</button>
        <button class="svc-filter-btn" data-state="Disabled">Desativados</button>
        <span id="svc-count" class="svc-count-badge">— serviços</span>
      </div>

      <div class="svc-table-wrap">
        <table class="svc-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descricao</th>
              <th>Status</th>
              <th>Inicio</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody id="svc-tbody">
            <tr><td colspan="5" class="svc-loading"><span class="spinner-svc"></span> Carregando servicos...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelectorAll('.svc-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.svc-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState = btn.dataset.state;
      renderTable();
    });
  });

  container.querySelector('#svc-search').addEventListener('input', e => {
    filterText = e.target.value.trim().toLowerCase();
    renderTable();
  });

  container.querySelector('#svc-refresh').addEventListener('click', () => loadServices());

  await loadServices();
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando Servicos...');
}

// ─── Dados ────────────────────────────────────────────────────────────────────

async function loadServices() {
  const tbody = document.getElementById('svc-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="svc-loading"><span class="spinner-svc"></span> Carregando...</td></tr>`;
  try {
    const [data, sys] = await Promise.all([
      invoke('services:list'),
      getSystemStatus().catch(() => null),
    ]);
    if (sys && typeof sys.isAdmin === 'boolean') isAdmin = sys.isAdmin;
    if (Array.isArray(data)) {
      services = data;
      renderTable();
    }
  } catch (err) {
    Logger.error(MODULE, 'Falha ao carregar servicos', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="svc-empty">Falha ao carregar servicos.</td></tr>`;
  }
}

function renderTable() {
  const tbody   = document.getElementById('svc-tbody');
  const countEl = document.getElementById('svc-count');
  if (!tbody) return;

  let filtered = [...services];
  if (filterState !== 'all') {
    if (filterState === 'Disabled') {
      filtered = filtered.filter(s => s.startMode === 'Disabled');
    } else {
      filtered = filtered.filter(s => s.state === filterState);
    }
  }
  if (filterText) {
    filtered = filtered.filter(s =>
      (s.name ?? '').toLowerCase().includes(filterText) ||
      (s.displayName ?? '').toLowerCase().includes(filterText)
    );
  }

  if (countEl) countEl.textContent = `${filtered.length} servicos`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="svc-empty">Nenhum servico encontrado.</td></tr>`;
    return;
  }

  const startLabels = { Auto:'Automatico', Manual:'Manual', Disabled:'Desativado', Boot:'Boot', System:'Sistema' };

  tbody.innerHTML = filtered.map(s => {
    const isRunning  = s.state === 'Running';
    const isDisabled = s.startMode === 'Disabled';
    const stateClass = isRunning ? 'state-running' : isDisabled ? 'state-disabled' : 'state-stopped';
    const stateLabel = isRunning ? 'Rodando' : isDisabled ? 'Desativado' : 'Parado';
    const startLabel = startLabels[s.startMode] ?? s.startMode ?? '—';
    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const desc = (s.description ?? '').slice(0, 60) + ((s.description ?? '').length > 60 ? '…' : '');

    return `<tr class="svc-row">
      <td class="svc-name">
        <span class="svc-display">${esc(s.displayName ?? s.name)}</span>
        <span class="svc-key">${esc(s.name)}</span>
      </td>
      <td class="svc-desc">${esc(desc) || '—'}</td>
      <td><span class="svc-badge ${stateClass}">${stateLabel}</span></td>
      <td class="svc-start-mode">${startLabel}</td>
      <td class="svc-actions">
        ${isRunning
          ? `<button class="btn-svc btn-svc-stop"    data-action="stop"    data-name="${esc(s.name)}">Parar</button>
             <button class="btn-svc btn-svc-restart" data-action="restart" data-name="${esc(s.name)}">Reiniciar</button>`
          : `<button class="btn-svc btn-svc-start"   data-action="start"   data-name="${esc(s.name)}">Iniciar</button>`}
        ${isDisabled
          ? `<button class="btn-svc btn-svc-enable"  data-action="enable"  data-name="${esc(s.name)}">Habilitar</button>`
          : `<button class="btn-svc btn-svc-disable" data-action="disable" data-name="${esc(s.name)}">Desativar</button>`}
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-svc').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.name, btn.dataset.action, btn));
  });
}

// ─── Acoes ────────────────────────────────────────────────────────────────────

const ACTION_LABELS = { start:'Iniciando...', stop:'Parando...', restart:'Reiniciando...', enable:'Habilitando...', disable:'Desativando...' };

async function handleAction(name, action, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = ACTION_LABELS[action] ?? '...';
  try {
    if (!isAdmin) {
      const elev = await elevateBackend();
      if (elev?.success) {
        for (let i = 0; i < 12; i++) {
          await new Promise(r => setTimeout(r, 700));
          try {
            const st = await getSystemStatus();
            if (st?.isAdmin) { isAdmin = true; break; }
          } catch { }
        }
      } else {
        showToast('É necessário privilégio de Administrador para controlar serviços.', 'error');
        btn.disabled = false; btn.textContent = original;
        return;
      }
    }
    const result = await invoke('services:control', { name, action });
    if (result?.success) {
      showToast(`${name}: ${original} concluido.`, 'success');
      await loadServices();
    } else {
      showToast(result?.message ?? 'Acao falhou.', 'error');
      btn.disabled = false; btn.textContent = original;
    }
  } catch (err) {
    showToast('Erro: ' + (err?.message ?? 'Falha inesperada'), 'error');
    btn.disabled = false; btn.textContent = original;
  }
}

function showToast(msg, type = 'success') {
  const ex = document.getElementById('svc-toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.id = 'svc-toast';
  t.className = `proc-toast proc-toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

function injectStyles() {
  if (document.getElementById('svc-styles')) return;
  const s = document.createElement('style');
  s.id = 'svc-styles';
  s.textContent = `
    .svc-page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .svc-header-actions { display:flex; align-items:center; gap:var(--space-3); }
    .svc-search-wrap { display:flex; align-items:center; gap:8px; background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-radius:var(--radius-md); padding:6px 12px; }
    .svc-search { background:transparent; border:none; outline:none; color:var(--color-text-primary); font-size:var(--text-sm); width:200px; }
    .btn-svc-refresh { background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-radius:var(--radius-sm); color:var(--color-text-secondary); cursor:pointer; padding:6px 8px; transition:var(--transition-fast); }
    .btn-svc-refresh:hover { color:var(--color-accent-primary); border-color:var(--color-accent-primary); }
    .svc-filters { display:flex; align-items:center; gap:var(--space-2); margin:var(--space-4) 0 var(--space-3); flex-wrap:wrap; }
    .svc-filter-btn { background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:5px 14px; border-radius:var(--radius-full); cursor:pointer; font-size:var(--text-xs); font-weight:500; transition:var(--transition-fast); }
    .svc-filter-btn:hover { border-color:var(--color-accent-primary); color:var(--color-text-primary); }
    .svc-filter-btn.active { background:var(--color-accent-primary); border-color:var(--color-accent-primary); color:#000; }
    .svc-count-badge { margin-left:auto; font-size:var(--text-xs); color:var(--color-text-muted); background:var(--color-bg-surface-3); border:1px solid var(--color-border-subtle); padding:4px 10px; border-radius:var(--radius-full); }
    .svc-table-wrap { flex:1; overflow-y:auto; border-radius:var(--radius-lg); border:1px solid var(--color-border-subtle); }
    .svc-table { width:100%; border-collapse:collapse; font-size:var(--text-sm); }
    .svc-table thead { position:sticky; top:0; background:var(--color-bg-surface-2); z-index:1; }
    .svc-table th { padding:10px 14px; text-align:left; color:var(--color-text-muted); font-size:var(--text-xs); font-weight:600; text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid var(--color-border-subtle); }
    .svc-table td { padding:8px 14px; border-bottom:1px solid var(--color-border-subtle); vertical-align:middle; }
    .svc-table tr:last-child td { border-bottom:none; }
    .svc-table tr:hover td { background:var(--color-bg-surface-2); }
    .svc-name { min-width:180px; }
    .svc-display { display:block; color:var(--color-text-primary); font-weight:500; }
    .svc-key { display:block; color:var(--color-text-muted); font-size:var(--text-xs); font-family:var(--font-mono); margin-top:1px; }
    .svc-desc { max-width:260px; color:var(--color-text-muted); font-size:var(--text-xs); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .svc-start-mode { color:var(--color-text-muted); font-size:var(--text-xs); }
    .svc-loading, .svc-empty { text-align:center; padding:48px; color:var(--color-text-muted); }
    .svc-loading { display:flex; align-items:center; justify-content:center; gap:10px; }
    .svc-badge { display:inline-block; padding:2px 10px; border-radius:var(--radius-full); font-size:11px; font-weight:600; }
    .state-running  { background:rgba(46,204,113,.15); color:#2ecc71; }
    .state-stopped  { background:rgba(231,76,60,.12);  color:#e74c3c; }
    .state-disabled { background:var(--color-bg-surface-3); color:var(--color-text-muted); }
    .svc-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .btn-svc { padding:3px 10px; border-radius:var(--radius-sm); font-size:var(--text-xs); font-weight:500; cursor:pointer; border:1px solid var(--color-border-subtle); background:transparent; color:var(--color-text-secondary); transition:var(--transition-fast); }
    .btn-svc:disabled { opacity:.5; cursor:not-allowed; }
    .btn-svc-start:hover   { background:rgba(46,204,113,.15); color:#2ecc71; border-color:#2ecc71; }
    .btn-svc-stop:hover    { background:rgba(231,76,60,.15);  color:#e74c3c; border-color:#e74c3c; }
    .btn-svc-restart:hover { background:rgba(52,152,219,.15); color:#3498db; border-color:#3498db; }
    .btn-svc-enable:hover  { background:rgba(46,204,113,.15); color:#2ecc71; border-color:#2ecc71; }
    .btn-svc-disable:hover { background:rgba(241,196,15,.12); color:#f1c40f; border-color:#f1c40f; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-svc { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}
