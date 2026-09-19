/**
 * AeR — Tweaks do Windows (Fase 28)
 * Layout dois painéis: checkboxes de tweaks + botões Aplicar/Reverter.
 */
import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Tweaks';

// Estado dos tweaks carregados do backend
let tweaksList = [];
const selected = new Set();

export async function mount(container) {
  Logger.info(MODULE, 'Montando Tweaks...');
  injectStyles();
  renderSkeleton(container);
  await loadTweaks(container);
}

export function unmount() {
  tweaksList = [];
  selected.clear();
}

// ── Skeleton enquanto carrega ─────────────────────────────────────────────
function renderSkeleton(container) {
  container.innerHTML = `
    <div class="tw-root">
      <div class="tw-header">
        <div class="tw-header-icon">🔧</div>
        <div>
          <div class="tw-header-title">Tweaks do Windows</div>
          <div class="tw-header-sub">Ajustes avançados do sistema organizados por categoria</div>
        </div>
      </div>
      <div class="tw-body">
        <div class="tw-loading">
          <span class="spinner"></span> Lendo configurações do sistema...
        </div>
      </div>
    </div>`;
}

// ── Carrega lista do backend ──────────────────────────────────────────────
async function loadTweaks(container) {
  try {
    const data = await invoke('tweaks:list');
    tweaksList = Array.isArray(data) ? data : [];
    renderTweaks(container);
  } catch (e) {
    const body = container.querySelector('.tw-body');
    if (body) body.innerHTML = `<div class="tw-error">⚠️ Não foi possível carregar os tweaks: ${e?.message ?? 'Erro desconhecido'}</div>`;
    Logger.warn(MODULE, 'Falha ao carregar tweaks', e);
  }
}

// ── Render principal ──────────────────────────────────────────────────────
function renderTweaks(container) {
  const essential = tweaksList.filter(t => t.category === 'Essential');
  const advanced  = tweaksList.filter(t => t.category === 'Advanced');

  container.innerHTML = `
    <div class="tw-root">
      <!-- Header -->
      <div class="tw-header">
        <div class="tw-header-icon">🔧</div>
        <div>
          <div class="tw-header-title">Tweaks do Windows</div>
          <div class="tw-header-sub">Selecione os ajustes desejados e clique em Aplicar. Os marcados em verde já estão ativos.</div>
        </div>
        <button class="tw-refresh-btn" id="tw-refresh" title="Atualizar estados">↺</button>
      </div>

      <!-- Aviso -->
      <div class="tw-warning">
        ⚠️ <strong>Atenção:</strong> Tweaks Avançados modificam configurações críticas do sistema. Crie um ponto de restauração antes de aplicá-los.
      </div>

      <!-- Lista de Tweaks -->
      <div class="tw-list" id="tw-list">
        <!-- Essenciais -->
        <div class="tw-category-header">
          <span class="tw-cat-icon">✅</span>
          <span>Tweaks Essenciais</span>
          <span class="tw-cat-count">${essential.length} tweaks</span>
        </div>
        ${essential.map(t => renderTweakItem(t)).join('')}

        <!-- Avançados -->
        <div class="tw-category-header tw-cat-danger">
          <span class="tw-cat-icon">⚠️</span>
          <span>Tweaks Avançados</span>
          <span class="tw-cat-caution">— CUIDADO</span>
          <span class="tw-cat-count">${advanced.length} tweaks</span>
        </div>
        ${advanced.map(t => renderTweakItem(t)).join('')}
      </div>

      <!-- Rodapé -->
      <div class="tw-footer">
        <span class="tw-footer-hint" id="tw-hint">0 selecionado(s)</span>
        <button class="tw-btn tw-btn-revert" id="tw-btn-revert">↺ Reverter Selecionados</button>
        <button class="tw-btn tw-btn-apply"  id="tw-btn-apply">⚡ Aplicar Selecionados</button>
      </div>

      <!-- Resultado -->
      <div class="tw-result-area" id="tw-result-area" style="display:none"></div>
    </div>`;

  bindEvents(container);
}

function renderTweakItem(t) {
  const isChecked = selected.has(t.id);
  return `
    <div class="tw-item${t.isApplied ? ' tw-item--applied' : ''}" data-id="${t.id}">
      <input type="checkbox" class="tw-check" id="twck-${t.id}" data-id="${t.id}" ${isChecked ? 'checked' : ''}>
      <label class="tw-item-body" for="twck-${t.id}">
        <div class="tw-item-label">
          ${t.label}
          ${t.isApplied ? '<span class="tw-badge-on">● Ativo</span>' : ''}
        </div>
        <div class="tw-item-desc">${t.description}</div>
      </label>
    </div>`;
}

// ── Event Bindings ────────────────────────────────────────────────────────
function bindEvents(container) {
  // Checkboxes
  container.querySelectorAll('.tw-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) selected.add(id); else selected.delete(id);
      updateHint(container);
    });
  });

  // Aplicar
  container.querySelector('#tw-btn-apply')?.addEventListener('click', () => runAction(container, 'apply'));
  // Reverter
  container.querySelector('#tw-btn-revert')?.addEventListener('click', () => runAction(container, 'revert'));
  // Refresh
  container.querySelector('#tw-refresh')?.addEventListener('click', async () => {
    renderSkeleton(container);
    selected.clear();
    await loadTweaks(container);
  });
}

function updateHint(container) {
  const hint = container.querySelector('#tw-hint');
  if (hint) hint.textContent = `${selected.size} selecionado(s)`;
}

// ── Ações ─────────────────────────────────────────────────────────────────
async function runAction(container, action) {
  if (selected.size === 0) {
    showBanner(container, 'warn', '⚠️ Selecione pelo menos um tweak.');
    return;
  }

  const applyBtn  = container.querySelector('#tw-btn-apply');
  const revertBtn = container.querySelector('#tw-btn-revert');
  const label = action === 'apply' ? '⚡ Aplicando...' : '↺ Revertendo...';
  if (applyBtn)  { applyBtn.disabled = true;  applyBtn.textContent  = action === 'apply' ? label : '⚡ Aplicar Selecionados'; }
  if (revertBtn) { revertBtn.disabled = true; revertBtn.textContent = action === 'revert' ? label : '↺ Reverter Selecionados'; }

  try {
    const ids = [...selected];
    const cmd = action === 'apply' ? 'tweaks:apply' : 'tweaks:revert';
    const res = await invoke(cmd, { ids });

    const results = res?.results ?? [];
    const ok  = results.filter(r => r.success).length;
    const err = results.filter(r => !r.success).length;

    const details = results.map(r =>
      `<div class="tw-res-row ${r.success ? 'ok' : 'fail'}">${r.success ? '✅' : '❌'} ${r.id}: ${r.message}</div>`
    ).join('');

    showBanner(container, err === 0 ? 'ok' : 'warn',
      `${action === 'apply' ? 'Aplicados' : 'Revertidos'}: <strong>${ok}</strong> com sucesso${err > 0 ? `, <strong>${err}</strong> com erro` : ''}.
      <div class="tw-res-details">${details}</div>`
    );

    // Recarrega para atualizar estados
    selected.clear();
    await loadTweaks(container);

  } catch (e) {
    showBanner(container, 'error', `❌ Erro: ${e?.message ?? 'Falha desconhecida'}`);
    if (applyBtn)  { applyBtn.disabled  = false; applyBtn.textContent  = '⚡ Aplicar Selecionados'; }
    if (revertBtn) { revertBtn.disabled = false; revertBtn.textContent = '↺ Reverter Selecionados'; }
  }
}

function showBanner(container, type, html) {
  const area = container.querySelector('#tw-result-area');
  if (!area) return;
  area.className = `tw-result-area tw-result--${type}`;
  area.innerHTML = html;
  area.style.display = 'block';
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Estilos ───────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tweaks-styles')) return;
  const s = document.createElement('style');
  s.id = 'tweaks-styles';
  s.textContent = `
    .tw-root {
      display: flex; flex-direction: column; gap: var(--space-4, 16px);
      padding: var(--space-5, 20px) var(--space-6, 24px);
      min-height: 100%; box-sizing: border-box;
    }

    /* Header */
    .tw-header {
      display: flex; align-items: center; gap: 14px;
      padding-bottom: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .tw-header-icon { font-size: 1.6rem; }
    .tw-header-title { font-size: 1.1rem; font-weight: 700; color: var(--color-text-primary); }
    .tw-header-sub { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
    .tw-refresh-btn {
      margin-left: auto; background: none; border: 1px solid var(--color-border-subtle);
      color: var(--color-text-muted); border-radius: var(--radius-md); padding: 4px 10px;
      cursor: pointer; font-size: 14px; transition: color .15s, border-color .15s;
    }
    .tw-refresh-btn:hover { color: var(--color-text-primary); border-color: var(--color-accent); }

    /* Warning */
    .tw-warning {
      background: rgba(243,156,18,.1); border: 1px solid rgba(243,156,18,.25);
      border-radius: var(--radius-lg); padding: 10px 14px;
      font-size: 12px; color: #f39c12; line-height: 1.5;
    }

    /* List */
    .tw-list { display: flex; flex-direction: column; flex: 1; }

    /* Category header */
    .tw-category-header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 4px 8px;
      font-size: 13px; font-weight: 700;
      color: var(--color-text-primary);
      border-top: 1px solid var(--color-border-subtle);
      margin-top: var(--space-3, 12px);
    }
    .tw-category-header:first-child { margin-top: 0; border-top: none; }
    .tw-cat-icon { font-size: 1rem; }
    .tw-cat-caution { color: #ff6b6b; font-size: 12px; font-weight: 600; }
    .tw-cat-count { margin-left: auto; font-size: 11px; color: var(--color-text-muted); font-weight: 400; }
    .tw-cat-danger { color: #ff6b6b; }

    /* Item */
    .tw-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 4px; cursor: pointer;
      border-bottom: 1px solid var(--color-border-subtle, rgba(255,255,255,.05));
      transition: background .12s;
    }
    .tw-item:hover { background: var(--color-bg-surface-2, rgba(255,255,255,.03)); border-radius: var(--radius-md); }
    .tw-item--applied { background: rgba(0,255,136,.04); }
    .tw-item--applied:hover { background: rgba(0,255,136,.07); }

    .tw-check {
      margin-top: 2px; flex-shrink: 0;
      width: 16px; height: 16px; cursor: pointer;
      accent-color: #2563eb;
    }
    .tw-item-body { flex: 1; cursor: pointer; }
    .tw-item-label {
      font-size: 13.5px; font-weight: 600;
      color: var(--color-text-primary); margin-bottom: 3px;
      display: flex; align-items: center; gap: 8px;
    }
    .tw-badge-on {
      font-size: 10px; font-weight: 600; color: #00ff88;
      background: rgba(0,255,136,.12); border: 1px solid rgba(0,255,136,.25);
      border-radius: 99px; padding: 1px 7px;
    }
    .tw-item-desc { font-size: 12px; color: var(--color-text-muted); line-height: 1.45; }

    /* Footer */
    .tw-footer {
      display: flex; align-items: center; gap: var(--space-3, 12px);
      padding-top: var(--space-4, 16px);
      border-top: 1px solid var(--color-border-subtle);
    }
    .tw-footer-hint { font-size: 12px; color: var(--color-text-muted); margin-right: auto; }

    .tw-btn {
      padding: 9px 18px; border: none; border-radius: var(--radius-lg);
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background .15s, opacity .15s;
    }
    .tw-btn:disabled { opacity: .5; cursor: not-allowed; }
    .tw-btn-apply  { background: #2563eb; color: #fff; }
    .tw-btn-apply:hover:not(:disabled)  { background: #1d4ed8; }
    .tw-btn-revert { background: var(--color-bg-surface-2); color: var(--color-text-primary); border: 1px solid var(--color-border-subtle); }
    .tw-btn-revert:hover:not(:disabled) { background: var(--color-bg-surface-3); }

    /* Results */
    .tw-result-area {
      border-radius: var(--radius-lg); padding: 12px 16px;
      font-size: 13px; font-weight: 500; line-height: 1.5;
    }
    .tw-result--ok    { background: rgba(0,255,136,.1); color: #00ff88; border: 1px solid rgba(0,255,136,.25); }
    .tw-result--warn  { background: rgba(243,156,18,.1); color: #f39c12; border: 1px solid rgba(243,156,18,.25); }
    .tw-result--error { background: rgba(231,76,60,.1);  color: #e74c3c; border: 1px solid rgba(231,76,60,.25); }
    .tw-res-details { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
    .tw-res-row { font-size: 12px; font-weight: 400; padding: 3px 0; }
    .tw-res-row.ok   { color: #00ff88; }
    .tw-res-row.fail { color: #ff3b30; }

    .tw-loading { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); padding: var(--space-8, 32px); }
    .tw-error { color: #e74c3c; padding: var(--space-6, 24px); text-align: center; }
  `;
  document.head.appendChild(s);
}
