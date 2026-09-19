/**
 * AeR — Energia (v1.0)
 * Gerenciamento de planos de energia do Windows.
 */

import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Energy';

// GUIDs conhecidos do Windows para exibir nomes amigáveis
const KNOWN_PLANS = {
  '381b4222-f694-41f0-9685-ff5bb260df2e': { label: 'Equilibrado',       icon: '⚖️',  desc: 'Equilíbrio automático entre desempenho e economia de energia.' },
  '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c': { label: 'Alto Desempenho',   icon: '🚀',  desc: 'Máximo desempenho, maior consumo de energia.' },
  'a1841308-3541-4fab-bc81-f71556f20b4a': { label: 'Economia de Energia', icon: '🔋', desc: 'Minimiza o consumo de energia, reduz desempenho.' },
  'e9a42b02-d5df-448d-aa00-03f14749eb61': { label: 'Ultimate Performance', icon: '⚡', desc: 'Máximo desempenho absoluto. Oculto por padrão no Windows.' },
};

export async function mount(container) {
  Logger.info(MODULE, 'Montando Energia...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root energy-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Energia</h1>
          <p class="dash-subtitle">Planos de energia e configurações de consumo</p>
        </div>
        <button id="energy-refresh" class="btn-energy-refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Atualizar
        </button>
      </div>

      <div class="energy-section">
        <h2 class="energy-section-title">Planos de Energia</h2>
        <p class="energy-section-sub">Clique em um plano para ativá-lo instantaneamente.</p>
        <div id="energy-plans" class="energy-plans-grid">
          <div class="energy-loading"><span class="spinner-energy"></span> Carregando planos...</div>
        </div>
      </div>

      <div class="energy-section">
        <h2 class="energy-section-title">Dicas de Economia</h2>
        <div class="energy-tips">
          <div class="energy-tip">
            <span class="energy-tip-icon">💡</span>
            <div>
              <strong>Para jogos:</strong> Use <em>Alto Desempenho</em> ou <em>Ultimate Performance</em> para eliminar throttling de CPU.
            </div>
          </div>
          <div class="energy-tip">
            <span class="energy-tip-icon">🔋</span>
            <div>
              <strong>Para laptop com bateria:</strong> Use <em>Equilibrado</em> ou <em>Economia</em> para mais autonomia.
            </div>
          </div>
          <div class="energy-tip">
            <span class="energy-tip-icon">⚡</span>
            <div>
              <strong>Ultimate Performance</strong> está oculto por padrão. O Otimizador AeR pode ativá-lo na seção de otimizações.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#energy-refresh').addEventListener('click', () => loadPlans());
  await loadPlans();
}

export function unmount() {
  Logger.info(MODULE, 'Desmontando Energia...');
}

// ─── Dados ────────────────────────────────────────────────────────────────────

async function loadPlans() {
  const grid = document.getElementById('energy-plans');
  if (grid) grid.innerHTML = `<div class="energy-loading"><span class="spinner-energy"></span> Carregando...</div>`;

  try {
    const data = await invoke('energy:plans:get');
    renderPlans(data?.plans ?? [], data?.activeGuid ?? '');
  } catch (err) {
    Logger.error(MODULE, 'Falha ao carregar planos', err);
    if (grid) grid.innerHTML = `<div class="energy-error">⚠️ Não foi possível carregar os planos de energia.</div>`;
  }
}

// ─── Renderização ─────────────────────────────────────────────────────────────

function renderPlans(plans, activeGuid) {
  const grid = document.getElementById('energy-plans');
  if (!grid) return;

  if (!plans.length) {
    grid.innerHTML = `<div class="energy-error">Nenhum plano encontrado.</div>`;
    return;
  }

  grid.innerHTML = plans.map(plan => {
    const known    = KNOWN_PLANS[plan.guid] ?? {};
    const icon     = known.icon  ?? '⚙️';
    const label    = known.label ?? plan.name;
    const desc     = known.desc  ?? 'Plano de energia personalizado.';
    const isActive = plan.guid === activeGuid || plan.isActive;

    return `
      <div class="energy-plan-card ${isActive ? 'active' : ''}" data-guid="${plan.guid}">
        <div class="energy-plan-icon">${icon}</div>
        <div class="energy-plan-info">
          <div class="energy-plan-name">${label}</div>
          <div class="energy-plan-desc">${desc}</div>
          <div class="energy-plan-guid">${plan.guid}</div>
        </div>
        ${isActive
          ? `<div class="energy-plan-active-badge">✓ Ativo</div>`
          : `<button class="btn-energy-activate" data-guid="${plan.guid}">Ativar</button>`}
      </div>`;
  }).join('');

  grid.querySelectorAll('.btn-energy-activate').forEach(btn => {
    btn.addEventListener('click', () => activatePlan(btn.dataset.guid, btn));
  });
}

async function activatePlan(guid, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Ativando...';
  try {
    const result = await invoke('energy:plans:set', { guid });
    if (result?.success) {
      showToast('Plano de energia alterado!', 'success');
      await loadPlans();
    } else {
      showToast(result?.message ?? 'Falha ao ativar plano.', 'error');
      btn.disabled = false;
      btn.textContent = original;
    }
  } catch (err) {
    showToast('Erro: ' + (err?.message ?? 'Falha inesperada'), 'error');
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const ex = document.getElementById('energy-toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.id = 'energy-toast';
  t.className = `proc-toast proc-toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('energy-styles')) return;
  const s = document.createElement('style');
  s.id = 'energy-styles';
  s.textContent = `
    .energy-page { display:flex; flex-direction:column; gap:var(--space-6); height:100%; overflow-y:auto; }
    .btn-energy-refresh { display:flex; align-items:center; gap:6px; background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-radius:var(--radius-sm); color:var(--color-text-secondary); cursor:pointer; padding:7px 14px; font-size:var(--text-sm); transition:var(--transition-fast); }
    .btn-energy-refresh:hover { color:var(--color-accent-primary); border-color:var(--color-accent-primary); }

    .energy-section { display:flex; flex-direction:column; gap:var(--space-3); }
    .energy-section-title { font-size:var(--text-base); font-weight:600; color:var(--color-text-primary); margin:0; }
    .energy-section-sub { font-size:var(--text-sm); color:var(--color-text-muted); margin:0; }

    /* Grid de planos */
    .energy-plans-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:var(--space-4); }
    .energy-plan-card {
      background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-xl); padding:var(--space-5);
      display:flex; align-items:flex-start; gap:var(--space-4);
      transition:border-color var(--transition-fast), box-shadow var(--transition-fast);
      cursor:default;
    }
    .energy-plan-card:not(.active):hover { border-color:var(--color-accent-primary); box-shadow:0 0 0 1px var(--color-accent-primary); }
    .energy-plan-card.active { border-color:var(--color-accent-primary); background:rgba(var(--accent-primary-rgb,0,255,136),.05); }
    .energy-plan-icon { font-size:2rem; flex-shrink:0; }
    .energy-plan-info { flex:1; min-width:0; }
    .energy-plan-name { font-size:var(--text-base); font-weight:600; color:var(--color-text-primary); }
    .energy-plan-desc { font-size:var(--text-sm); color:var(--color-text-muted); margin-top:4px; line-height:1.4; }
    .energy-plan-guid { font-size:10px; font-family:var(--font-mono); color:var(--color-text-muted); margin-top:6px; opacity:.6; }
    .energy-plan-active-badge { align-self:flex-start; background:var(--color-accent-primary); color:#000; font-size:var(--text-xs); font-weight:700; padding:3px 10px; border-radius:var(--radius-full); white-space:nowrap; }
    .btn-energy-activate { align-self:flex-start; background:transparent; border:1px solid var(--color-border-subtle); color:var(--color-text-secondary); padding:4px 12px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-xs); font-weight:500; transition:var(--transition-fast); white-space:nowrap; }
    .btn-energy-activate:hover { background:var(--color-accent-primary); border-color:var(--color-accent-primary); color:#000; }
    .btn-energy-activate:disabled { opacity:.5; cursor:not-allowed; }

    /* Dicas */
    .energy-tips { display:flex; flex-direction:column; gap:var(--space-3); }
    .energy-tip { display:flex; align-items:flex-start; gap:var(--space-3); background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg); padding:var(--space-4); font-size:var(--text-sm); color:var(--color-text-secondary); line-height:1.5; }
    .energy-tip-icon { font-size:1.3rem; flex-shrink:0; }
    .energy-tip strong { color:var(--color-text-primary); }

    .energy-loading, .energy-error { padding:var(--space-8); text-align:center; color:var(--color-text-muted); font-size:var(--text-sm); display:flex; align-items:center; justify-content:center; gap:8px; }
    .energy-error { color:#e74c3c; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .spinner-energy { width:16px; height:16px; border:2px solid var(--color-border-subtle); border-top-color:var(--color-accent-primary); border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
  `;
  document.head.appendChild(s);
}
