import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Logs';
const FILES = [ { id:'launcher', label:'Launcher', icon:'🚀' }, { id:'backend', label:'Backend', icon:'⚙️' }, { id:'backend-err', label:'Erros Backend', icon:'🔴' } ];
let autoRefresh = null;
export async function mount(container) {
  Logger.info(MODULE, 'Montando Logs...');
  injectStyles();
  container.innerHTML = `<div class="dash-root logs-page">
    <div class="dash-header"><div><h1 class="dash-title">Logs do Sistema</h1><p class="dash-subtitle">Visualizador de logs em tempo real</p></div>
    <div style="display:flex;gap:8px;align-items:center">
      <label class="log-auto-label"><input type="checkbox" id="log-auto"> Auto-atualizar</label>
      <button id="log-clear-view" class="btn-secondary">Limpar Vista</button>
      <button id="log-refresh" class="btn-secondary">↻</button>
    </div></div>
    <div class="log-tabs">${FILES.map(f=>`<button class="log-tab" data-file="${f.id}">${f.icon} ${f.label}</button>`).join('')}</div>
    <div id="log-content" class="log-content-wrap">
      <div class="loading-state"><span class="spinner"></span> Carregando...</div>
    </div></div>`;
  let current = 'launcher';
  container.querySelectorAll('.log-tab').forEach(t => {
    t.addEventListener('click', () => {
      container.querySelectorAll('.log-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      current = t.dataset.file;
      loadLog(container.querySelector('#log-content'), current);
    });
  });
  container.querySelector('.log-tab').classList.add('active');
  container.querySelector('#log-refresh').addEventListener('click', () => loadLog(container.querySelector('#log-content'), current));
  container.querySelector('#log-clear-view').addEventListener('click', () => { container.querySelector('#log-content').innerHTML = '<pre class="log-pre"></pre>'; });
  container.querySelector('#log-auto').addEventListener('change', e => {
    if (autoRefresh) clearInterval(autoRefresh);
    if (e.target.checked) autoRefresh = setInterval(() => loadLog(container.querySelector('#log-content'), current, true), 2000);
  });
  await loadLog(container.querySelector('#log-content'), current);
}
export function unmount() { if (autoRefresh) clearInterval(autoRefresh); autoRefresh = null; }
async function loadLog(div, file, silent = false) {
  if (!silent) div.innerHTML = '<div class="loading-state"><span class="spinner"></span> Lendo arquivo...</div>';
  try {
    const d = await invoke('logs:read', { file });
    const pre = div.querySelector('pre.log-pre') || (() => { div.innerHTML = '<pre class="log-pre"></pre>'; return div.querySelector('pre'); })();
    pre.innerHTML = colorize(d.content || '(vazio)');
    pre.scrollTop = pre.scrollHeight;
    const info = div.querySelector('.log-info') || (() => { const i=document.createElement('div');i.className='log-info';div.appendChild(i);return i; })();
    info.textContent = `${d.file} · ${d.lines} linhas · ${d.sizeKb} KB`;
  } catch(e) { if (!silent) div.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
}
function colorize(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/(\[ERROR\].*)/g,'<span class="log-error">$1</span>')
    .replace(/(\[WARN\].*)/g,'<span class="log-warn">$1</span>')
    .replace(/(\[INFO\].*)/g,'<span class="log-info-line">$1</span>')
    .replace(/(\[\d{2}:\d{2}:\d{2}\])/g,'<span class="log-ts">$1</span>');
}
function injectStyles() {
  if (document.getElementById('log-styles')) return;
  const s = document.createElement('style'); s.id = 'log-styles';
  s.textContent = `.logs-page{display:flex;flex-direction:column;height:100%;overflow:hidden}
    .log-tabs{display:flex;gap:4px;margin-bottom:var(--space-4)}
    .log-tab{background:var(--color-bg-surface-2);border:1px solid var(--color-border-subtle);border-radius:var(--radius-md);padding:6px 14px;cursor:pointer;font-size:var(--text-sm);color:var(--color-text-secondary);transition:var(--transition-fast)}
    .log-tab.active,.log-tab:hover{background:var(--color-accent);color:#000;border-color:var(--color-accent)}
    .log-content-wrap{flex:1;overflow:hidden;display:flex;flex-direction:column;background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl)}
    .log-pre{flex:1;overflow-y:auto;padding:var(--space-4);font-family:monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:var(--color-text-secondary);background:transparent;margin:0}
    .log-error{color:#e74c3c}.log-warn{color:#f39c12}.log-info-line{color:#3498db}.log-ts{color:var(--color-text-muted)}
    .log-info{padding:6px var(--space-4);font-size:var(--text-xs);color:var(--color-text-muted);border-top:1px solid var(--color-border-subtle)}
    .log-auto-label{display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:var(--color-text-secondary);cursor:pointer}`;
  document.head.appendChild(s);
}
