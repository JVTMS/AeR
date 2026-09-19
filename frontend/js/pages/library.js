import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Library';
const CATS = ['Todos','Editores de Video','Editores de Imagem','Navegadores','Utilitarios','Jogos','Desenvolvimento','Outros'];
let allItems = [];
export async function mount(container) {
  Logger.info(MODULE, 'Montando Biblioteca...');
  injectStyles();
  container.innerHTML = `<div class="dash-root library-page">
    <div class="dash-header"><div><h1 class="dash-title">Biblioteca de Software</h1><p class="dash-subtitle">Salve seus softwares favoritos para instalar rapidamente</p></div>
    <button id="lib-add" class="btn-primary">+ Adicionar</button></div>
    <div class="lib-filters">
      ${CATS.map(c=>`<button class="lib-filter-btn ${c==='Todos'?'active':''}" data-cat="${c}">${c}</button>`).join('')}
    </div>
    <div id="lib-content"><div class="loading-state"><span class="spinner"></span> Carregando...</div></div></div>`;
  container.querySelector('#lib-add').addEventListener('click', () => showAddModal(container));
  container.querySelectorAll('.lib-filter-btn').forEach(b => b.addEventListener('click', () => {
    container.querySelectorAll('.lib-filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderItems(container.querySelector('#lib-content'), b.dataset.cat);
  }));
  await loadItems(container);
}
export function unmount() {}
async function loadItems(container) {
  const div = container.querySelector('#lib-content');
  try {
    const d = await invoke('library:list');
    allItems = d?.items ?? [];
    renderItems(div, 'Todos');
  } catch(e) { div.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
}
function renderItems(div, cat) {
  const filtered = cat === 'Todos' ? allItems : allItems.filter(i => i.category === cat);
  if (!filtered.length) {
    div.innerHTML = `<div class="lib-empty">
      <div class="lib-empty-icon">📦</div>
      <h3>${cat === 'Todos' ? 'Nenhum software salvo ainda' : `Nenhum software em "${cat}"`}</h3>
      <p>Clique em "+ Adicionar" para salvar um software na sua biblioteca pessoal.</p>
    </div>`; return;
  }
  div.innerHTML = `<div class="lib-grid">${filtered.map((item,i)=>{
    const catIcon = {
      'Editores de Video':'🎬','Editores de Imagem':'🖼️','Navegadores':'🌐','Utilitarios':'🔧',
      'Jogos':'🎮','Desenvolvimento':'💻','Outros':'📦'
    }[item.category] || '📦';
    return `<div class="lib-card" data-id="${item.id}">
      <div class="lib-card-header">
        <div class="lib-app-icon">${item.icon || catIcon}</div>
        <div class="lib-app-info"><div class="lib-app-name">${item.name}</div><div class="lib-app-version">${item.version || ''}</div></div>
        <span class="badge lib-cat-badge">${item.category || 'Outros'}</span>
      </div>
      <p class="lib-app-desc">${item.description || 'Sem descricao.'}</p>
      <div class="lib-card-footer">
        <button class="btn-primary btn-sm lib-install" data-id="${item.id}" data-url="${item.downloadUrl||''}" data-fp="${item.filePath||''}">
          ${item.downloadUrl ? '⬇ Baixar' : '▶ Instalar'}
        </button>
        <button class="btn-secondary btn-sm lib-remove" data-id="${item.id}" style="color:#e74c3c">Remover</button>
      </div>
    </div>`;
  }).join('')}</div>`;
  div.querySelectorAll('.lib-install').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = '⏳ Abrindo...'; btn.disabled = true;
    try { await invoke('library:install', { url: btn.dataset.url || null, filePath: btn.dataset.fp || null }); }
    catch(e) { alert('Erro: ' + e.message); }
    btn.textContent = btn.dataset.url ? '⬇ Baixar' : '▶ Instalar'; btn.disabled = false;
  }));
  div.querySelectorAll('.lib-remove').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remover da biblioteca?')) return;
    try { await invoke('library:remove', { id: btn.dataset.id }); await loadItems(div.closest('.dash-root').parentElement.parentElement); }
    catch(e) { alert('Erro: ' + e.message); }
  }));
}
function showAddModal(container) {
  const overlay = document.createElement('div'); overlay.className = 'plg-overlay';
  overlay.innerHTML = `<div class="plg-modal">
    <h2>📦 Adicionar Software</h2>
    <label>Nome do Software *<input id="lib-n" class="input-field" placeholder="Adobe Premiere Pro"></label>
    <label>Versao<input id="lib-v" class="input-field" placeholder="2024" value=""></label>
    <label>Icone (emoji)<input id="lib-ic" class="input-field" placeholder="🎬" value=""></label>
    <label>Categoria
      <select id="lib-cat" class="input-field">
        ${CATS.filter(c=>c!=='Todos').map(c=>`<option>${c}</option>`).join('')}
      </select></label>
    <label>URL de Download<input id="lib-u" class="input-field" placeholder="https://www.adobe.com/products/premiere.html"></label>
    <label>Caminho do instalador (opcional)<input id="lib-fp" class="input-field" placeholder="C:\\Instaladores\\premiere.exe"></label>
    <label>Descricao<textarea id="lib-d" class="input-field" rows="2" placeholder="Editor de video profissional"></textarea></label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="lib-cancel" class="btn-secondary">Cancelar</button>
      <button id="lib-save" class="btn-primary">Salvar na Biblioteca</button>
    </div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#lib-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#lib-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#lib-n').value.trim();
    if (!name) { alert('Nome obrigatorio!'); return; }
    const item = {
      id: Date.now().toString(),
      name, version: overlay.querySelector('#lib-v').value,
      icon: overlay.querySelector('#lib-ic').value || null,
      category: overlay.querySelector('#lib-cat').value,
      downloadUrl: overlay.querySelector('#lib-u').value.trim() || null,
      filePath: overlay.querySelector('#lib-fp').value.trim() || null,
      description: overlay.querySelector('#lib-d').value.trim(),
      addedAt: new Date().toISOString()
    };
    try {
      await invoke('library:add', item);
      overlay.remove();
      await loadItems(container);
    } catch(e) { alert('Erro: ' + e.message); }
  });
}
function injectStyles() {
  if (document.getElementById('lib-styles')) return;
  const s = document.createElement('style'); s.id = 'lib-styles';
  s.textContent = `.library-page{display:flex;flex-direction:column;height:100%;overflow-y:auto}
    .lib-filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:var(--space-5)}
    .lib-filter-btn{background:var(--color-bg-surface-2);border:1px solid var(--color-border-subtle);border-radius:99px;padding:5px 14px;cursor:pointer;font-size:var(--text-xs);font-weight:500;color:var(--color-text-secondary);transition:var(--transition-fast)}
    .lib-filter-btn.active,.lib-filter-btn:hover{background:var(--color-accent);color:#000;border-color:var(--color-accent)}
    .lib-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-12);gap:var(--space-3);color:var(--color-text-muted);text-align:center}
    .lib-empty-icon{font-size:56px}.lib-empty h3{margin:0;color:var(--color-text-primary)}.lib-empty p{margin:0}
    .lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-5)}
    .lib-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-3);transition:var(--transition-base)}
    .lib-card:hover{border-color:var(--color-accent);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2)}
    .lib-card-header{display:flex;align-items:center;gap:var(--space-3)}
    .lib-app-icon{font-size:32px;width:40px;text-align:center}
    .lib-app-name{font-weight:600;font-size:var(--text-base);color:var(--color-text-primary)}
    .lib-app-version{font-size:var(--text-xs);color:var(--color-text-muted)}
    .lib-cat-badge{margin-left:auto;background:var(--color-bg-surface-3);color:var(--color-text-secondary);font-size:10px;white-space:nowrap}
    .lib-app-desc{font-size:var(--text-sm);color:var(--color-text-secondary);margin:0;flex:1;min-height:36px}
    .lib-card-footer{display:flex;gap:8px;margin-top:auto}`;
  document.head.appendChild(s);
}
