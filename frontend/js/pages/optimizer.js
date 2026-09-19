import { Logger } from '../utils/logger.js';
import { getOptimizerCatalog, applyOptimization, revertOptimization } from '../api/pipe-client.js';

const MODULE = 'Optimizer';
let currentMode = localStorage.getItem('aer-optimizer-mode') || 'leigo';
let catalog = [];
let activeFilter = 'all'; // para modo técnico
let pendingAction = null; // { type: 'apply'|'revert', id } — guardado para o confirm

export async function mount(container) {
  Logger.info(MODULE, 'Montando página Otimizador...');
  injectOptimizerStyles();

  container.innerHTML = `
    <div class="dash-root optimizer-page">
      <!-- Header & Toggle -->
      <div class="dash-header opt-header">
        <div>
          <h1 class="dash-title">Otimizador de Sistema</h1>
          <p class="dash-subtitle">Ajuste o Windows para máxima performance e responsividade</p>
        </div>
        <div class="mode-toggle">
          <button class="btn-mode ${currentMode === 'leigo' ? 'active' : ''}" data-mode="leigo">Modo Simplificado</button>
          <button class="btn-mode ${currentMode === 'tecnico' ? 'active' : ''}" data-mode="tecnico">Modo Técnico</button>
        </div>
      </div>

      <div id="opt-content" class="opt-content">
        <!-- Injetado dinamicamente via render() -->
      </div>
    </div>

    <!-- Modal de Confirmação (Oculto) -->
    <div id="opt-modal-overlay" class="opt-modal-overlay">
      <div class="opt-modal">
        <div class="opt-modal-header">
          <h2 id="opt-modal-title">Confirmar Otimização</h2>
          <button id="opt-modal-close" class="btn-icon">✕</button>
        </div>
        <div id="opt-modal-body" class="opt-modal-body"></div>
        <div class="opt-modal-footer">
          <button id="opt-btn-cancel" class="btn-secondary">Cancelar</button>
          <button id="opt-btn-confirm" class="btn-primary">Aplicar Agora ✓</button>
        </div>
      </div>
    </div>
  `;

  // Bind toggle
  const toggleBtns = container.querySelectorAll('.btn-mode');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      toggleBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentMode = e.target.dataset.mode;
      localStorage.setItem('aer-optimizer-mode', currentMode);
      render(container.querySelector('#opt-content'));
    });
  });

  // Modal close binds
  container.querySelector('#opt-modal-close').addEventListener('click', closeModal);
  container.querySelector('#opt-btn-cancel').addEventListener('click', closeModal);
  container.querySelector('#opt-modal-overlay').addEventListener('click', (e) => {
    if(e.target.id === 'opt-modal-overlay') closeModal();
  });

  await loadCatalog(container.querySelector('#opt-content'));
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando Otimizador...');
}

async function loadCatalog(contentDiv) {
  try {
    contentDiv.innerHTML = '<div class="loading-state"><span class="spinner"></span> Carregando cat\u00e1logo de otimiza\u00e7\u00f5es...</div>';
    const data = await getOptimizerCatalog();
    if (data && data.length > 0) {
      catalog = data;
    } else {
      // Backend retornou lista vazia — usar catálogo vazio (não mock)
      catalog = [];
      Logger.warn(MODULE, 'Cat\u00e1logo retornou vazio do backend.');
    }
  } catch (error) {
    Logger.error(MODULE, 'Falha ao carregar cat\u00e1logo do backend', error);
    catalog = [];
    contentDiv.innerHTML = `
      <div class="error-state" style="padding:32px;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">\u26a0\ufe0f</div>
        <h3>Backend n\u00e3o dispon\u00edvel</h3>
        <p style="color:var(--color-text-muted);margin-top:8px">
          O servi\u00e7o AeR n\u00e3o est\u00e1 respondendo.<br>
          Certifique-se que o backend est\u00e1 rodando e reinicie o app.
        </p>
        <button onclick="location.reload()" class="btn-secondary" style="margin-top:16px">\u21bb Tentar Novamente</button>
      </div>`;
    return;
  }
  render(contentDiv);
}

function render(contentDiv) {
  if (currentMode === 'leigo') {
    renderLeigo(contentDiv);
  } else {
    renderTecnico(contentDiv);
  }
}

// ─── MODO LEIGO ────────────────────────────────────────────────────────────
function renderLeigo(contentDiv) {
  contentDiv.innerHTML = `
    <div class="opt-grid-leigo">
      ${renderPackageCard('Boost para Games', 'Ativa modo jogo, desativa Xbox DVR e otimiza CPU para máximo FPS', '🎮', 'hsl(265, 80%, 65%)', 'Até +15% FPS em jogos pesados')}
      ${renderPackageCard('Boost para Trabalho', 'Limpa memória, desativa serviços desnecessários e otimiza disco', '💼', 'hsl(195, 100%, 60%)', 'Sistema mais responsivo')}
      ${renderPackageCard('Limpeza Completa', 'Remove arquivos temporários, prefetch e cache DNS', '🧹', 'hsl(145, 70%, 55%)', 'Libera gigabytes de espaço')}
      ${renderPackageCard('Máxima Performance', 'Combinação de todas as otimizações seguras disponíveis', '⚡', 'hsl(38, 95%, 58%)', 'O máximo que seu PC pode entregar')}
    </div>
    
    <div class="opt-backups-section">
      <h3>Otimizações Aplicadas & Reversão</h3>
      <div class="opt-applied-list">
        <!-- Renderizado dinamicamente -->
      </div>
    </div>
  `;

  // Bind cards
  const cards = contentDiv.querySelectorAll('.opt-pkg-card');
  cards.forEach(card => {
    card.querySelector('.btn-apply').addEventListener('click', () => {
      showModal(card.dataset.pkg, 'leigo');
    });
  });
  
  renderAppliedList(contentDiv.querySelector('.opt-applied-list'));
}

function renderPackageCard(title, desc, icon, color, benefit) {
  return `
    <div class="opt-pkg-card" style="--pkg-color: ${color};" data-pkg="${title}">
      <div class="pkg-icon" style="color: ${color};">${icon}</div>
      <div class="pkg-info">
        <h3>${title}</h3>
        <p>${desc}</p>
        <div class="pkg-benefit">✨ ${benefit}</div>
      </div>
      <div class="pkg-footer">
        <span class="pkg-status status-none">Não Aplicado</span>
        <button class="btn-apply" style="background: ${color};">Aplicar</button>
      </div>
    </div>
  `;
}

// ── MODO TÉCNICO ───────────────────────────────────────────────────────────
function renderTecnico(contentDiv) {
  // Extrair categorias dinâmicas do catálogo
  const allCategories = [...new Set(catalog.map(o => o.category || 'Geral'))].sort();

  const riskFilters = [
    { key: 'all',        label: 'Todos',      icon: '◉' },
    { key: 'safe',       label: '🟢 Seguros',       icon: '' },
    { key: 'moderate',   label: '🟡 Moderados',  icon: '' },
    { key: 'aggressive', label: '🔴 Agressivos', icon: '' },
  ];

  // Filtros combinados: risco + categoria
  let filtered = catalog;
  const activeRisk = activeFilter.startsWith('cat:') ? 'all' : activeFilter;
  const activeCategory = activeFilter.startsWith('cat:') ? activeFilter.slice(4) : null;

  if (activeRisk !== 'all') {
    filtered = filtered.filter(o => (o.risk || 'safe').toLowerCase() === activeRisk);
  }
  if (activeCategory) {
    filtered = filtered.filter(o => (o.category || 'Geral') === activeCategory);
  }

  const safeCount    = catalog.filter(o => !o.isApplied && (o.risk||'safe').toLowerCase() === 'safe').length;
  const appliedCount = catalog.filter(o => o.isApplied).length;
  const nvidiaOpts   = catalog.filter(o => (o.category||'').toLowerCase() === 'gpu');

  contentDiv.innerHTML = `
    <!-- Stats rápidos -->
    <div class="opt-quick-stats">
      <div class="opt-qstat">
        <span class="opt-qstat-num" style="color:#00ff88">${appliedCount}</span>
        <span class="opt-qstat-label">Aplicadas</span>
      </div>
      <div class="opt-qstat">
        <span class="opt-qstat-num" style="color:#9b59b6">${catalog.length}</span>
        <span class="opt-qstat-label">Total</span>
      </div>
      <div class="opt-qstat">
        <span class="opt-qstat-num" style="color:#3498db">${safeCount}</span>
        <span class="opt-qstat-label">Seguros Pendentes</span>
      </div>
      <div class="opt-qstat">
        <span class="opt-qstat-num" style="color:#e67e22">${nvidiaOpts.length}</span>
        <span class="opt-qstat-label">NVIDIA</span>
      </div>
      <!-- Botão Aplicar Tudo Seguro -->
      <button class="btn-apply-all-safe" id="btn-apply-all-safe" ${safeCount === 0 ? 'disabled' : ''}>
        ⚡ Aplicar Tudo Seguro (${safeCount})
      </button>
    </div>

    <!-- Filtros por Risco -->
    <div class="opt-filter-row">
      <div class="opt-filter-group">
        <span class="opt-filter-label">Risco:</span>
        ${riskFilters.map(f => `
          <button class="btn-filter ${activeRisk === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>
        `).join('')}
      </div>
      <div class="opt-filter-group">
        <span class="opt-filter-label">Categoria:</span>
        <button class="btn-filter-cat ${!activeCategory ? 'active' : ''}" data-cat="">Todas</button>
        ${allCategories.map(cat => `
          <button class="btn-filter-cat ${activeCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>
        `).join('')}
      </div>
    </div>

    <!-- Tabela -->
    <div class="opt-table-container">
      <table class="opt-table">
        <thead>
          <tr>
            <th>Nome / Descrição</th>
            <th>Categoria</th>
            <th>Risco</th>
            <th>Status</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0
            ? '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--color-text-muted);">Nenhuma otimização nesta categoria.</td></tr>'
            : filtered.map(opt => `
            <tr class="opt-row" data-id="${opt.id}">
              <td>
                <div class="opt-name">${opt.name}</div>
                <div class="opt-desc">${opt.description || ''}</div>
              </td>
              <td><span class="badge category-badge">${opt.category || 'Geral'}</span></td>
              <td>${riskBadge(opt.risk)}</td>
              <td><span class="badge status-${opt.isApplied ? 'applied' : 'none'}">${opt.isApplied ? '✓ Ativo' : 'Inativo'}</span></td>
              <td>
                <button class="btn-toggle ${opt.isApplied ? 'btn-revert' : 'btn-apply'}" data-opt-id="${opt.id}">
                  ${opt.isApplied ? '↩ Reverter' : '▶ Aplicar'}
                </button>
              </td>
            </tr>
          `).join('')
          }
        </tbody>
      </table>
    </div>
  `;

  // Bind filtros de risco
  contentDiv.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      renderTecnico(contentDiv);
    });
  });

  // Bind filtros de categoria
  contentDiv.querySelectorAll('.btn-filter-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      activeFilter = cat ? `cat:${cat}` : 'all';
      renderTecnico(contentDiv);
    });
  });

  // Bind ações individuais
  contentDiv.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const opt = catalog.find(o => o.id === btn.dataset.optId);
      if (opt) showModal(opt, 'tecnico');
    });
  });

  // Botão Aplicar Tudo Seguro
  const applyAllBtn = contentDiv.querySelector('#btn-apply-all-safe');
  if (applyAllBtn) {
    applyAllBtn.addEventListener('click', () => applyAllSafe(contentDiv));
  }
}

// ── Risk Badge helper ──────────────────────────────────────────────────────
function riskBadge(risk) {
  const r = (risk || 'safe').toLowerCase();
  const map = {
    safe:       { icon: '🟢', label: 'Seguro',    cls: 'risk-safe' },
    moderate:   { icon: '🟡', label: 'Moderado',  cls: 'risk-moderate' },
    aggressive: { icon: '🔴', label: 'Agressivo', cls: 'risk-aggressive' },
  };
  const m = map[r] || map.safe;
  return `<span class="badge ${m.cls}">${m.icon} ${m.label}</span>`;
}

// ── Aplicar Tudo Seguro ────────────────────────────────────────────────────
async function applyAllSafe(contentDiv) {
  const safeOptimizations = catalog.filter(o => !o.isApplied && (o.risk || 'safe').toLowerCase() === 'safe');
  if (safeOptimizations.length === 0) return;

  const applyAllBtn = contentDiv?.querySelector('#btn-apply-all-safe');
  if (applyAllBtn) {
    applyAllBtn.disabled = true;
    applyAllBtn.textContent = `\u23f3 Aplicando 0 / ${safeOptimizations.length}...`;
  }

  let done = 0, failed = 0;
  for (const opt of safeOptimizations) {
    try {
      const result = await applyOptimization(opt.id);
      if (result?.success) {
        opt.isApplied = true;
        done++;
      } else {
        failed++;
        Logger.error(MODULE, `Falha ao aplicar ${opt.id}: ${result?.message}`);
      }
    } catch(e) {
      failed++;
      Logger.error(MODULE, `Erro ao aplicar ${opt.id}`, e);
    }
    if (applyAllBtn) {
      applyAllBtn.textContent = `\u23f3 Aplicando ${done} / ${safeOptimizations.length}...`;
    }
  }

  showToast(
    failed === 0
      ? `\u2705 ${done} otimiza\u00e7\u00f5es aplicadas com sucesso!`
      : `\u26a0\ufe0f ${done} aplicadas, ${failed} falharam`,
    failed === 0 ? 'success' : 'error'
  );
  setTimeout(() => renderTecnico(contentDiv), 500);
}


function renderAppliedList(container) {
  const applied = catalog.filter(c => c.isApplied);
  if (applied.length === 0) {
    container.innerHTML = '<p class="text-muted">Nenhuma otimização ativa no momento. Aplique uma acima!</p>';
    return;
  }

  container.innerHTML = applied.map(opt => `
    <div class="applied-item">
      <div>
        <strong>${opt.name}</strong>
        <span class="badge risk-${(opt.risk||'safe').toLowerCase()}" style="margin-left:8px;">${opt.risk || 'Safe'}</span>
      </div>
      <button class="btn-revert-sm" data-revert-id="${opt.id}">Reverter ↺</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-revert-sm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.revertId;
      const opt = catalog.find(o => o.id === id);
      if (opt) showModal(opt, 'leigo-revert');
    });
  });
}

// ── MODAL ───────────────────────────────────────────────────────────────────

/** Monta o pacote de otimizações por nome e mapeia para IDs reais do catálogo */
const PACKAGES = {
  'Boost para Games': [
    'game.enable-game-mode', 'game.disable-xbox-dvr',
    'cpu.power-plan-high', 'visual.disable-animations',
    'services.disable-update-delivery',
  ],
  'Boost para Trabalho': [
    'memory.clear-working-set', 'memory.disable-sysmain',
    'disk.clean-temp', 'visual.disable-tips',
    'net.dns-set-fast',
  ],
  'Limpeza Completa': [
    'disk.clean-temp', 'disk.clean-prefetch',
    'net.dns-cache-flush', 'memory.clear-working-set',
  ],
  'Máxima Performance': [
    'game.enable-game-mode', 'game.disable-xbox-dvr',
    'cpu.power-plan-high', 'memory.disable-sysmain',
    'disk.clean-temp', 'visual.disable-animations',
    'visual.disable-transparency', 'net.dns-set-fast',
    'services.disable-update-delivery',
  ],
};

function showModal(data, mode) {
  const overlay    = document.getElementById('opt-modal-overlay');
  const title      = document.getElementById('opt-modal-title');
  const body       = document.getElementById('opt-modal-body');
  const confirmBtn = document.getElementById('opt-btn-confirm');

  if (!overlay || !confirmBtn) return;
  confirmBtn.disabled = false;

  if (mode === 'leigo') {
    const ids  = PACKAGES[data] || [];
    const opts = ids.map(id => catalog.find(o => o.id === id)).filter(Boolean);

    title.innerText = `⚡ ${data}`;
    body.innerHTML = `
      <div class="modal-section success">
        <h3>✅ O QUE VAI MELHORAR</h3>
        <ul>${opts.map(o => `<li>${o.name}</li>`).join('') || '<li>Otimizações selecionadas para este perfil</li>'}</ul>
      </div>
      <div class="modal-section warning">
        <h3>⚠️ O QUE PODE ACONTECER</h3>
        <ul>
          ${opts.flatMap(o => o.risks || []).slice(0, 4).map(r => `<li>${r}</li>`).join('') || '<li>Sem riscos significativos</li>'}
        </ul>
      </div>
      <div class="modal-section info">
        <h3>🔄 REVERSÍVEL?</h3>
        <p>Sim — botão "Reverter" ficará disponível após aplicar.</p>
      </div>
    `;
    confirmBtn.innerText = 'Aplicar Agora ✓';

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerText = 'Aplicando...';
      let done = 0, failed = 0;
      for (const id of ids) {
        try {
          const r = await applyOptimization(id);
          if (r?.success) {
            done++;
            const entry = catalog.find(o => o.id === id);
            if (entry) entry.isApplied = true;
          } else {
            failed++;
            Logger.error(MODULE, `Falha ao aplicar ${id}: ${r?.message}`);
          }
        } catch (e) {
          failed++;
          Logger.error(MODULE, `Erro ao aplicar ${id}`, e);
        }
      }
      closeModal();
      confirmBtn.disabled = false;
      confirmBtn.innerText = 'Aplicar Agora ✓';
      showToast(
        failed === 0
          ? `\u2705 ${done} otimiza\u00e7\u00f5es aplicadas com sucesso!`
          : `\u26a0\ufe0f ${done} aplicadas, ${failed} falharam`,
        failed === 0 ? 'success' : 'error'
      );
      const contentDiv = document.getElementById('opt-content');
      if (contentDiv) render(contentDiv);
    };

  } else if (mode === 'leigo-revert') {
    title.innerText = `↺ Reverter: ${data.name}`;
    body.innerHTML = `
      <div class="modal-section warning">
        <h3>⚠️ DESFAZER OTIMIZAÇÃO</h3>
        <p>O sistema será restaurado ao estado anterior para: <strong>${data.name}</strong></p>
      </div>
    `;
    confirmBtn.innerText = 'Reverter Agora ↺';

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerText = 'Revertendo...';
      try {
        const r = await revertOptimization(data.id);
        if (r?.success) {
          data.isApplied = false;
          showToast(`\u2705 Revertido: ${data.name}`, 'success');
        } else {
          showToast(`\u274c Falha ao reverter: ${r?.message || 'Erro'}`, 'error');
        }
      } catch (e) {
        showToast(`\u274c Erro: ${e.message}`, 'error');
      } finally {
        closeModal();
        confirmBtn.disabled = false;
        confirmBtn.innerText = 'Reverter Agora ↺';
        const contentDiv = document.getElementById('opt-content');
        if (contentDiv) render(contentDiv);
      }
    };

  } else {
    // modo técnico — data = OptimizationDescriptor
    const isApplied = !!data.isApplied;
    const actionText = isApplied ? 'Reverter Agora ↺' : 'Aplicar Agora ✓';
    const actionProgress = isApplied ? 'Revertendo...' : 'Aplicando...';

    title.innerText = `⚙️ ${data.name}`;
    body.innerHTML = `
      <div class="modal-section ${isApplied ? 'warning' : 'success'}">
        <h3>${isApplied ? '⚠️ DESEJA REVERTER?' : '✅ O QUE VAI MELHORAR'}</h3>
        <ul>${(data.benefits || []).map(b => `<li>${b}</li>`).join('')}</ul>
      </div>
      <div class="modal-section warning">
        <h3>⚠️ RISCOS / IMPACTO</h3>
        <ul>${(data.risks || ['Nenhum impacto negativo conhecido']).map(r => `<li>${r}</li>`).join('')}</ul>
      </div>
      <div class="modal-section info">
        <h3>🔄 BACKUP</h3>
        <p>${data.isReversible ? 'Esta otimização pode ser revertida.' : 'Esta ação não é reversível automaticamente.'}</p>
      </div>
    `;
    confirmBtn.innerText = actionText;

    confirmBtn.onclick = async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerText = actionProgress;
      try {
        const r = isApplied
          ? await revertOptimization(data.id)
          : await applyOptimization(data.id);

        if (r?.success) {
          data.isApplied = !isApplied;
          showToast(`\u2705 ${!isApplied ? 'Aplicado' : 'Revertido'}: ${data.name}`, 'success');
        } else {
          showToast(`\u274c Falha: ${r?.message || 'Erro ao processar'}`, 'error');
          Logger.error(MODULE, `Falha ao processar ${data.id}:`, r?.message);
        }
      } catch (e) {
        showToast(`\u274c Erro: ${e.message}`, 'error');
        Logger.error(MODULE, `Erro em ${data.id}:`, e);
      } finally {
        closeModal();
        confirmBtn.disabled = false;
        confirmBtn.innerText = actionText;
        const contentDiv = document.getElementById('opt-content');
        if (contentDiv) render(contentDiv);
      }
    };
  }

  overlay.classList.add('show');
}

function closeModal() {
  document.getElementById('opt-modal-overlay').classList.remove('show');
}

// ─── TOAST ─────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  // Remover toast anterior se existir
  const existing = document.getElementById('opt-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'opt-toast';
  toast.className = `opt-toast opt-toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Auto-remove após 3.5s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// ─── MOCK DATA ─────────────────────────────────────────────────────────────
function getMockCatalog() {
  return [
    { id: 'game.enable-game-mode',       name: 'Ativar Game Mode do Windows',           category: 'Gaming',  mode: 'Both', risk: 'Safe',     backupStrategy: 'RegistryKey', isApplied: false, benefits: [], risks: [], isReversible: true  },
    { id: 'game.disable-xbox-dvr',       name: 'Desativar Xbox Game Bar e DVR',         category: 'Gaming',  mode: 'Both', risk: 'Safe',     backupStrategy: 'RegistryKey', isApplied: true,  benefits: [], risks: [], isReversible: true  },
    { id: 'cpu.power-plan-high',         name: 'Plano de Energia: Alto Desempenho',     category: 'Cpu',     mode: 'Both', risk: 'Safe',     backupStrategy: 'None',        isApplied: false, benefits: [], risks: [], isReversible: false },
    { id: 'visual.disable-animations',   name: 'Desativar Animações do Windows',        category: 'Visual',  mode: 'Both', risk: 'Safe',     backupStrategy: 'RegistryKey', isApplied: false, benefits: [], risks: [], isReversible: true  },
    { id: 'memory.clear-working-set',    name: 'Liberar RAM de Processos Ociosos',      category: 'Memory',  mode: 'Both', risk: 'Safe',     backupStrategy: 'None',        isApplied: false, benefits: [], risks: [], isReversible: false },
    { id: 'disk.clean-temp',             name: 'Limpar Arquivos Temporários',           category: 'Disk',    mode: 'Both', risk: 'Safe',     backupStrategy: 'None',        isApplied: false, benefits: [], risks: [], isReversible: false },
    { id: 'game.hardware-gpu-scheduling',name: 'Hardware-Accelerated GPU Scheduling',   category: 'Gaming',  mode: 'Expert',risk: 'Moderate', backupStrategy: 'RegistryKey', isApplied: false, benefits: [], risks: [], isReversible: true  },
  ];
}

// ─── STYLES ────────────────────────────────────────────────────────────────
function injectOptimizerStyles() {
  if (document.getElementById('optimizer-styles')) return;
  const style = document.createElement('style');
  style.id = 'optimizer-styles';
  style.textContent = `
    .optimizer-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
    }
    .opt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-6);
    }
    .mode-toggle {
      display: flex;
      background: var(--color-bg-surface-2);
      border-radius: var(--radius-lg);
      padding: 4px;
      border: 1px solid var(--color-border-subtle);
    }
    .btn-mode {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      padding: 8px 16px;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: 500;
      transition: var(--transition-fast);
    }
    .btn-mode.active {
      background: var(--color-bg-surface-3);
      color: var(--color-text-primary);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    
    /* Leigo Grid */
    .opt-grid-leigo {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--space-5);
      margin-bottom: var(--space-8);
    }
    .opt-pkg-card {
      background: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      transition: var(--transition-base);
      position: relative;
      overflow: hidden;
    }
    .opt-pkg-card:hover {
      border-color: var(--pkg-color);
      box-shadow: 0 8px 24px rgba(0,0,0,0.2), 0 0 12px calc(var(--pkg-color) / 20%);
      transform: translateY(-2px);
    }
    .opt-pkg-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 3px;
      background: var(--pkg-color);
    }
    .pkg-icon {
      font-size: 32px;
      margin-bottom: var(--space-3);
    }
    .pkg-info h3 {
      margin: 0 0 var(--space-2) 0;
      font-size: var(--text-lg);
      color: var(--color-text-primary);
    }
    .pkg-info p {
      margin: 0 0 var(--space-4) 0;
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: 1.4;
    }
    .pkg-benefit {
      font-size: var(--text-xs);
      color: var(--pkg-color);
      font-weight: 600;
      background: calc(var(--pkg-color) / 10%);
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      display: inline-block;
      margin-bottom: var(--space-5);
    }
    .pkg-footer {
      margin-top: auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--color-border-subtle);
      padding-top: var(--space-4);
    }
    .pkg-status {
      font-size: var(--text-xs);
      font-weight: 500;
    }
    .status-none { color: var(--color-text-muted); }
    .status-applied { color: var(--color-accent-tertiary); }
    .btn-apply {
      border: none;
      color: #000;
      font-weight: 600;
      padding: 6px 16px;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .btn-apply:hover {
      filter: brightness(1.1);
    }

    /* Backups Section */
    .opt-backups-section h3 {
      font-size: var(--text-lg);
      margin-bottom: var(--space-4);
      color: var(--color-text-primary);
    }
    .applied-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--color-bg-surface-1);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border-subtle);
      margin-bottom: var(--space-2);
    }
    .btn-revert-sm {
      background: var(--color-bg-surface-3);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      padding: 4px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: var(--text-xs);
    }
    .btn-revert-sm:hover {
      background: var(--color-accent-danger);
      color: #fff;
      border-color: var(--color-accent-danger);
    }

    /* Tecnico Table */
    .opt-filters {
      display: flex;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .btn-filter {
      background: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      padding: 6px 16px;
      border-radius: var(--radius-xl);
      cursor: pointer;
      font-size: var(--text-sm);
    }
    .btn-filter.active {
      background: var(--color-accent-primary);
      color: #000;
      border-color: var(--color-accent-primary);
      font-weight: 500;
    }

    /* Quick stats bar */
    .opt-quick-stats {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      background: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-3) var(--space-5);
      margin-bottom: var(--space-4);
      flex-wrap: wrap;
    }
    .opt-qstat {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 60px;
    }
    .opt-qstat-num {
      font-size: var(--text-2xl);
      font-weight: 800;
      font-family: var(--font-mono);
      line-height: 1;
    }
    .opt-qstat-label {
      font-size: 10px;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-top: 2px;
    }
    .btn-apply-all-safe {
      margin-left: auto;
      background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
      color: #000;
      border: none;
      border-radius: var(--radius-lg);
      padding: 10px 20px;
      font-size: var(--text-sm);
      font-weight: 700;
      cursor: pointer;
      transition: opacity .15s, transform .1s;
    }
    .btn-apply-all-safe:hover { opacity: .88; transform: translateY(-1px); }
    .btn-apply-all-safe:disabled { opacity: .4; cursor: not-allowed; transform: none; }

    /* Filter row with categories */
    .opt-filter-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }
    .opt-filter-group {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .opt-filter-label {
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: .5px;
      min-width: 65px;
    }
    .btn-filter-cat {
      background: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
      padding: 4px 12px;
      border-radius: var(--radius-xl);
      cursor: pointer;
      font-size: 11px;
      transition: all .12s;
    }
    .btn-filter-cat:hover { border-color: var(--color-accent-primary); color: var(--color-accent-primary); }
    .btn-filter-cat.active {
      background: rgba(var(--color-accent-primary-rgb, 0,255,136), .15);
      border-color: var(--color-accent-primary);
      color: var(--color-accent-primary);
      font-weight: 600;
    }

    .opt-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--color-bg-surface-1);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .opt-table th {
      text-align: left;
      padding: var(--space-3) var(--space-4);
      background: var(--color-bg-surface-2);
      color: var(--color-text-muted);
      font-weight: 500;
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .opt-table td {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border-subtle);
      vertical-align: middle;
    }
    .opt-name {
      font-weight: 500;
      color: var(--color-text-primary);
      margin-bottom: 2px;
    }
    .opt-desc {
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }
    .badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: var(--text-xs);
      font-weight: 500;
    }
    .category-badge { background: var(--color-bg-surface-3); color: var(--color-text-secondary); }
    .risk-safe { background: rgba(46, 204, 113, 0.15); color: #2ecc71; }
    .risk-moderate { background: rgba(241, 196, 15, 0.15); color: #f1c40f; }
    .risk-aggressive { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
    .btn-toggle {
      border: none;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: var(--text-xs);
      font-weight: 600;
    }
    .btn-toggle.btn-apply { background: var(--color-accent-primary); color: #000; }
    .btn-toggle.btn-revert { background: var(--color-bg-surface-3); color: var(--color-text-primary); border: 1px solid var(--color-border-subtle); }

    /* Modal */
    .opt-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--transition-base);
    }
    .opt-modal-overlay.show {
      opacity: 1;
      pointer-events: auto;
    }
    .opt-modal {
      background: var(--color-bg-surface-1);
      border: 1px solid var(--color-border-default);
      border-radius: var(--radius-xl);
      width: 100%;
      max-width: 550px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.4);
      transform: translateY(20px);
      transition: transform var(--transition-base);
      display: flex;
      flex-direction: column;
    }
    .opt-modal-overlay.show .opt-modal {
      transform: translateY(0);
    }
    .opt-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .opt-modal-header h2 {
      margin: 0;
      font-size: var(--text-lg);
      color: var(--color-text-primary);
    }
    .btn-icon {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: var(--text-lg);
    }
    .opt-modal-body {
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .modal-section {
      background: var(--color-bg-surface-2);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      border-left: 4px solid var(--color-border-subtle);
    }
    .modal-section.success { border-left-color: var(--color-accent-tertiary); }
    .modal-section.warning { border-left-color: var(--color-accent-warning); }
    .modal-section.info { border-left-color: var(--color-accent-primary); }
    
    .modal-section h3 {
      margin: 0 0 var(--space-2) 0;
      font-size: var(--text-sm);
      color: var(--color-text-primary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .modal-section ul {
      margin: 0; padding-left: var(--space-4);
      color: var(--color-text-secondary);
      font-size: var(--text-sm);
      line-height: 1.5;
    }
    .modal-section p {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--text-sm);
    }
    .opt-modal-footer {
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--color-border-subtle);
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
    }
    .btn-secondary {
      background: var(--color-bg-surface-3);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-subtle);
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 500;
    }
    .btn-primary {
      background: var(--color-accent-primary);
      color: #000;
      border: none;
      padding: 8px 20px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-weight: 600;
      transition: var(--transition-fast);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }

    /* Loading State */
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 60px;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }

    /* Spinners */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--color-border-subtle);
      border-top-color: var(--color-accent-primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
      flex-shrink: 0;
    }
    .spinner-sm {
      width: 14px; height: 14px;
      border: 2px solid rgba(0,0,0,0.2);
      border-top-color: #000;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    /* Toast */
    .opt-toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: var(--color-bg-surface-3);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border-default);
      padding: 12px 24px;
      border-radius: var(--radius-lg);
      font-size: var(--text-sm);
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 9999;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
      opacity: 0;
    }
    .opt-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .opt-toast-success { border-left: 3px solid #2ecc71; }
    .opt-toast-warning { border-left: 3px solid #f1c40f; }
    .opt-toast-error   { border-left: 3px solid #e74c3c; }
  `;
  document.head.appendChild(style);
}
