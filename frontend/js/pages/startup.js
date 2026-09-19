/**
 * AeR — Inicialização (v1.0)
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

function renderList(items) {
  const list = document.getElementById('startup-list');
  if (!list) return;
  if (!items.length) { list.innerHTML = `<div class="startup-empty">Nenhum item de inicialização encontrado.</div>`; return; }

  list.innerHTML = items.map(item => `
    <div class="startup-item" data-name="${item.name}" data-scope="${item.scope}">
      <div class="startup-item-info">
        <div class="startup-item-name">${item.name}</div>
        <div class="startup-item-cmd">${item.command}</div>
        <span class="startup-scope-badge ${item.scope === 'Machine' ? 'scope-machine' : 'scope-user'}">${item.scope}</span>
      </div>
      <label class="startup-toggle" title="${item.enabled ? 'Clique para desabilitar' : 'Clique para habilitar'}">
        <input type="checkbox" class="startup-check" ${item.enabled ? 'checked' : ''}
               data-name="${item.name}" data-scope="${item.scope}">
        <span class="startup-toggle-track"></span>
      </label>
    </div>`).join('');

  list.querySelectorAll('.startup-check').forEach(cb => {
    cb.addEventListener('change', () => toggleItem(cb.dataset.name, cb.dataset.scope, cb.checked, cb));
  });
}

async function toggleItem(name, scope, enabled, checkbox) {
  checkbox.disabled = true;
  try {
    await invoke('startup:toggle', { name, scope, enabled });
  } catch (e) {
    checkbox.checked = !enabled; // reverter
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
    .startup-list { display:flex; flex-direction:column; gap:var(--space-2); }
    .startup-item { display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg); padding:var(--space-4); }
    .startup-item-info { flex:1; min-width:0; }
    .startup-item-name { font-weight:600; color:var(--color-text-primary); font-size:var(--text-sm); }
    .startup-item-cmd { font-family:var(--font-mono); font-size:10px; color:var(--color-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
    .startup-scope-badge { display:inline-block; font-size:10px; font-weight:600; padding:1px 6px; border-radius:var(--radius-sm); margin-top:4px; }
    .scope-machine { background:rgba(231,76,60,.15); color:#e74c3c; }
    .scope-user    { background:rgba(52,152,219,.15); color:#3498db; }
    .startup-toggle { position:relative; cursor:pointer; }
    .startup-check { opacity:0; width:0; height:0; position:absolute; }
    .startup-toggle-track { display:block; width:42px; height:22px; background:var(--color-bg-surface-3); border-radius:11px; transition:background .2s; position:relative; }
    .startup-toggle-track::after { content:''; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .2s; }
    .startup-check:checked + .startup-toggle-track { background:var(--color-accent-primary); }
    .startup-check:checked + .startup-toggle-track::after { transform:translateX(20px); background:#000; }
    .startup-loading, .startup-error, .startup-empty { text-align:center; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); display:flex; align-items:center; justify-content:center; gap:8px; }
    .startup-error { color:#e74c3c; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-startup { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}
