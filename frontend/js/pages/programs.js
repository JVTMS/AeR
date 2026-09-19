import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Programs';

let programs  = [];
let filtered  = [];
let sortKey   = 'name';
let sortAsc   = true;
let searchQ   = '';
let activeFilter = 'all';
let selected  = new Set();
let contentDiv = null;

export async function mount(container) {
  Logger.info(MODULE, 'Montando Gerenciador de Programas...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root prg-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Programas Instalados</h1>
          <p class="dash-subtitle" id="prg-subtitle">Carregando...</p>
        </div>
        <div class="prg-actions">
          <button class="btn-secondary" id="prg-refresh">\u21bb Atualizar</button>
          <button class="btn-danger" id="prg-uninstall-selected" disabled>
            \ud83d\uddd1 Desinstalar Selecionados (<span id="prg-sel-count">0</span>)
          </button>
        </div>
      </div>

      <div class="prg-toolbar">
        <div class="prg-search-wrap">
          <span class="prg-search-icon">🔍</span>
          <input type="text" id="prg-search" class="prg-search" placeholder="Buscar por nome ou editor...">
        </div>
        <div class="prg-filter-tabs">
          <button class="prg-tab active" data-filter="all">Todos</button>
          <button class="prg-tab" data-filter="games">🎮 Jogos</button>
          <button class="prg-tab" data-filter="microsoft">🪟 Microsoft</button>
          <button class="prg-tab" data-filter="third">🔧 Terceiros</button>
        </div>
      </div>

      <div class="prg-table-wrap" id="prg-table-wrap">
        <div class="loading-state"><span class="spinner"></span> Lendo programas instalados...</div>
      </div>
    </div>

    <div id="prg-modal-overlay" class="prg-modal-overlay" style="display:none">
      <div class="prg-modal">
        <div class="prg-modal-header">
          <h2 id="prg-modal-title">Confirmar Desinstalação</h2>
          <button id="prg-modal-close" class="btn-icon">✕</button>
        </div>
        <div id="prg-modal-body" class="prg-modal-body"></div>
        <div class="prg-modal-footer">
          <button id="prg-btn-cancel" class="btn-secondary">Cancelar</button>
          <button id="prg-btn-confirm" class="btn-danger">\ud83d\uddd1 Desinstalar Agora</button>
        </div>
      </div>
    </div>
  `;

  contentDiv = container.querySelector('#prg-table-wrap');

  const searchInput = container.querySelector('#prg-search');
  searchInput.addEventListener('input', () => {
    searchQ = searchInput.value;
    applyFilters(); renderTable();
  });

  container.querySelectorAll('.prg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.prg-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      applyFilters(); renderTable();
    });
  });

  container.querySelector('#prg-refresh').addEventListener('click', () => loadPrograms());
  container.querySelector('#prg-uninstall-selected').addEventListener('click', () => {
    const toRemove = programs.filter(p => selected.has(p.name));
    showModal(toRemove);
  });
  container.querySelector('#prg-modal-close').addEventListener('click', closeModal);
  container.querySelector('#prg-btn-cancel').addEventListener('click', closeModal);
  container.querySelector('#prg-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'prg-modal-overlay') closeModal();
  });

  await loadPrograms();
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando...');
  programs = []; filtered = []; selected.clear(); contentDiv = null;
}

async function loadPrograms() {
  if (!contentDiv) return;
  contentDiv.innerHTML = '<div class="loading-state"><span class="spinner"></span> Lendo programas instalados...</div>';
  selected.clear(); updateSelectionUI();
  try {
    const data = await invoke('programs:list');
    programs = Array.isArray(data) ? data : [];
    applyFilters(); renderTable();
    const totalBytes = programs.reduce((s, p) => s + (p.sizeBytes || 0), 0);
    const sub = document.querySelector('#prg-subtitle');
    if (sub) sub.textContent = `${programs.length} programas instalados · ${formatBytes(totalBytes)} total`;
  } catch (err) {
    Logger.error(MODULE, 'Erro ao carregar programas', err);
    if (contentDiv) contentDiv.innerHTML = `<div class="loading-state" style="color:var(--color-accent-danger)">
      ⚠ Falha ao carregar: ${err.message || err}
    </div>`;
  }
}

function applyFilters() {
  const q = searchQ.toLowerCase();
  filtered = programs.filter(p => {
    const matchText = !q ||
      (p.name||'').toLowerCase().includes(q) ||
      (p.publisher||'').toLowerCase().includes(q);
    const pub  = (p.publisher||'').toLowerCase();
    const name = (p.name||'').toLowerCase();
    const matchCat = activeFilter === 'all'
      || (activeFilter === 'games'     && isGame(name, pub))
      || (activeFilter === 'microsoft' && pub.includes('microsoft'))
      || (activeFilter === 'third'     && !pub.includes('microsoft') && !isGame(name, pub));
    return matchText && matchCat;
  });
  sortFiltered();
}

function isGame(name, pub) {
  return ['game','steam','riot','epic','ubisoft','ea ','valve','valorant',
    'minecraft','battle','blizzard','vrchat','roblox'].some(k => name.includes(k)||pub.includes(k));
}

function sortFiltered() {
  filtered.sort((a, b) => {
    let va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
    if (sortKey === 'sizeBytes') { va = Number(va); vb = Number(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ?  1 : -1;
    return 0;
  });
}

function renderTable() {
  if (!contentDiv) return;
  if (filtered.length === 0) {
    contentDiv.innerHTML = `<div class="loading-state" style="color:var(--color-text-muted)">
      Nenhum programa encontrado${searchQ ? ` para "${searchQ}"` : ''}.
    </div>`; return;
  }
  const cols = [
    { key:'name', label:'Nome' }, { key:'publisher', label:'Editor' },
    { key:'installedDate', label:'Instalado em' }, { key:'sizeBytes', label:'Tamanho' },
    { key:'version', label:'Versão' },
  ];
  const allSel = filtered.length > 0 && filtered.every(p => selected.has(p.name));
  contentDiv.innerHTML = `
    <table class="prg-table">
      <thead><tr>
        <th class="prg-check-col"><input type="checkbox" id="prg-check-all" ${allSel?'checked':''}></th>
        ${cols.map(c=>`<th class="prg-th${sortKey===c.key?' sort-active':''}" data-col="${c.key}">${c.label}${sortKey===c.key?(sortAsc?'↑':'↓'):''}</th>`).join('')}
        <th>Ação</th>
      </tr></thead>
      <tbody>${filtered.map(p=>`
        <tr class="prg-row${selected.has(p.name)?' selected':''}" data-name="${esc(p.name)}">
          <td class="prg-check-col"><input type="checkbox" class="prg-check" data-name="${esc(p.name)}" ${selected.has(p.name)?'checked':''}></td>
          <td class="prg-name-cell"><span class="prg-icon">${icon(p.name,p.publisher)}</span><span class="prg-name">${esc(p.name)}</span></td>
          <td class="prg-publisher">${esc(p.publisher||'—')}</td>
          <td class="prg-date">${p.installedDate||'—'}</td>
          <td class="prg-size">${p.sizeDisplay||'—'}</td>
          <td class="prg-version">${esc(p.version||'—')}</td>
          <td><button class="btn-uninstall" data-name="${esc(p.name)}" title="Desinstalar">🗑</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="prg-footer">Mostrando ${filtered.length} de ${programs.length} programas${selected.size>0?` · <strong>${selected.size} selecionados</strong>`:''}</div>
  `;
  contentDiv.querySelector('#prg-check-all')?.addEventListener('change', e => {
    if (e.target.checked) filtered.forEach(p=>selected.add(p.name));
    else filtered.forEach(p=>selected.delete(p.name));
    renderTable(); updateSelectionUI();
  });
  contentDiv.querySelectorAll('.prg-check').forEach(chk => {
    chk.addEventListener('change', e => {
      const n = e.target.dataset.name;
      if (e.target.checked) selected.add(n); else selected.delete(n);
      e.target.closest('tr').classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
  contentDiv.querySelectorAll('.prg-th').forEach(th => {
    th.addEventListener('click', () => {
      if (sortKey === th.dataset.col) sortAsc = !sortAsc; else { sortKey = th.dataset.col; sortAsc = true; }
      sortFiltered(); renderTable();
    });
  });
  contentDiv.querySelectorAll('.btn-uninstall').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const p = programs.find(x => x.name === btn.dataset.name);
      if (p) showModal([p]);
    });
  });
}

function updateSelectionUI() {
  const btn = document.querySelector('#prg-uninstall-selected');
  const cnt = document.querySelector('#prg-sel-count');
  if (btn) btn.disabled = selected.size === 0;
  if (cnt) cnt.textContent = selected.size;
}

function showModal(progs) {
  const overlay = document.querySelector('#prg-modal-overlay'); if (!overlay) return;
  const totalBytes = progs.reduce((s,p)=>s+(p.sizeBytes||0),0);
  document.querySelector('#prg-modal-title').textContent =
    progs.length===1?`Desinstalar ${progs[0].name}`:`Desinstalar ${progs.length} programas`;
  document.querySelector('#prg-modal-body').innerHTML = `
    <div class="prg-modal-list">
      ${progs.map(p=>`<div class="prg-modal-item">
        <span class="prg-icon">${icon(p.name,p.publisher)}</span>
        <div><strong>${esc(p.name)}</strong>
          <div style="font-size:12px;color:var(--color-text-muted)">${esc(p.publisher||'')} · ${p.sizeDisplay||'—'}</div>
        </div></div>`).join('')}
    </div>
    ${totalBytes>0?`<div class="prg-modal-space">💾 Espaço a liberar: <strong>${formatBytes(totalBytes)}</strong></div>`:''}
    <div class="prg-modal-warn">⚠ Esta ação não pode ser desfeita. Tem certeza?</div>
    <label class="prg-silent-label"><input type="checkbox" id="prg-silent-chk" checked> Desinstalação silenciosa (sem janelas adicionais, quando disponível)</label>
  `;
  overlay.style.display = 'flex';
  const confirmBtn = document.querySelector('#prg-btn-confirm');
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener('click', () => {
    const silent = document.querySelector('#prg-silent-chk')?.checked ?? true;
    closeModal(); uninstallPrograms(progs, silent);
  });
}

function closeModal() {
  const o = document.querySelector('#prg-modal-overlay'); if (o) o.style.display = 'none';
}

async function uninstallPrograms(progs, silent) {
  if (!contentDiv) return;
  for (const prog of progs) {
    contentDiv.innerHTML = `<div class="loading-state"><span class="spinner"></span> Desinstalando <strong>${esc(prog.name)}</strong>...</div>`;
    try {
      const result = await invoke('programs:uninstall', {
        uninstallCommand: prog.uninstallCommand,
        quietUninstallCommand: prog.quietUninstallCommand,
        silent,
      });
      if (result?.success) {
        programs = result.programs || programs.filter(p=>p.name!==prog.name);
        selected.delete(prog.name);
        applyFilters();
      } else {
        showToast(`⚠ Falha: ${result?.message||'Erro desconhecido'}`, 'error');
      }
    } catch(err) {
      Logger.error(MODULE, 'Erro ao desinstalar', err);
      showToast(`⚠ ${err.message||err}`, 'error');
    }
  }
  updateSelectionUI(); renderTable();
  const sub = document.querySelector('#prg-subtitle');
  if (sub) { const tb = programs.reduce((s,p)=>s+(p.sizeBytes||0),0); sub.textContent=`${programs.length} programas instalados · ${formatBytes(tb)} total`; }
}

function icon(name, pub) {
  const n=(name||'').toLowerCase(), p=(pub||'').toLowerCase();
  if (n.includes('steam')||p.includes('valve'))     return '🎮';
  if (n.includes('valorant')||p.includes('riot'))   return '🎮';
  if (n.includes('discord'))                         return '💬';
  if (n.includes('spotify'))                         return '🎵';
  if (n.includes('adobe'))                           return '🎨';
  if (n.includes('chrome')||n.includes('firefox'))  return '🌐';
  if (n.includes('nvidia')||n.includes('geforce'))  return '🖥';
  if (p.includes('microsoft'))                       return '🪟';
  if (n.includes('python'))                          return '🐍';
  if (n.includes('visual studio')||n.includes('vscode')) return '💻';
  if (n.includes('driver')||n.includes('realtek'))  return '🔧';
  if (n.includes('winrar')||n.includes('7-zip'))    return '📦';
  if (n.includes('obs'))                             return '📹';
  return '📦';
}

function formatBytes(b) {
  if (!b||b<=0) return '—';
  if (b<1048576) return `${(b/1024).toFixed(0)} KB`;
  if (b<1073741824) return `${(b/1048576).toFixed(2)} MB`;
  return `${(b/1073741824).toFixed(2)} GB`;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type='info') {
  const t=document.createElement('div'); t.className=`aer-toast toast-${type}`; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),4000);
}

function injectStyles() {
  if (document.getElementById('prg-styles')) return;
  const style = document.createElement('style');
  style.id = 'prg-styles';
  style.textContent = `
    .prg-page { display:flex; flex-direction:column; gap:var(--space-4); }
    .prg-actions { display:flex; gap:var(--space-3); align-items:center; }
    .prg-toolbar { display:flex; gap:var(--space-4); align-items:center; flex-wrap:wrap; margin-bottom:var(--space-2); }
    .prg-search-wrap { position:relative; flex:1; min-width:200px; }
    .prg-search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); pointer-events:none; }
    .prg-search { width:100%; padding:8px 12px 8px 36px; background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); color:var(--color-text-primary); font-size:var(--text-sm); box-sizing:border-box; transition:border-color .15s; }
    .prg-search:focus { outline:none; border-color:var(--color-accent-primary); }
    .prg-filter-tabs { display:flex; gap:var(--space-2); flex-wrap:wrap; }
    .prg-tab { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:6px 14px; border-radius:var(--radius-xl); cursor:pointer; font-size:var(--text-sm); transition:all .12s; }
    .prg-tab:hover { border-color:var(--color-accent-primary); }
    .prg-tab.active { background:var(--color-accent-primary); color:#000; border-color:var(--color-accent-primary); font-weight:600; }
    .prg-table-wrap { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); overflow:auto; max-height:calc(100vh - 270px); }
    .prg-table { width:100%; border-collapse:collapse; min-width:700px; }
    .prg-table thead { position:sticky; top:0; z-index:2; }
    .prg-th { text-align:left; padding:10px 14px; background:var(--color-bg-surface-2); font-size:var(--text-xs); font-weight:600; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:.5px; cursor:pointer; user-select:none; border-bottom:1px solid var(--color-border-subtle); white-space:nowrap; transition:color .12s; }
    .prg-th:hover,.prg-th.sort-active { color:var(--color-accent-primary); }
    .prg-check-col { width:36px; padding:10px 8px; }
    .prg-row { border-bottom:1px solid var(--color-border-subtle); transition:background .1s; }
    .prg-row:last-child { border-bottom:none; }
    .prg-row:hover { background:rgba(255,255,255,.03); }
    .prg-row.selected { background:rgba(0,255,136,.08); }
    .prg-row td { padding:9px 14px; font-size:var(--text-sm); vertical-align:middle; }
    .prg-name-cell { display:flex; align-items:center; gap:8px; max-width:300px; }
    .prg-icon { font-size:16px; flex-shrink:0; }
    .prg-name { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .prg-publisher,.prg-date,.prg-version { color:var(--color-text-secondary); white-space:nowrap; }
    .prg-size { font-family:var(--font-mono); font-size:12px; white-space:nowrap; }
    .btn-uninstall { background:none; border:1px solid var(--color-border-subtle); border-radius:var(--radius-md); padding:4px 8px; cursor:pointer; font-size:14px; transition:all .12s; color:var(--color-text-secondary); }
    .btn-uninstall:hover { background:rgba(255,59,48,.15); border-color:#ff3b30; color:#ff3b30; }
    .prg-footer { padding:10px 16px; font-size:var(--text-xs); color:var(--color-text-muted); border-top:1px solid var(--color-border-subtle); }
    .prg-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.65); display:flex; align-items:center; justify-content:center; z-index:200; }
    .prg-modal { background:var(--color-bg-surface-1); border:1px solid var(--color-border-default); border-radius:var(--radius-xl); width:min(540px,90vw); max-height:80vh; overflow-y:auto; box-shadow:0 24px 64px rgba(0,0,0,.6); }
    .prg-modal-header { display:flex; justify-content:space-between; align-items:center; padding:var(--space-4) var(--space-5); border-bottom:1px solid var(--color-border-subtle); }
    .prg-modal-body { padding:var(--space-4) var(--space-5); }
    .prg-modal-list { display:flex; flex-direction:column; gap:var(--space-3); margin-bottom:var(--space-3); }
    .prg-modal-item { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-2) var(--space-3); background:var(--color-bg-surface-2); border-radius:var(--radius-lg); }
    .prg-modal-space { margin:var(--space-3) 0; padding:var(--space-2) var(--space-3); background:rgba(0,255,136,.1); border-radius:var(--radius-lg); font-size:var(--text-sm); }
    .prg-modal-warn { color:#f39c12; font-size:var(--text-sm); margin:var(--space-3) 0 var(--space-2); }
    .prg-silent-label { display:flex; align-items:center; gap:var(--space-2); font-size:var(--text-sm); color:var(--color-text-secondary); cursor:pointer; }
    .prg-modal-footer { display:flex; justify-content:flex-end; gap:var(--space-3); padding:var(--space-4) var(--space-5); border-top:1px solid var(--color-border-subtle); }
    .btn-danger { background:#ff3b30; color:#fff; border:none; border-radius:var(--radius-lg); padding:8px 18px; font-size:var(--text-sm); font-weight:600; cursor:pointer; transition:opacity .15s; }
    .btn-danger:hover { opacity:.85; } .btn-danger:disabled { opacity:.4; cursor:not-allowed; }
    .aer-toast { position:fixed; bottom:24px; right:24px; z-index:9999; padding:12px 20px; border-radius:var(--radius-lg); font-size:var(--text-sm); font-weight:500; animation:fadeInUp .25s ease; }
    .toast-error { background:#ff3b30; color:#fff; }
    .toast-info  { background:var(--color-bg-surface-2); color:var(--color-text-primary); border:1px solid var(--color-border-default); }
    @keyframes fadeInUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  `;
  document.head.appendChild(style);
}
