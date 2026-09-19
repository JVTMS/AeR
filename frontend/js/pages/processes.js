/**
 * AeR — Processos (v1.0)
 * Lista de processos em tempo real com busca, ordenação e encerramento.
 */

import { Logger }  from '../utils/logger.js';
import { invoke }  from '../api/pipe-client.js';

const MODULE = 'Processes';

let processes   = [];
let sortKey     = 'memoryMb';
let sortAsc     = false;
let filterText  = '';
let refreshTimer = null;
let isPaused    = false;

// ─── Mount / Unmount ─────────────────────────────────────────────────────────

export async function mount(container) {
  Logger.info(MODULE, 'Montando Processos...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root proc-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Processos</h1>
          <p class="dash-subtitle">Gerenciamento de processos em execução</p>
        </div>
        <div class="proc-header-actions">
          <div class="proc-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="proc-search" class="proc-search" type="text" placeholder="Filtrar processos..." autocomplete="off"/>
          </div>
          <span id="proc-count" class="proc-count-badge">— processos</span>
          <button id="proc-refresh" class="btn-proc-refresh" title="Atualizar agora">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="proc-table-wrap">
        <table class="proc-table" id="proc-table">
          <thead>
            <tr>
              <th class="sortable" data-key="name">Nome <span class="sort-icon">↕</span></th>
              <th class="sortable" data-key="pid">PID <span class="sort-icon">↕</span></th>
              <th class="sortable num" data-key="memoryMb">RAM (MB) <span class="sort-icon">↓</span></th>
              <th>Sessão</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody id="proc-tbody">
            <tr><td colspan="5" class="proc-loading"><span class="spinner"></span> Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal de confirmação de kill -->
    <div id="proc-modal" class="proc-modal-overlay">
      <div class="proc-modal">
        <div class="proc-modal-icon">⚠️</div>
        <h3 id="proc-modal-title">Encerrar processo?</h3>
        <p id="proc-modal-body" class="proc-modal-body"></p>
        <div class="proc-modal-footer">
          <button id="proc-modal-cancel" class="btn-secondary">Cancelar</button>
          <button id="proc-modal-confirm" class="btn-danger">Encerrar</button>
        </div>
      </div>
    </div>
  `;

  // Binds de header de tabela (ordenação)
  container.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) {
        sortAsc = !sortAsc;
      } else {
        sortKey = key;
        sortAsc = key === 'name';
      }
      updateSortIcons(container);
      renderTable();
    });
  });

  // Busca
  const searchInput = container.querySelector('#proc-search');
  searchInput.addEventListener('input', () => {
    filterText = searchInput.value.trim().toLowerCase();
    isPaused = false;
    renderTable();
  });
  searchInput.addEventListener('focus', () => { isPaused = true; });
  searchInput.addEventListener('blur',  () => { isPaused = false; });

  // Refresh manual
  container.querySelector('#proc-refresh').addEventListener('click', () => loadProcesses());

  // Modal
  container.querySelector('#proc-modal-cancel').addEventListener('click', closeModal);
  container.querySelector('#proc-modal').addEventListener('click', e => {
    if (e.target.id === 'proc-modal') closeModal();
  });

  // Carregar dados e iniciar polling
  await loadProcesses();
  refreshTimer = setInterval(() => {
    if (!isPaused) loadProcesses();
  }, 3000);
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando Processos...');
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

// ─── Dados ───────────────────────────────────────────────────────────────────

async function loadProcesses() {
  try {
    const data = await invoke('processes:list');
    if (Array.isArray(data)) {
      processes = data;
      renderTable();
    }
  } catch (err) {
    Logger.error(MODULE, 'Falha ao carregar processos', err);
  }
}

// ─── Renderização ─────────────────────────────────────────────────────────────

function renderTable() {
  const tbody = document.getElementById('proc-tbody');
  const countEl = document.getElementById('proc-count');
  if (!tbody) return;

  // Filtrar
  let filtered = filterText
    ? processes.filter(p =>
        p.name?.toLowerCase().includes(filterText) ||
        String(p.pid).includes(filterText)
      )
    : [...processes];

  // Ordenar
  filtered.sort((a, b) => {
    const va = a[sortKey] ?? '';
    const vb = b[sortKey] ?? '';
    if (typeof va === 'number') return sortAsc ? va - vb : vb - va;
    return sortAsc
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  if (countEl) countEl.textContent = `${filtered.length} processos`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="proc-empty">Nenhum processo encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const memMb   = (p.memoryMb ?? 0).toFixed(0);
    const memClass = p.memoryMb > 500 ? 'mem-high' : p.memoryMb > 200 ? 'mem-med' : '';
    const name = escapeHtml(p.name ?? '—');
    return `
      <tr class="proc-row">
        <td class="proc-name" title="${escapeHtml(p.path ?? p.name ?? '')}">
          <span class="proc-icon">⚙</span>${name}
        </td>
        <td class="proc-pid">${p.pid}</td>
        <td class="num ${memClass}">${memMb} MB</td>
        <td>${p.sessionId ?? '—'}</td>
        <td>
          <button class="btn-kill" data-pid="${p.pid}" data-name="${escapeHtml(p.name ?? '')}">
            Encerrar
          </button>
        </td>
      </tr>`;
  }).join('');

  // Bind botões kill
  tbody.querySelectorAll('.btn-kill').forEach(btn => {
    btn.addEventListener('click', () => {
      showKillModal(Number(btn.dataset.pid), btn.dataset.name);
    });
  });
}

function updateSortIcons(container) {
  container.querySelectorAll('th.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (th.dataset.key === sortKey) {
      icon.textContent = sortAsc ? '↑' : '↓';
      th.classList.add('active');
    } else {
      icon.textContent = '↕';
      th.classList.remove('active');
    }
  });
}

// ─── Kill / Modal ─────────────────────────────────────────────────────────────

let pendingKill = null;

function showKillModal(pid, name) {
  pendingKill = pid;
  const overlay = document.getElementById('proc-modal');
  document.getElementById('proc-modal-body').textContent =
    `Tem certeza que deseja encerrar "${name}" (PID ${pid})?  Dados não salvos serão perdidos.`;

  const confirmBtn = document.getElementById('proc-modal-confirm');
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  newConfirm.addEventListener('click', () => executeKill(pid, newConfirm));

  overlay.classList.add('show');
}

function closeModal() {
  document.getElementById('proc-modal')?.classList.remove('show');
  pendingKill = null;
}

async function executeKill(pid, btn) {
  btn.disabled = true;
  btn.textContent = 'Encerrando...';
  try {
    const result = await invoke('processes:kill', { pid });
    closeModal();
    if (result?.success) {
      showToast(`Processo ${pid} encerrado.`, 'success');
      await loadProcesses();
    } else {
      showToast(result?.message ?? 'Falha ao encerrar.', 'error');
    }
  } catch (err) {
    showToast('Erro: ' + (err.message ?? 'Falha inesperada'), 'error');
    btn.disabled = false;
    btn.textContent = 'Encerrar';
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const existing = document.getElementById('proc-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'proc-toast';
  t.className = `proc-toast proc-toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('proc-styles')) return;
  const s = document.createElement('style');
  s.id = 'proc-styles';
  s.textContent = `
    .proc-page { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .proc-header-actions { display:flex; align-items:center; gap:var(--space-3); }
    .proc-search-wrap {
      display:flex; align-items:center; gap:8px;
      background:var(--color-bg-surface-2);
      border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-md);
      padding:6px 12px;
    }
    .proc-search-wrap svg { color:var(--color-text-muted); flex-shrink:0; }
    .proc-search {
      background:transparent; border:none; outline:none;
      color:var(--color-text-primary); font-size:var(--text-sm);
      width:200px;
    }
    .proc-count-badge {
      font-size:var(--text-xs); color:var(--color-text-muted);
      background:var(--color-bg-surface-3);
      border:1px solid var(--color-border-subtle);
      padding:4px 10px; border-radius:var(--radius-full);
      white-space:nowrap;
    }
    .btn-proc-refresh {
      background:var(--color-bg-surface-2);
      border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-sm);
      color:var(--color-text-secondary);
      cursor:pointer; padding:6px 8px;
      transition:var(--transition-fast);
    }
    .btn-proc-refresh:hover { color:var(--color-accent-primary); border-color:var(--color-accent-primary); }

    /* Tabela */
    .proc-table-wrap { flex:1; overflow-y:auto; margin-top:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--color-border-subtle); }
    .proc-table { width:100%; border-collapse:collapse; font-size:var(--text-sm); }
    .proc-table thead { position:sticky; top:0; background:var(--color-bg-surface-2); z-index:1; }
    .proc-table th {
      padding:10px 14px; text-align:left;
      color:var(--color-text-muted); font-size:var(--text-xs);
      font-weight:600; text-transform:uppercase; letter-spacing:0.5px;
      border-bottom:1px solid var(--color-border-subtle);
    }
    .proc-table th.sortable { cursor:pointer; user-select:none; }
    .proc-table th.sortable:hover { color:var(--color-text-primary); }
    .proc-table th.active { color:var(--color-accent-primary); }
    .proc-table th .sort-icon { font-size:10px; margin-left:4px; }
    .proc-table th.num, .proc-table td.num { text-align:right; }
    .proc-table tbody tr { border-bottom:1px solid var(--color-border-subtle); transition:background var(--transition-fast); }
    .proc-table tbody tr:last-child { border-bottom:none; }
    .proc-table tbody tr:hover { background:var(--color-bg-surface-2); }
    .proc-table td { padding:8px 14px; color:var(--color-text-primary); vertical-align:middle; }
    .proc-name { max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .proc-icon { margin-right:6px; font-size:11px; color:var(--color-text-muted); }
    .proc-pid { color:var(--color-text-muted); font-family:var(--font-mono); font-size:var(--text-xs); }
    .mem-high { color:#e74c3c; font-weight:600; }
    .mem-med  { color:#f1c40f; }
    .proc-loading, .proc-empty { text-align:center; padding:48px; color:var(--color-text-muted); }
    .proc-loading { display:flex; align-items:center; justify-content:center; gap:10px; }

    /* Kill button */
    .btn-kill {
      background:transparent; border:1px solid var(--color-border-subtle);
      color:var(--color-text-muted); padding:3px 10px;
      border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-xs);
      transition:var(--transition-fast);
    }
    .btn-kill:hover { background:rgba(231,76,60,0.15); color:#e74c3c; border-color:#e74c3c; }

    /* Modal */
    .proc-modal-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.6);
      backdrop-filter:blur(6px); display:flex;
      align-items:center; justify-content:center; z-index:1000;
      opacity:0; pointer-events:none; transition:opacity 0.2s;
    }
    .proc-modal-overlay.show { opacity:1; pointer-events:auto; }
    .proc-modal {
      background:var(--color-bg-surface-1); border:1px solid var(--color-border-default);
      border-radius:var(--radius-xl); padding:var(--space-6);
      max-width:420px; width:100%; text-align:center;
      box-shadow:0 24px 48px rgba(0,0,0,0.4);
    }
    .proc-modal-icon { font-size:2.5rem; margin-bottom:var(--space-3); }
    .proc-modal h3 { font-size:var(--text-lg); margin:0 0 var(--space-3); }
    .proc-modal-body { color:var(--color-text-secondary); font-size:var(--text-sm); margin-bottom:var(--space-5); }
    .proc-modal-footer { display:flex; gap:var(--space-3); justify-content:center; }
    .btn-danger {
      background:#e74c3c; color:#fff; border:none;
      padding:8px 20px; border-radius:var(--radius-sm);
      cursor:pointer; font-weight:600; transition:var(--transition-fast);
    }
    .btn-danger:hover { filter:brightness(1.1); }
    .btn-danger:disabled { opacity:0.6; cursor:not-allowed; }

    /* Toast */
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin 0.7s linear infinite; display:inline-block; }
    .proc-toast {
      position:fixed; bottom:32px; left:50%;
      transform:translateX(-50%) translateY(80px);
      background:var(--color-bg-surface-3); color:var(--color-text-primary);
      border:1px solid var(--color-border-default);
      padding:10px 22px; border-radius:var(--radius-lg);
      font-size:var(--text-sm); font-weight:500;
      box-shadow:0 8px 24px rgba(0,0,0,0.3);
      z-index:9999; opacity:0;
      transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s;
    }
    .proc-toast.show { transform:translateX(-50%) translateY(0); opacity:1; }
    .proc-toast-success { border-left:3px solid #2ecc71; }
    .proc-toast-error   { border-left:3px solid #e74c3c; }
  `;
  document.head.appendChild(s);
}
