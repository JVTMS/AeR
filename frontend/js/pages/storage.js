import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';
const MODULE = 'Storage';

export async function mount(container) {
  Logger.info(MODULE, 'Montando Armazenamento...');
  injectStyles();
  container.innerHTML = `<div class="dash-root storage-page">
    <div class="dash-header"><div><h1 class="dash-title">Armazenamento</h1><p class="dash-subtitle">Visão geral de todos os discos, partições e saúde S.M.A.R.T.</p></div>
    <button id="storage-refresh" class="btn-secondary">↺ Atualizar</button></div>
    <div id="storage-content"><div class="loading-state"><span class="spinner"></span> Lendo discos...</div></div>
    <!-- Saúde S.M.A.R.T. (Fase 27) -->
    <div class="storage-section-title">💾 Saúde S.M.A.R.T. dos Discos</div>
    <div id="smart-content"><div class="loading-state"><span class="spinner"></span> Lendo dados S.M.A.R.T....</div></div>
  </div>`;
  container.querySelector('#storage-refresh').addEventListener('click', () => {
    load(container.querySelector('#storage-content'));
    loadSmart(container.querySelector('#smart-content'));
  });
  await load(container.querySelector('#storage-content'));
  await loadSmart(container.querySelector('#smart-content'));
}

export function unmount() {}

async function load(div) {
  try {
    div.innerHTML = '<div class="loading-state"><span class="spinner"></span> Lendo discos...</div>';
    const data = await invoke('storage:list');
    if (!data?.disks?.length) { div.innerHTML = '<p class="empty-state">Nenhum disco encontrado.</p>'; return; }
    render(div, data.disks);
  } catch (e) { div.innerHTML = `<div class="error-state">Erro: ${e.message}</div>`; }
}

async function loadSmart(div) {
  try {
    div.innerHTML = '<div class="loading-state"><span class="spinner"></span> Lendo S.M.A.R.T....</div>';
    const disks = await invoke('disk:health');
    if (!disks?.length) { div.innerHTML = '<p class="empty-state" style="font-size:13px">S.M.A.R.T. não disponível neste sistema (requer acesso WMI de administrador).</p>'; return; }
    renderSmart(div, disks);
  } catch (e) {
    div.innerHTML = `<p class="empty-state" style="font-size:13px">S.M.A.R.T. indisponível: ${e.message}</p>`;
  }
}

function render(div, disks) {
  div.innerHTML = `<div class="storage-grid">${disks.map(d => {
    const icon  = d.type === 'CDRom' ? '💿' : d.type === 'Network' ? '🌐' : d.type === 'Removable' ? '💾' : '💽';
    const color = d.usedPct > 85 ? '#e74c3c' : d.usedPct > 65 ? '#f39c12' : '#2ecc71';
    return `<div class="storage-card">
      <div class="storage-card__header">
        <span class="storage-icon">${icon}</span>
        <div><div class="storage-label">${d.label}</div><div class="storage-meta">${d.type} · ${d.format}</div></div>
        <div class="storage-pct" style="color:${color}">${d.usedPct}%</div>
      </div>
      <div class="storage-bar-bg"><div class="storage-bar-fill" style="width:${d.usedPct}%;background:${color}"></div></div>
      <div class="storage-stats">
        <div class="storage-stat"><span class="st-label">Usado</span><span class="st-val" style="color:${color}">${d.usedGB} GB</span></div>
        <div class="storage-stat"><span class="st-label">Livre</span><span class="st-val" style="color:#2ecc71">${d.freeGB} GB</span></div>
        <div class="storage-stat"><span class="st-label">Total</span><span class="st-val">${d.totalGB} GB</span></div>
      </div></div>`; }).join('')}</div>`;
}

function renderSmart(div, disks) {
  // Mapeamento de código ASCII para labels e cores (sem acentos no backend)
  const statusLabel = (s) => s === 'healthy' ? 'Saud\u00e1vel' : s === 'warning' ? 'Aten\u00e7\u00e3o' : 'Cr\u00edtico';
  const statusColor = (s) => s === 'healthy' ? '#00ff88' : s === 'warning' ? '#f39c12' : '#ff3b30';
  const statusIcon  = (s) => s === 'healthy' ? '\u2705' : s === 'warning' ? '\u26a0\ufe0f' : '\ud83d\udd34';
  const tempColor   = (t) => t === 0 ? '#888' : t > 55 ? '#ff3b30' : t > 45 ? '#f39c12' : '#00ff88';
  const healthBar   = (h) => h >= 80 ? '#00ff88' : h >= 50 ? '#f39c12' : '#ff3b30';

  div.innerHTML = `<div class="smart-grid">${disks.map(d => `
    <div class="smart-card">
      <div class="smart-card-header">
        <span class="smart-disk-icon">${d.isSsd ? '\u26a1' : '\ud83d\udcbd'}</span>
        <div class="smart-disk-info">
          <div class="smart-disk-model">${d.model || 'Disco'}</div>
          <div class="smart-disk-meta">${d.driveLetters ? d.driveLetters + ' \u00b7 ' : ''}${d.sizeDisplay}${d.isSsd ? ' \u00b7 SSD' : ' \u00b7 HDD'}</div>
        </div>
        <div class="smart-status-badge" style="color:${statusColor(d.status)};border-color:${statusColor(d.status)}">
          ${statusIcon(d.status)} ${statusLabel(d.status)}
        </div>
      </div>
      <div class="smart-health-row">
        <span class="smart-health-label">Sa\u00fade</span>
        <div class="smart-health-track">
          <div class="smart-health-fill" style="width:${d.healthPercent}%;background:${healthBar(d.healthPercent)}"></div>
        </div>
        <span class="smart-health-val" style="color:${healthBar(d.healthPercent)}">${d.healthPercent}%</span>
      </div>
      <div class="smart-stats">
        <div class="smart-stat">
          <span class="smart-stat-k">\ud83c\udf21 Temperatura</span>
          <span class="smart-stat-v" style="color:${tempColor(d.temperatureC)}">${d.temperatureC > 0 ? d.temperatureC + '\u00b0C' : 'N/A'}</span>
        </div>
        <div class="smart-stat">
          <span class="smart-stat-k">\u23f1 Horas de uso</span>
          <span class="smart-stat-v">${d.powerOnDisplay || 'N/A'}</span>
        </div>
        <div class="smart-stat">
          <span class="smart-stat-k">\u26a0 Setores realoc.</span>
          <span class="smart-stat-v" style="color:${d.reallocatedSectors > 0 ? '#ff3b30' : '#00ff88'}">${d.reallocatedSectors}</span>
        </div>
        ${d.predictFailure ? `<div class="smart-stat smart-predict-fail">
          <span class="smart-stat-k">\ud83d\udea8 Falha prevista</span>
          <span class="smart-stat-v" style="color:#ff3b30">SIM</span>
        </div>` : ''}
      </div>
    </div>
  `).join('')}</div>`;
}

function injectStyles() {
  if (document.getElementById('storage-styles')) return;
  const s = document.createElement('style'); s.id = 'storage-styles';
  s.textContent = `.storage-page{display:flex;flex-direction:column;height:100%;overflow-y:auto}
    .storage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px, 100%),1fr));gap:var(--space-5);padding:var(--space-2)}
    .storage-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-5);transition:var(--transition-base)}
    .storage-card:hover{border-color:var(--color-accent);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2)}
    .storage-card__header{display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4)}
    .storage-icon{font-size:28px}.storage-label{font-size:var(--text-base);font-weight:600;color:var(--color-text-primary)}
    .storage-meta{font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px}.storage-pct{margin-left:auto;font-size:var(--text-lg);font-weight:700}
    .storage-bar-bg{height:8px;background:var(--color-bg-surface-3);border-radius:99px;overflow:hidden;margin-bottom:var(--space-4)}
    .storage-bar-fill{height:100%;border-radius:99px;transition:width .6s ease}
    .storage-stats{display:flex;justify-content:space-between}
    .storage-stat{display:flex;flex-direction:column;align-items:center;gap:2px}
    .st-label{font-size:var(--text-xs);color:var(--color-text-muted)}.st-val{font-size:var(--text-sm);font-weight:600;color:var(--color-text-primary)}
    /* ── SMART (Fase 27) ── */
    .storage-section-title{font-size:var(--text-sm);font-weight:700;color:var(--color-text-primary);margin:var(--space-5) 0 var(--space-3);padding-left:var(--space-2);}
    .smart-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px, 100%),1fr));gap:var(--space-4);}
    .smart-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-4) var(--space-5);}
    .smart-card-header{display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);}
    .smart-disk-icon{font-size:1.8rem;flex-shrink:0;}
    .smart-disk-model{font-size:var(--text-sm);font-weight:600;color:var(--color-text-primary);}
    .smart-disk-meta{font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;}
    .smart-status-badge{margin-left:auto;padding:3px 10px;border-radius:var(--radius-xl);border:1px solid;font-size:11px;font-weight:600;white-space:nowrap;}
    .smart-health-row{display:flex;align-items:center;gap:10px;margin-bottom:var(--space-3);}
    .smart-health-label{font-size:12px;width:40px;flex-shrink:0;color:var(--color-text-muted);}
    .smart-health-track{flex:1;height:6px;background:var(--color-bg-surface-3);border-radius:3px;overflow:hidden;}
    .smart-health-fill{height:100%;border-radius:3px;transition:width .5s;}
    .smart-health-val{font-size:12px;font-weight:700;width:35px;text-align:right;}
    .smart-stats{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);}
    .smart-stat{display:flex;flex-direction:column;gap:2px;padding:var(--space-2);background:var(--color-bg-surface-2);border-radius:var(--radius-md);}
    .smart-predict-fail{grid-column:1/-1;background:rgba(255,59,48,.08);border:1px solid rgba(255,59,48,.2);}
    .smart-stat-k{font-size:10px;color:var(--color-text-muted);}
    .smart-stat-v{font-size:var(--text-sm);font-weight:600;color:var(--color-text-primary);}`;
  document.head.appendChild(s);
}
