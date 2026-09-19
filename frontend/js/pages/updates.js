import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Updates';
const CURRENT_VER = '1.0.0';
export async function mount(container) {
  Logger.info(MODULE, 'Montando Atualizacoes...');
  injectStyles();
  container.innerHTML = `<div class="dash-root updates-page">
    <div class="dash-header"><div><h1 class="dash-title">Atualizacoes</h1><p class="dash-subtitle">Verifique por novas versoes do AeR</p></div></div>
    <div id="upd-content"><div class="loading-state"><span class="spinner"></span> Verificando atualizacoes...</div></div></div>`;
  await load(container.querySelector('#upd-content'));
}
export function unmount() {}
async function load(div) {
  div.innerHTML = '<div class="loading-state"><span class="spinner"></span> Verificando...</div>';
  try {
    const d = await invoke('updates:check');
    div.innerHTML = `<div class="upd-card ${d.upToDate?'upd-ok':'upd-new'}">
      <div class="upd-icon">${d.upToDate?'✅':'🎉'}</div>
      <div class="upd-body">
        <h2>${d.upToDate?'Voce esta atualizado!':'Nova versao disponivel!'}</h2>
        <p class="upd-note">${d.releaseNotes}</p>
        <div class="upd-versions">
          <div class="upd-ver-item"><span class="upd-ver-label">Versao atual</span><span class="upd-ver-val">${d.currentVersion}</span></div>
          ${!d.upToDate?`<div class="upd-ver-item"><span class="upd-ver-label">Nova versao</span><span class="upd-ver-val upd-new-val">${d.latestVersion}</span></div>`:''}
        </div>
        <p class="upd-checked">Ultima verificacao: ${d.checkedAt}</p>
        ${!d.upToDate?'<button class="btn-primary upd-download-btn">Baixar Atualizacao</button>':''}
      </div>
    </div>
    <div class="upd-history"><h3>Historico de Versoes</h3>
      <div class="upd-ver-list">
        <div class="upd-ver-entry current"><span class="upd-ver-badge">ATUAL</span><div><b>v1.0.0</b><p>Lancamento inicial — Dashboard, Otimizador, Monitor, 12 modulos e mais.</p></div></div>
      </div>
    </div>`;
    div.querySelector('.upd-download-btn')?.addEventListener('click', () => window.open('https://github.com', '_blank'));
  } catch(e) { div.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
}
function injectStyles() {
  if (document.getElementById('upd-styles')) return;
  const s = document.createElement('style'); s.id = 'upd-styles';
  s.textContent = `.updates-page{display:flex;flex-direction:column;height:100%;overflow-y:auto;gap:var(--space-6)}
    .upd-card{display:flex;gap:var(--space-6);padding:var(--space-8);border-radius:var(--radius-xl);border:1px solid var(--color-border-subtle);background:var(--color-bg-surface-1)}
    .upd-ok{border-color:rgba(46,204,113,.3);background:linear-gradient(135deg,rgba(46,204,113,.05),transparent)}
    .upd-new{border-color:rgba(52,152,219,.3);background:linear-gradient(135deg,rgba(52,152,219,.05),transparent)}
    .upd-icon{font-size:48px;flex-shrink:0}.upd-body h2{margin:0 0 var(--space-2) 0;font-size:var(--text-xl);color:var(--color-text-primary)}
    .upd-note{color:var(--color-text-secondary);margin:0 0 var(--space-4) 0}
    .upd-versions{display:flex;gap:var(--space-6);margin-bottom:var(--space-4)}
    .upd-ver-item{display:flex;flex-direction:column;gap:4px}.upd-ver-label{font-size:var(--text-xs);color:var(--color-text-muted);text-transform:uppercase}
    .upd-ver-val{font-size:var(--text-lg);font-weight:700;font-family:monospace;color:var(--color-text-primary)}.upd-new-val{color:#3498db}
    .upd-checked{font-size:var(--text-xs);color:var(--color-text-muted);margin:0 0 var(--space-4) 0}
    .upd-download-btn{margin-top:var(--space-2)}
    .upd-history h3{margin:0 0 var(--space-4) 0;font-size:var(--text-base);color:var(--color-text-primary)}
    .upd-ver-list{display:flex;flex-direction:column;gap:var(--space-3)}
    .upd-ver-entry{display:flex;gap:var(--space-4);padding:var(--space-4);border-radius:var(--radius-lg);border:1px solid var(--color-border-subtle);background:var(--color-bg-surface-1)}
    .upd-ver-entry.current{border-color:rgba(46,204,113,.3)}.upd-ver-badge{background:rgba(46,204,113,.2);color:#2ecc71;padding:3px 8px;border-radius:99px;font-size:var(--text-xs);font-weight:700;white-space:nowrap;height:fit-content}
    .upd-ver-entry b{display:block;margin-bottom:4px}.upd-ver-entry p{margin:0;font-size:var(--text-sm);color:var(--color-text-secondary)}`;
  document.head.appendChild(s);
}
