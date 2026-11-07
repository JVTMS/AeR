/**
 * AeR — Inicialização (v2.0 — estilo Gerenciador de Tarefas)
 * Gerencia programas que iniciam com o Windows.
 */
import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Startup';

export async function mount(container) {
  Logger.info(MODULE, 'Montando Inicialização...');
  injectStyles();
  container.innerHTML = `
    <div class="dash-root startup-page">
      <div class="dash-header">
        <div><h1 class="dash-title">Inicialização</h1><p class="dash-subtitle">Gerencie o que inicia com o Windows</p></div>
        <button id="startup-refresh" class="btn-startup-refresh">↺ Atualizar</button>
      </div>
      <div class="startup-info">
        ⚠️ Desabilitar itens de inicialização não os remove — apenas os impede de iniciar automaticamente. Você pode reativar a qualquer momento.
      </div>
      <div id="startup-list" class="startup-list">
        <div class="startup-loading"><span class="spinner-startup"></span> Carregando...</div>
      </div>
    </div>`;

  container.querySelector('#startup-refresh').addEventListener('click', loadStartup);
  await loadStartup();
}

export function unmount() {}

async function loadStartup() {
  const list = document.getElementById('startup-list');
  if (list) list.innerHTML = `<div class="startup-loading"><span class="spinner-startup"></span> Carregando...</div>`;
  try {
    const items = await invoke('startup:list');
    renderList(items ?? []);
  } catch (e) {
    if (list) list.innerHTML = `<div class="startup-error">⚠️ ${e?.message ?? 'Erro ao carregar'}</div>`;
  }
}

function getImpactClass(impact) {
  switch (impact) {
    case 'Alto':  return 'impact-high';
    case 'Médio': return 'impact-medium';
    case 'Baixo': return 'impact-low';
    default:      return 'impact-none';
  }
}

function getStatusClass(enabled) {
  return enabled ? 'status-enabled' : 'status-disabled';
}

function getInitial(name) {
  return (name || '?')[0].toUpperCase();
}

function renderList(items) {
  const list = document.getElementById('startup-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="startup-empty">Nenhum item de inicialização encontrado.</div>`;
    return;
  }

  list.innerHTML = `
    <table class="startup-table">
      <thead>
        <tr>
          <th class="col-name">Nome</th>
          <th class="col-publisher">Fornecedor</th>
          <th class="col-status">Status</th>
          <th class="col-impact">Impacto na inicialização</th>
          <th class="col-toggle"></th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr class="startup-row ${item.enabled ? '' : 'row-disabled'}" data-name="${item.name}" data-scope="${item.scope}">
            <td class="col-name">
              <div class="app-cell">
                <div class="app-icon">${getInitial(item.name)}</div>
                <div class="app-details">
                  <span class="app-name">${item.name}</span>
                  <span class="app-cmd">${item.command}</span>
                </div>
              </div>
            </td>
            <td class="col-publisher">
              <span class="publisher-text">${item.publisher || '—'}</span>
            </td>
            <td class="col-status">
              <span class="status-badge ${getStatusClass(item.enabled)}">
                ${item.enabled ? 'Habilitado' : 'Desabilitado'}
              </span>
            </td>
            <td class="col-impact">
              <span class="impact-badge ${getImpactClass(item.startupImpact)}">
                ${item.startupImpact || 'Nenhum'}
              </span>
            </td>
            <td class="col-toggle">
              <label class="startup-toggle" title="${item.enabled ? 'Clique para desabilitar' : 'Clique para habilitar'}">
                <input type="checkbox" class="startup-check" ${item.enabled ? 'checked' : ''}
                       data-name="${item.name}" data-scope="${item.scope}">
                <span class="startup-toggle-track"></span>
              </label>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  list.querySelectorAll('.startup-check').forEach(cb => {
    cb.addEventListener('change', () => toggleItem(cb.dataset.name, cb.dataset.scope, cb.checked, cb));
  });
}

async function toggleItem(name, scope, enabled, checkbox) {
  checkbox.disabled = true;
  const row = checkbox.closest('.startup-row');
  try {
    await invoke('startup:toggle', { name, scope, enabled });
    // Atualizar visual da linha sem recarregar tudo
    if (row) {
      row.classList.toggle('row-disabled', !enabled);
      const badge = row.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge ${getStatusClass(enabled)}`;
        badge.textContent = enabled ? 'Habilitado' : 'Desabilitado';
      }
    }
  } catch (e) {
    checkbox.checked = !enabled;
    alert(`Erro: ${e?.message ?? 'Falha ao alterar item'}`);
  } finally {
    checkbox.disabled = false;
  }
}

function injectStyles() {
  if (document.getElementById('startup-styles')) return;
  const s = document.createElement('style');
  s.id = 'startup-styles';
  s.textContent = `
    .startup-page { display:flex; flex-direction:column; gap:var(--space-4); height:100%; overflow-y:auto; }
    .btn-startup-refresh { background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:7px 14px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-sm); transition:var(--transition-fast); }
    .btn-startup-refresh:hover { color:var(--color-accent-primary); border-color:var(--color-accent-primary); }
    .startup-info { background:rgba(241,196,15,.1); border:1px solid rgba(241,196,15,.3); border-radius:var(--radius-md); padding:var(--space-3) var(--space-4); font-size:var(--text-sm); color:#f1c40f; }

    /* ── Tabela estilo Task Manager ── */
    .startup-list { flex:1; overflow-y:auto; }
    .startup-table { width:100%; border-collapse:collapse; font-size:var(--text-sm); }
    .startup-table thead { position:sticky; top:0; z-index:1; background:var(--color-bg-surface-2); border-bottom:2px solid var(--color-border-subtle); }
    .startup-table th { padding:10px 14px; text-align:left; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:var(--color-text-muted); white-space:nowrap; }
    .startup-table th.col-toggle { width:60px; }
    .startup-table th.col-status { width:140px; }
    .startup-table th.col-impact { width:190px; }
    .startup-table th.col-publisher { width:220px; }

    .startup-row { border-bottom:1px solid var(--color-border-subtle); transition:background .15s; }
    .startup-row:hover { background:var(--color-bg-surface-1); }
    .startup-row.row-disabled { opacity:.55; }
    .startup-table td { padding:10px 14px; vertical-align:middle; }

    /* ── Célula Nome ── */
    .app-cell { display:flex; align-items:center; gap:12px; min-width:0; }
    .app-icon { width:32px; height:32px; border-radius:6px; background:var(--color-bg-surface-3); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; color:var(--color-text-secondary); flex-shrink:0; border:1px solid var(--color-border-subtle); }
    .app-details { display:flex; flex-direction:column; min-width:0; }
    .app-name { font-weight:600; color:var(--color-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .app-cmd  { font-family:var(--font-mono); font-size:10px; color:var(--color-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; max-width:340px; }

    /* ── Fornecedor ── */
    .publisher-text { color:var(--color-text-secondary); font-size:var(--text-sm); }

    /* ── Status badge ── */
    .status-badge { display:inline-block; padding:2px 10px; border-radius:var(--radius-sm); font-size:11px; font-weight:600; }
    .status-enabled  { background:rgba(46,204,113,.15); color:#2ecc71; }
    .status-disabled { background:rgba(127,140,141,.13); color:#7f8c8d; }

    /* ── Impacto badge ── */
    .impact-badge { display:inline-block; padding:2px 10px; border-radius:var(--radius-sm); font-size:11px; font-weight:600; }
    .impact-high   { background:rgba(231,76,60,.15);  color:#e74c3c; }
    .impact-medium { background:rgba(243,156,18,.15); color:#f39c12; }
    .impact-low    { background:rgba(52,152,219,.13); color:#3498db; }
    .impact-none   { background:rgba(127,140,141,.10); color:var(--color-text-muted); }

    /* ── Toggle ── */
    .startup-toggle { position:relative; cursor:pointer; }
    .startup-check  { opacity:0; width:0; height:0; position:absolute; }
    .startup-toggle-track { display:block; width:42px; height:22px; background:var(--color-bg-surface-3); border-radius:11px; transition:background .2s; position:relative; }
    .startup-toggle-track::after { content:''; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .2s; }
    .startup-check:checked + .startup-toggle-track { background:var(--color-accent-primary); }
    .startup-check:checked + .startup-toggle-track::after { transform:translateX(20px); background:#000; }

    /* ── Estados ── */
    .startup-loading, .startup-error, .startup-empty { text-align:center; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); display:flex; align-items:center; justify-content:center; gap:8px; }
    .startup-error { color:#e74c3c; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-startup { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}

