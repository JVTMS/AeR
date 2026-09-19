import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'GameMode';

let status = null;
let container = null;
let pollTimer = null;

export async function mount(c) {
  Logger.info(MODULE, 'Montando Game Mode...');
  container = c;
  injectStyles();

  container.innerHTML = `
    <div class="dash-root gm-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">🎮 Game Mode</h1>
          <p class="dash-subtitle">Modo Turbo fecha apps pesados para liberar recursos ao jogo</p>
        </div>
        <div class="gm-status-badge" id="gm-game-badge" style="display:none">
          <span class="gm-badge-dot pulse"></span>
          <span id="gm-game-name">Jogo detectado</span>
        </div>
      </div>

      <!-- Turbo Toggle -->
      <div class="gm-turbo-card" id="gm-turbo-card">
        <div class="gm-turbo-left">
          <div class="gm-turbo-icon" id="gm-turbo-icon">⚡</div>
          <div>
            <div class="gm-turbo-title" id="gm-turbo-title">MODO TURBO</div>
            <div class="gm-turbo-desc" id="gm-turbo-desc">Fecha processos selecionados para maximizar desempenho</div>
          </div>
        </div>
        <button class="gm-toggle" id="gm-turbo-toggle" data-active="false">
          <span class="gm-toggle-knob"></span>
        </button>
      </div>

      <!-- Jogo ativo -->
      <div class="gm-section" id="gm-active-game-section" style="display:none">
        <div class="gm-section-title">🎯 Jogo Detectado</div>
        <div class="gm-active-game-card">
          <span class="gm-game-icon">🎮</span>
          <div>
            <strong id="gm-active-game-name">—</strong>
            <div style="font-size:12px;color:var(--color-text-muted)">Em execução agora</div>
          </div>
          <button class="btn-primary gm-auto-turbo" id="gm-auto-turbo-btn">⚡ Ativar Turbo Agora</button>
        </div>
      </div>

      <!-- Kill List -->
      <div class="gm-section">
        <div class="gm-section-header">
          <div class="gm-section-title">🗑 Processos a Fechar no Turbo Mode</div>
          <div style="font-size:12px;color:var(--color-text-muted)">Clique em ✕ para remover · Adicione pelo campo abaixo</div>
        </div>
        <div id="gm-killlist-wrap" class="gm-killlist-wrap">
          <div class="loading-state"><span class="spinner"></span> Carregando...</div>
        </div>
        <div class="gm-add-process">
          <input type="text" id="gm-add-input" class="gm-input" placeholder="Nome do processo (ex: discord, chrome)">
          <button class="btn-secondary" id="gm-add-btn">+ Adicionar</button>
        </div>
        <button class="btn-secondary gm-reset-btn" id="gm-reset-btn">↺ Restaurar lista padrão</button>
      </div>

      <!-- Resultados do Turbo -->
      <div class="gm-section" id="gm-results-section" style="display:none">
        <div class="gm-section-title">✅ Resultado da Última Ativação</div>
        <div id="gm-results-content"></div>
      </div>
    </div>
  `;

  bindEvents();
  await loadStatus();

  // Poll a cada 5s para detectar jogos
  pollTimer = setInterval(async () => {
    try { await loadStatus(); } catch {}
  }, 5000);
}

export function unmount() {
  clearInterval(pollTimer);
  pollTimer = null;
  container = null;
  status = null;
}

async function loadStatus() {
  try {
    status = await invoke('game:status');
    updateUI();
  } catch (err) {
    Logger.error(MODULE, 'Erro ao carregar status', err);
  }
}

function updateUI() {
  if (!status || !container) return;

  // Badge de jogo detectado
  const badge = container.querySelector('#gm-game-badge');
  const gameName = container.querySelector('#gm-game-name');
  const gameSection = container.querySelector('#gm-active-game-section');
  const activeGameName = container.querySelector('#gm-active-game-name');

  if (status.isGameRunning) {
    badge.style.display = 'flex';
    gameName.textContent = status.gameName;
    gameSection.style.display = 'block';
    activeGameName.textContent = status.gameName;
  } else {
    badge.style.display = 'none';
    gameSection.style.display = 'none';
  }

  // Toggle Turbo
  const toggle = container.querySelector('#gm-turbo-toggle');
  const card   = container.querySelector('#gm-turbo-card');
  const icon   = container.querySelector('#gm-turbo-icon');
  const desc   = container.querySelector('#gm-turbo-desc');

  const isActive = status.isTurboActive;
  toggle.dataset.active = isActive;
  card.classList.toggle('turbo-on', isActive);
  icon.textContent = isActive ? '🔥' : '⚡';
  desc.textContent = isActive
    ? 'Modo Turbo ATIVO — processos fechados para maximizar FPS'
    : 'Fecha processos selecionados para maximizar desempenho';

  // Kill list
  renderKillList(status.killList || []);
}

function renderKillList(list) {
  const wrap = container?.querySelector('#gm-killlist-wrap');
  if (!wrap) return;

  if (!list || list.length === 0) {
    wrap.innerHTML = '<div style="padding:16px;color:var(--color-text-muted);font-size:13px">Nenhum processo na lista. Adicione abaixo.</div>';
    return;
  }

  wrap.innerHTML = `<div class="gm-killlist">${
    list.map(p => `
      <div class="gm-killlist-item">
        <span class="gm-process-icon">${processIcon(p)}</span>
        <span class="gm-process-name">${esc(p)}</span>
        <button class="gm-remove-btn" data-process="${esc(p)}" title="Remover">✕</button>
      </div>
    `).join('')
  }</div>`;

  wrap.querySelectorAll('.gm-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await invoke('game:killlist:remove', { process: btn.dataset.process });
        if (res?.killList) renderKillList(res.killList);
        if (status) status.killList = res?.killList;
      } catch(e) { Logger.error(MODULE, 'Erro ao remover', e); }
    });
  });
}

function bindEvents() {
  // Turbo Toggle
  container.querySelector('#gm-turbo-toggle').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const isActive = btn.dataset.active === 'true';
    btn.disabled = true;
    try {
      if (isActive) {
        const res = await invoke('game:turbo:disable');
        if (status) status.isTurboActive = false;
      } else {
        const res = await invoke('game:turbo:enable', {});
        if (status) status.isTurboActive = true;
        showResults(res);
      }
      updateUI();
    } catch(err) {
      Logger.error(MODULE, 'Erro no toggle turbo', err);
    } finally {
      btn.disabled = false;
    }
  });

  // Auto-turbo quando jogo detectado
  container.querySelector('#gm-auto-turbo-btn').addEventListener('click', async () => {
    try {
      const res = await invoke('game:turbo:enable', {});
      if (status) status.isTurboActive = true;
      updateUI();
      showResults(res);
    } catch(err) { Logger.error(MODULE, 'Erro ao ativar turbo', err); }
  });

  // Adicionar processo
  const addInput = container.querySelector('#gm-add-input');
  const addBtn   = container.querySelector('#gm-add-btn');
  const doAdd    = async () => {
    const val = addInput.value.trim();
    if (!val) return;
    try {
      const res = await invoke('game:killlist:add', { process: val });
      if (res?.killList) { renderKillList(res.killList); if (status) status.killList = res.killList; }
      addInput.value = '';
    } catch(e) { Logger.error(MODULE, 'Erro ao adicionar', e); }
  };
  addBtn.addEventListener('click', doAdd);
  addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

  // Reset para lista padrão
  container.querySelector('#gm-reset-btn').addEventListener('click', async () => {
    const defaults = [
      'Discord','Spotify','OneDrive','Teams','slack','EpicGamesLauncher',
      'chrome','msedge','firefox','Photoshop','WINWORD','EXCEL','POWERPNT'
    ];
    try {
      const res = await invoke('game:killlist:set', { processes: defaults });
      if (res?.killList) { renderKillList(res.killList); if (status) status.killList = res.killList; }
    } catch(e) { Logger.error(MODULE, 'Erro ao resetar', e); }
  });
}

function showResults(res) {
  const section = container?.querySelector('#gm-results-section');
  const content = container?.querySelector('#gm-results-content');
  if (!section || !content || !res) return;
  const killed = res.killed || [];
  const failed  = res.failed  || [];
  section.style.display = 'block';
  content.innerHTML = `
    ${killed.length > 0 ? `
      <div class="gm-result-group">
        <div class="gm-result-label gm-ok">✅ Fechados (${killed.length})</div>
        <div class="gm-result-list">${killed.map(p=>`<span class="gm-result-tag ok">${esc(p)}</span>`).join('')}</div>
      </div>` : ''}
    ${failed.length > 0 ? `
      <div class="gm-result-group">
        <div class="gm-result-label gm-warn">⚠ Não foi possível fechar (${failed.length})</div>
        <div class="gm-result-list">${failed.map(p=>`<span class="gm-result-tag warn">${esc(p)}</span>`).join('')}</div>
      </div>` : ''}
    ${killed.length === 0 && failed.length === 0 ? '<div style="color:var(--color-text-muted);font-size:13px">Nenhum dos processos configurados estava rodando.</div>' : ''}
  `;
}

function processIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('discord'))  return '💬';
  if (n.includes('spotify'))  return '🎵';
  if (n.includes('chrome') || n.includes('msedge') || n.includes('firefox')) return '🌐';
  if (n.includes('onedrive')) return '☁';
  if (n.includes('teams'))    return '👥';
  if (n.includes('steam'))    return '🎮';
  if (n.includes('photoshop') || n.includes('WINWORD') || n.includes('EXCEL')) return '📄';
  return '⚙';
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function injectStyles() {
  if (document.getElementById('gm-styles')) return;
  const s = document.createElement('style');
  s.id = 'gm-styles';
  s.textContent = `
    .gm-page { display:flex; flex-direction:column; gap:var(--space-4); }
    .gm-status-badge { display:flex; align-items:center; gap:8px; background:rgba(0,255,136,.15); border:1px solid rgba(0,255,136,.3); padding:8px 14px; border-radius:var(--radius-xl); font-size:var(--text-sm); font-weight:600; color:#00ff88; }
    .gm-badge-dot { width:8px; height:8px; border-radius:50%; background:#00ff88; }
    .gm-badge-dot.pulse { animation:gm-pulse 1.5s infinite; }
    @keyframes gm-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }

    /* Turbo Card */
    .gm-turbo-card { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); padding:var(--space-5) var(--space-6); display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); transition:all .3s; }
    .gm-turbo-card.turbo-on { border-color:#ff6b00; background:rgba(255,107,0,.08); box-shadow:0 0 32px rgba(255,107,0,.15); }
    .gm-turbo-left { display:flex; align-items:center; gap:var(--space-4); }
    .gm-turbo-icon { font-size:2.5rem; width:56px; text-align:center; }
    .gm-turbo-title { font-size:1.2rem; font-weight:700; letter-spacing:1px; }
    .gm-turbo-card.turbo-on .gm-turbo-title { color:#ff6b00; }
    .gm-turbo-desc { font-size:var(--text-sm); color:var(--color-text-secondary); margin-top:4px; }

    /* Toggle */
    .gm-toggle { width:64px; height:34px; border-radius:17px; border:none; cursor:pointer; background:var(--color-bg-surface-3); position:relative; transition:background .25s; flex-shrink:0; }
    .gm-toggle[data-active="true"] { background:#ff6b00; }
    .gm-toggle-knob { position:absolute; top:4px; left:4px; width:26px; height:26px; border-radius:50%; background:#fff; transition:transform .25s; display:block; }
    .gm-toggle[data-active="true"] .gm-toggle-knob { transform:translateX(30px); }

    /* Sections */
    .gm-section { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); padding:var(--space-4) var(--space-5); }
    .gm-section-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-3); }
    .gm-section-title { font-size:var(--text-sm); font-weight:600; color:var(--color-text-primary); margin-bottom:var(--space-3); }

    /* Active game */
    .gm-active-game-card { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3); background:rgba(0,255,136,.07); border:1px solid rgba(0,255,136,.2); border-radius:var(--radius-lg); }
    .gm-game-icon { font-size:1.5rem; }
    .gm-auto-turbo { margin-left:auto; }

    /* Kill list */
    .gm-killlist-wrap { margin-bottom:var(--space-3); }
    .gm-killlist { display:flex; flex-wrap:wrap; gap:var(--space-2); }
    .gm-killlist-item { display:flex; align-items:center; gap:6px; background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg); padding:6px 10px; font-size:var(--text-sm); }
    .gm-process-icon { font-size:14px; }
    .gm-process-name { font-weight:500; }
    .gm-remove-btn { background:none; border:none; cursor:pointer; color:var(--color-text-muted); font-size:12px; padding:0 2px; line-height:1; transition:color .12s; }
    .gm-remove-btn:hover { color:#ff3b30; }

    /* Add input */
    .gm-add-process { display:flex; gap:var(--space-2); margin-bottom:var(--space-2); }
    .gm-input { flex:1; padding:8px 12px; background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg); color:var(--color-text-primary); font-size:var(--text-sm); }
    .gm-input:focus { outline:none; border-color:var(--color-accent-primary); }
    .gm-reset-btn { font-size:var(--text-xs); opacity:.7; }

    /* Results */
    .gm-result-group { margin-bottom:var(--space-3); }
    .gm-result-label { font-size:var(--text-xs); font-weight:600; margin-bottom:var(--space-2); }
    .gm-result-label.gm-ok   { color:#00ff88; }
    .gm-result-label.gm-warn { color:#f39c12; }
    .gm-result-list { display:flex; flex-wrap:wrap; gap:6px; }
    .gm-result-tag { padding:3px 10px; border-radius:var(--radius-xl); font-size:11px; font-weight:500; }
    .gm-result-tag.ok   { background:rgba(0,255,136,.15); color:#00ff88; border:1px solid rgba(0,255,136,.3); }
    .gm-result-tag.warn { background:rgba(243,156,18,.15); color:#f39c12; border:1px solid rgba(243,156,18,.3); }

    .btn-primary { background:var(--color-accent-primary); color:#000; border:none; border-radius:var(--radius-lg); padding:8px 16px; font-size:var(--text-sm); font-weight:600; cursor:pointer; transition:opacity .15s; }
    .btn-primary:hover { opacity:.85; }
  `;
  document.head.appendChild(s);
}
