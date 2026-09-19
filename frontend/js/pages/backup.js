import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Backup';
export async function mount(container) {
  Logger.info(MODULE, 'Montando Backup...');
  injectStyles();
  container.innerHTML = `<div class="dash-root backup-page">
    <div class="dash-header"><div><h1 class="dash-title">Backup</h1><p class="dash-subtitle">Crie e restaure backups do registro e configuracoes do sistema</p></div>
    <button id="bk-create" class="btn-primary">+ Novo Backup</button></div>
    <div id="bk-list"><div class="loading-state"><span class="spinner"></span> Carregando...</div></div>
    <div id="bk-toast"></div></div>`;
  container.querySelector('#bk-create').addEventListener('click', () => showCreateModal(container));
  await loadList(container);
}
export function unmount() {}
async function loadList(container) {
  const div = container.querySelector('#bk-list');
  try {
    const d = await invoke('backup:list');
    const list = d?.backups ?? [];
    if (!list.length) { div.innerHTML = '<div class="bk-empty">Nenhum backup encontrado. Clique em "+ Novo Backup" para comecar.</div>'; return; }
    div.innerHTML = `<div class="bk-table-wrap"><table class="drv-table">
      <thead><tr><th>Nome</th><th>Tipo</th><th>Tamanho</th><th>Criado em</th><th>Acoes</th></tr></thead>
      <tbody>${list.map(b=>`<tr class="drv-row" data-path="${b.path}">
        <td><span class="bk-icon">${b.type==='reg'?'🗃️':'📄'}</span>${b.name}</td>
        <td><span class="badge category-badge">${b.type.toUpperCase()}</span></td>
        <td>${b.sizeKb} KB</td><td>${b.created}</td>
        <td style="display:flex;gap:6px">
          <button class="btn-secondary btn-sm bk-restore" data-path="${b.path}">Restaurar</button>
          <button class="btn-secondary btn-sm bk-delete" data-path="${b.path}" style="color:#e74c3c">Excluir</button>
        </td></tr>`).join('')}</tbody></table></div>`;
    div.querySelectorAll('.bk-restore').forEach(btn => btn.addEventListener('click', () => restore(btn.dataset.path, container)));
    div.querySelectorAll('.bk-delete').forEach(btn => btn.addEventListener('click', () => del(btn.dataset.path, container)));
  } catch(e) { div.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
}
function toast(container, msg, type='info') {
  const t = container.querySelector('#bk-toast');
  t.innerHTML = `<div class="bk-toast bk-toast-${type}">${msg}</div>`;
  setTimeout(() => { t.innerHTML = ''; }, 4000);
}
async function restore(path, container) {
  if (!confirm('Restaurar este backup? O sistema sera revertido.')) return;
  try { await invoke('backup:restore', { path }); toast(container, 'Backup restaurado com sucesso!', 'ok'); await loadList(container); }
  catch(e) { toast(container, 'Erro: ' + e.message, 'err'); }
}
async function del(path, container) {
  if (!confirm('Excluir este backup permanentemente?')) return;
  try { await invoke('backup:delete', { path }); toast(container, 'Backup excluido.', 'ok'); await loadList(container); }
  catch(e) { toast(container, 'Erro: ' + e.message, 'err'); }
}
function showCreateModal(container) {
  const name = prompt('Nome do backup:', 'meu-backup-' + new Date().toISOString().slice(0,10));
  if (!name) return;
  invoke('backup:create', { name, type: 'system' })
    .then(() => { toast(container, 'Backup criado com sucesso!', 'ok'); loadList(container); })
    .catch(e => toast(container, 'Erro: ' + e.message, 'err'));
}
function injectStyles() {
  if (document.getElementById('bk-styles')) return;
  const s = document.createElement('style'); s.id = 'bk-styles';
  s.textContent = `.backup-page{display:flex;flex-direction:column;height:100%;overflow-y:auto}
    .bk-empty{padding:var(--space-8);text-align:center;color:var(--color-text-muted);background:var(--color-bg-surface-1);border:1px dashed var(--color-border-subtle);border-radius:var(--radius-xl)}
    .bk-icon{margin-right:8px}.bk-table-wrap{overflow-x:auto}
    .btn-sm{padding:4px 10px;font-size:var(--text-xs)}
    .bk-toast{padding:12px 20px;border-radius:var(--radius-lg);margin-top:16px;font-size:var(--text-sm);font-weight:500}
    .bk-toast-ok{background:rgba(46,204,113,.15);color:#2ecc71;border:1px solid rgba(46,204,113,.3)}
    .bk-toast-err{background:rgba(231,76,60,.15);color:#e74c3c;border:1px solid rgba(231,76,60,.3)}
    .bk-toast-info{background:rgba(52,152,219,.15);color:#3498db;border:1px solid rgba(52,152,219,.3)}`;
  document.head.appendChild(s);
}
