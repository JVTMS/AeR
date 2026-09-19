import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Security';
export async function mount(container) {
  Logger.info(MODULE, 'Montando Seguran\u00e7a...');
  injectStyles();
  container.innerHTML = `<div class="dash-root security-page">
    <div class="dash-header"><div><h1 class="dash-title">Seguran\u00e7a</h1><p class="dash-subtitle">Status do Windows Defender, Firewall e processos suspeitos</p></div>
    <button id="sec-refresh" class="btn-secondary">\u21bb Verificar</button></div>
    <div id="sec-content"><div class="loading-state"><span class="spinner"></span> Verificando...</div></div></div>`;
  container.querySelector('#sec-refresh').addEventListener('click', () => load(container.querySelector('#sec-content')));
  await load(container.querySelector('#sec-content'));
}
export function unmount() {}
async function load(div) {
  div.innerHTML = '<div class="loading-state"><span class="spinner"></span> Verificando seguran\u00e7a...</div>';
  try {
    const d = await invoke('security:status');
    render(div, d);
  } catch(e) { div.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
}
function render(div, d) {
  const scoreColor = d.score >= 80 ? '#2ecc71' : d.score >= 50 ? '#f39c12' : '#e74c3c';
  const scoreLabel = d.score >= 80 ? 'Protegido' : d.score >= 50 ? 'Atencao' : 'Vulneravel';
  div.innerHTML = `
    <div class="sec-grid">
      <div class="sec-score-card">
        <div class="sec-score-ring" style="--score-color:${scoreColor}">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-bg-surface-3)" stroke-width="10"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="${scoreColor}" stroke-width="10"
            stroke-dasharray="${2.64*d.score} 264" stroke-linecap="round" transform="rotate(-90 50 50)"/></svg>
          <div class="sec-score-val">${d.score}<span>%</span></div>
        </div>
        <div class="sec-score-label" style="color:${scoreColor}">${scoreLabel}</div>
      </div>
      <div class="sec-items">
        <div class="sec-item ${d.defender.enabled?'sec-ok':'sec-bad'}">
          <div class="sec-item-icon">${d.defender.enabled?'🛡️':'⚠️'}</div>
          <div><div class="sec-item-name">Windows Defender</div><div class="sec-item-val">${d.defender.status}</div></div>
          <div class="sec-item-badge ${d.defender.enabled?'badge-ok':'badge-bad'}">${d.defender.enabled?'ATIVO':'DESATIVADO'}</div>
        </div>
        <div class="sec-item ${d.firewall.enabled?'sec-ok':'sec-bad'}">
          <div class="sec-item-icon">${d.firewall.enabled?'🔥':'⚠️'}</div>
          <div><div class="sec-item-name">Firewall do Windows</div><div class="sec-item-val">${d.firewall.enabled?'Perfis Ativos':'Desativado'}</div></div>
          <div class="sec-item-badge ${d.firewall.enabled?'badge-ok':'badge-bad'}">${d.firewall.enabled?'ATIVO':'DESATIVADO'}</div>
        </div>
      </div>
    </div>
    ${(d.suspiciousProcesses?.length||0)>0?`
    <div class="sec-section"><h3>Processos em Sessao do Sistema</h3>
      <table class="drv-table"><thead><tr><th>Nome</th><th>PID</th></tr></thead>
      <tbody>${d.suspiciousProcesses.map(p=>`<tr class="drv-row"><td>${p.name}</td><td>${p.pid}</td></tr>`).join('')}</tbody></table>
    </div>`:''}`;
}
function injectStyles() {
  if (document.getElementById('sec-styles')) return;
  const s = document.createElement('style'); s.id = 'sec-styles';
  s.textContent = `.security-page{display:flex;flex-direction:column;height:100%;overflow-y:auto}
    .sec-grid{display:grid;grid-template-columns:220px 1fr;gap:var(--space-6);margin-bottom:var(--space-6);align-items:start}
    .sec-score-card{display:flex;flex-direction:column;align-items:center;gap:var(--space-3);background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-6)}
    .sec-score-ring{position:relative;width:120px;height:120px}.sec-score-ring svg{position:absolute;inset:0;width:100%;height:100%}
    .sec-score-val{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:var(--color-text-primary)}
    .sec-score-val span{font-size:14px;margin-left:1px}.sec-score-label{font-weight:600;font-size:var(--text-base)}
    .sec-items{display:flex;flex-direction:column;gap:var(--space-4)}
    .sec-item{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4) var(--space-5);border-radius:var(--radius-xl);border:1px solid var(--color-border-subtle);background:var(--color-bg-surface-1)}
    .sec-ok{border-color:rgba(46,204,113,.3);background:rgba(46,204,113,.05)}.sec-bad{border-color:rgba(231,76,60,.3);background:rgba(231,76,60,.05)}
    .sec-item-icon{font-size:28px}.sec-item-name{font-weight:600;font-size:var(--text-base);color:var(--color-text-primary)}.sec-item-val{font-size:var(--text-sm);color:var(--color-text-muted)}
    .sec-item-badge{margin-left:auto;padding:4px 10px;border-radius:99px;font-size:var(--text-xs);font-weight:700}
    .badge-ok{background:rgba(46,204,113,.2);color:#2ecc71}.badge-bad{background:rgba(231,76,60,.2);color:#e74c3c}
    .sec-section{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-5)}
    .sec-section h3{margin:0 0 var(--space-4) 0;font-size:var(--text-base);color:var(--color-text-primary)}`;
  document.head.appendChild(s);
}
