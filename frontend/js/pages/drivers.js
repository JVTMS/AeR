import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Drivers';
const CAT_ICONS = { Display:'\ud83d\udda5\ufe0f', Net:'\ud83c\udf10', Media:'\ud83c\udfa5', HDC:'\ud83d\udcbd', USB:'\ud83d\udd0c', SCSIAdapter:'\ud83d\udcbe', DiskDrive:'\ud83d\uddc2\ufe0f', Bluetooth:'\ud83d\udce1', HIDClass:'\ud83d\uddb1\ufe0f', Monitor:'\ud83d\udcfa', Processor:'\u26a1', Unknown:'\ud83d\udd27' };
export async function mount(container) {
  Logger.info(MODULE, 'Montando Drivers...');
  injectStyles();
  container.innerHTML = `<div class="dash-root drivers-page">
    <div class="dash-header"><div><h1 class="dash-title">Drivers</h1><p class="dash-subtitle">Drivers de dispositivos instalados no sistema</p></div>
    <div style="display:flex;gap:8px"><input id="drv-search" class="drv-search-input" placeholder="\ud83d\udd0d Filtrar drivers..." style="width:220px">
    <button id="drv-refresh" class="btn-secondary">\u21bb</button></div></div>
    <div id="drv-content"><div class="loading-state"><span class="spinner"></span> Consultando WMI...</div></div></div>`;
  let all = [];
  container.querySelector('#drv-refresh').addEventListener('click', async () => { await loadAll(); });
  container.querySelector('#drv-search').addEventListener('input', e => renderList(container.querySelector('#drv-content'), all, e.target.value));
  async function loadAll() {
    const d = container.querySelector('#drv-content');
    d.innerHTML = '<div class="loading-state"><span class="spinner"></span> Consultando WMI (pode demorar)...</div>';
    try { const r = await invoke('drivers:list'); all = r?.drivers ?? []; renderList(d, all, ''); }
    catch(e) { d.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
  }
  await loadAll();
}
export function unmount() {}
function renderList(div, drivers, filter) {
  const q = filter.toLowerCase();
  const filtered = q ? drivers.filter(d => d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)) : drivers;
  if (!filtered.length) { div.innerHTML = '<p class="empty-state">Nenhum driver encontrado.</p>'; return; }
  div.innerHTML = `<div class="drv-table-wrap"><table class="drv-table">
    <thead><tr><th>Driver</th><th>Categoria</th><th>Vers\u00e3o</th><th>Status</th></tr></thead>
    <tbody>${filtered.map(d => {
      const icon = CAT_ICONS[d.category] || '\ud83d\udd27';
      const ok   = d.status?.toLowerCase() === 'ok';
      return `<tr class="drv-row"><td><span class="drv-icon">${icon}</span>${d.name}</td>
        <td><span class="badge category-badge">${d.category}</span></td>
        <td class="drv-ver">${d.version}</td>
        <td><span class="badge ${ok?'status-ok':'status-warn'}">${d.status}</span></td></tr>`;
    }).join('')}</tbody></table></div>
    <div class="drv-count">${filtered.length} driver${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}</div>`;
}
function injectStyles() {
  if (document.getElementById('drv-styles')) return;
  const s = document.createElement('style'); s.id = 'drv-styles';
  s.textContent = `
    .drivers-page{display:flex;flex-direction:column;height:100%;overflow-y:auto}

    /* Input de busca — tema escuro */
    .drv-search-input {
      background: var(--color-bg-surface-1);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-sm);
      font-family: var(--font-ui);
      outline: none;
      transition: border-color var(--transition-fast);
    }
    .drv-search-input::placeholder { color: var(--color-text-muted); }
    .drv-search-input:focus { border-color: var(--color-accent); }

    .drv-table-wrap{overflow-x:auto}.drv-table{width:100%;border-collapse:collapse}
    .drv-table thead th{padding:var(--space-3) var(--space-4);text-align:left;font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--color-border-subtle)}
    .drv-row{transition:var(--transition-fast)}.drv-row:hover{background:var(--color-bg-surface-2)}
    .drv-row td{padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--color-text-primary);border-bottom:1px solid var(--color-border-subtle);vertical-align:middle}
    .drv-icon{margin-right:8px;font-size:16px}.drv-ver{font-family:monospace;font-size:var(--text-xs);color:var(--color-text-muted)}
    .status-ok{background:rgba(46,204,113,.15);color:#2ecc71}.status-warn{background:rgba(241,196,15,.15);color:#f1c40f}
    .drv-count{padding:var(--space-3) var(--space-4);font-size:var(--text-xs);color:var(--color-text-muted);text-align:right}`;
  document.head.appendChild(s);
}

