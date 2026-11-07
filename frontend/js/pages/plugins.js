import { Logger } from '../utils/logger.js';
const MODULE = 'Plugins';
const STORAGE_KEY = 'aer-plugins';
function loadPlugins() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function savePlugins(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
export async function mount(container) {
  Logger.info(MODULE, 'Montando Plugins...');
  injectStyles();
  container.innerHTML = `<div class="dash-root plugins-page">
    <div class="dash-header"><div><h1 class="dash-title">Plugins</h1><p class="dash-subtitle">Extensoes e integrações do AeR</p></div>
    <button id="plg-add" class="btn-primary">+ Adicionar Plugin</button></div>
    <div id="plg-content"></div></div>`;
  container.querySelector('#plg-add').addEventListener('click', () => showAdd(container));
  render(container.querySelector('#plg-content'));
}
export function unmount() {}
function render(div) {
  const plugins = loadPlugins();
  if (!plugins.length) {
    div.innerHTML = `<div class="plg-empty">
      <div class="plg-empty-icon">🧩</div>
      <h3>Nenhum plugin instalado</h3>
      <p>Clique em "+ Adicionar Plugin" para adicionar integrações ao AeR.</p>
    </div>`; return;
  }
  div.innerHTML = `<div class="plg-grid">${plugins.map((p,i)=>`
    <div class="plg-card">
      <div class="plg-card-header">
        <div class="plg-icon">${p.icon || '🧩'}</div>
        <div class="plg-info"><div class="plg-name">${p.name}</div><div class="plg-version">v${p.version || '1.0.0'}</div></div>
        <span class="badge plg-cat">${p.category || 'Geral'}</span>
      </div>
      <p class="plg-desc">${p.description || 'Sem descricao.'}</p>
      <div class="plg-footer">
        ${p.url?`<a href="#" class="plg-link" data-url="${p.url}" data-idx="${i}">🌐 Abrir</a>`:''}
        <button class="btn-secondary btn-sm plg-remove" data-idx="${i}" style="margin-left:auto;color:#e74c3c">Remover</button>
      </div>
    </div>`).join('')}</div>`;
  div.querySelectorAll('.plg-remove').forEach(btn => btn.addEventListener('click', () => {
    const list = loadPlugins(); list.splice(+btn.dataset.idx, 1); savePlugins(list); render(div);
  }));
  div.querySelectorAll('.plg-link').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    if (a.dataset.url) {
      if (typeof window.aer?.openExternal === 'function') {
        window.aer.openExternal(a.dataset.url);
      } else if (typeof window.windowAPI?.openExternal === 'function') {
        window.windowAPI.openExternal(a.dataset.url);
      }
    }
  }));
}
function showAdd(container) {
  const overlay = document.createElement('div'); overlay.className = 'plg-overlay';
  overlay.innerHTML = `<div class="plg-modal">
    <h2>Adicionar Plugin</h2>
    <label>Nome<input id="plg-n" class="input-field" placeholder="Meu Plugin"></label>
    <label>Versao<input id="plg-v" class="input-field" placeholder="1.0.0" value="1.0.0"></label>
    <label>Icone (emoji)<input id="plg-i" class="input-field" placeholder="🧩" value="🧩"></label>
    <label>Categoria<input id="plg-cat" class="input-field" placeholder="Geral" value="Geral"></label>
    <label>URL (opcional)<input id="plg-u" class="input-field" placeholder="https://..."></label>
    <label>Descricao<textarea id="plg-d" class="input-field" rows="3"></textarea></label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button id="plg-cancel" class="btn-secondary">Cancelar</button>
      <button id="plg-save" class="btn-primary">Salvar</button>
    </div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#plg-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#plg-save').addEventListener('click', () => {
    const name = overlay.querySelector('#plg-n').value.trim();
    if (!name) { alert('Nome obrigatorio.'); return; }
    const list = loadPlugins();
    list.push({ name, version: overlay.querySelector('#plg-v').value || '1.0.0', icon: overlay.querySelector('#plg-i').value || '🧩',
      category: overlay.querySelector('#plg-cat').value || 'Geral', url: overlay.querySelector('#plg-u').value.trim() || null,
      description: overlay.querySelector('#plg-d').value.trim() });
    savePlugins(list);
    overlay.remove();
    render(container.querySelector('#plg-content'));
  });
}
function injectStyles() {
  if (document.getElementById('plg-styles')) return;
  const s = document.createElement('style'); s.id = 'plg-styles';
  s.textContent = `.plugins-page{display:flex;flex-direction:column;height:100%;overflow-y:auto}
    .plg-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-12);gap:var(--space-3);color:var(--color-text-muted);text-align:center}
    .plg-empty-icon{font-size:56px}.plg-empty h3{margin:0;color:var(--color-text-primary)}.plg-empty p{margin:0}
    .plg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-5)}
    .plg-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-5);transition:var(--transition-base)}
    .plg-card:hover{border-color:var(--color-accent);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2)}
    .plg-card-header{display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3)}
    .plg-icon{font-size:28px}.plg-name{font-weight:600;font-size:var(--text-base);color:var(--color-text-primary)}.plg-version{font-size:var(--text-xs);color:var(--color-text-muted)}
    .plg-cat{margin-left:auto;background:var(--color-bg-surface-3);color:var(--color-text-secondary)}
    .plg-desc{font-size:var(--text-sm);color:var(--color-text-secondary);margin:0 0 var(--space-4) 0;min-height:40px}
    .plg-footer{display:flex;align-items:center}.plg-link{font-size:var(--text-sm);color:var(--color-accent);text-decoration:none}
    .plg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999}
    .plg-modal{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-2xl);padding:var(--space-8);width:min(420px, 92vw);box-sizing:border-box;display:flex;flex-direction:column;gap:var(--space-4)}
    .plg-modal h2{margin:0}.plg-modal label{display:flex;flex-direction:column;gap:4px;font-size:var(--text-sm);color:var(--color-text-secondary)}
    .input-field{background:var(--color-bg-surface-2);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);padding:8px 12px;color:var(--color-text-primary);font-size:var(--text-sm);outline:none;transition:var(--transition-fast)}
    .input-field:focus{border-color:var(--color-accent)}`;
  document.head.appendChild(s);
}
