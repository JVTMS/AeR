/**
 * AeR — Limpeza do Sistema (v2.0)
 * Design: lista de opções com toggles, limpar selecionados.
 */
import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Cleanup';

// ── Opções de limpeza disponíveis ─────────────────────────────────────────
const CLEANUP_OPTIONS = [
  {
    id: 'temp',
    label: 'Limpar Arquivos Temporários',
    desc: 'Remover arquivos temporários do sistema e do usuário.',
    defaultOn: true,
    path: 'temp',
  },
  {
    id: 'prefetch',
    label: 'Limpar Arquivos Prefetch',
    desc: 'Deletar arquivos da pasta Prefetch do Windows.',
    defaultOn: false,
    path: 'prefetch',
  },
  {
    id: 'recycle',
    label: 'Esvaziar Lixeira (Perigoso)',
    desc: 'Remover permanentemente arquivos da Lixeira.',
    defaultOn: false,
    danger: true,
    path: 'recycle',
  },
  {
    id: 'winupdate',
    label: 'Limpar Cache do Windows Update',
    desc: 'Remover arquivos de instalação baixados do Windows Update.',
    defaultOn: false,
    path: 'winupdate',
  },
  {
    id: 'thumbnails',
    label: 'Limpar Cache de Miniaturas',
    desc: 'Remover imagens em miniatura armazenadas em cache usadas pelo Explorador de Arquivos.',
    defaultOn: false,
    path: 'thumbnails',
  },
];

// ── Estado ────────────────────────────────────────────────────────────────
const selected = new Set(CLEANUP_OPTIONS.filter(o => o.defaultOn).map(o => o.id));
let lastCleanDate = null;

export async function mount(container) {
  Logger.info(MODULE, 'Montando Limpeza v2.0...');
  injectStyles();
  render(container);
}

export function unmount() {}

// ── Render ────────────────────────────────────────────────────────────────
function render(container) {
  const lastClean = lastCleanDate
    ? new Date(lastCleanDate).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : 'Ainda não foi limpa';

  container.innerHTML = `
    <div class="cl-root">
      <!-- Header -->
      <div class="cl-header">
        <div class="cl-header-icon">🚀</div>
        <div>
          <div class="cl-header-title">Limpeza do Sistema</div>
          <div class="cl-header-sub">Última limpeza: ${lastClean}</div>
        </div>
      </div>

      <!-- Divider -->
      <div class="cl-divider"></div>

      <!-- Lista de opções -->
      <div class="cl-list" id="cl-list">
        ${CLEANUP_OPTIONS.map(opt => renderOption(opt)).join('')}
      </div>

      <!-- Rodapé -->
      <div class="cl-footer">
        <span class="cl-footer-hint" id="cl-hint">${selected.size} item(s) selecionado(s)</span>
        <button class="cl-btn-clean" id="cl-btn-clean">
          🧹 Limpar Selecionados
        </button>
      </div>

      <!-- Resultado -->
      <div class="cl-result" id="cl-result" style="display:none"></div>
    </div>`;

  // Bindings
  container.querySelectorAll('.cl-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const id = toggle.dataset.id;
      const isOn = toggle.dataset.on === 'true';
      setToggle(toggle, !isOn);
      if (!isOn) selected.add(id); else selected.delete(id);
      updateHint(container);
    });
  });

  container.querySelector('#cl-btn-clean').addEventListener('click', () => runClean(container));
}

function renderOption(opt) {
  const isOn = selected.has(opt.id);
  return `
    <div class="cl-item">
      <div class="cl-item-text">
        <div class="cl-item-label${opt.danger ? ' cl-danger-label' : ''}">${opt.label}</div>
        <div class="cl-item-desc">${opt.desc}</div>
      </div>
      <button class="cl-toggle" data-id="${opt.id}" data-on="${isOn}" aria-label="Ativar ${opt.label}">
        <span class="cl-toggle-knob"></span>
      </button>
    </div>
    <div class="cl-divider"></div>`;
}

function setToggle(btn, on) {
  btn.dataset.on = on;
}

function updateHint(container) {
  const hint = container.querySelector('#cl-hint');
  if (hint) hint.textContent = `${selected.size} item(s) selecionado(s)`;
}

// ── Limpeza ───────────────────────────────────────────────────────────────
async function runClean(container) {
  const btn    = container.querySelector('#cl-btn-clean');
  const result = container.querySelector('#cl-result');

  if (selected.size === 0) {
    showResult(result, 'warn', '⚠️ Selecione pelo menos uma opção antes de limpar.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Limpando...';

  const paths = [...selected].map(id => CLEANUP_OPTIONS.find(o => o.id === id)?.path).filter(Boolean);

  try {
    const res = await invoke('cleanup:execute', { paths });
    lastCleanDate = new Date().toISOString();
    const freed = res?.freedMb ?? 0;
    btn.textContent = `✅ ${freed} MB liberados!`;
    showResult(result, 'ok', `✅ Limpeza concluída! <strong>${freed} MB</strong> liberados com sucesso.`);
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '🧹 Limpar Selecionados';
    }, 3500);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '🧹 Limpar Selecionados';
    showResult(result, 'error', `❌ Erro ao limpar: ${e?.message ?? 'Falha desconhecida'}`);
  }
}

function showResult(el, type, html) {
  if (!el) return;
  el.className = `cl-result cl-result--${type}`;
  el.innerHTML = html;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ── Estilos ───────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('cleanup-styles')) return;
  const s = document.createElement('style');
  s.id = 'cleanup-styles';
  s.textContent = `
    /* ── Root ── */
    .cl-root {
      display: flex; flex-direction: column;
      background: var(--color-bg-surface-0, #0e1117);
      min-height: 100%; padding: var(--space-5, 20px) var(--space-6, 24px);
      box-sizing: border-box;
    }

    /* ── Header ── */
    .cl-header {
      display: flex; align-items: center; gap: 14px;
      margin-bottom: var(--space-5, 20px);
    }
    .cl-header-icon { font-size: 1.6rem; }
    .cl-header-title {
      font-size: 1.15rem; font-weight: 700;
      color: var(--color-text-primary, #e8eaf0);
      letter-spacing: .01em;
    }
    .cl-header-sub {
      font-size: 12px; color: var(--color-text-muted, #555e71);
      margin-top: 2px;
    }

    /* ── Divider ── */
    .cl-divider {
      height: 1px;
      background: var(--color-border-subtle, rgba(255,255,255,.07));
      margin: 0;
    }

    /* ── List ── */
    .cl-list { display: flex; flex-direction: column; flex: 1; }

    /* ── Item ── */
    .cl-item {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--space-4, 16px);
      padding: 18px 4px;
    }
    .cl-item-text { flex: 1; min-width: 0; }
    .cl-item-label {
      font-size: 14px; font-weight: 600;
      color: var(--color-text-primary, #e8eaf0);
      margin-bottom: 3px;
    }
    .cl-danger-label { color: #ff6b6b; }
    .cl-item-desc {
      font-size: 12px;
      color: var(--color-text-muted, #555e71);
      line-height: 1.45;
    }

    /* ── Toggle ── */
    .cl-toggle {
      position: relative;
      width: 44px; height: 24px; flex-shrink: 0;
      border-radius: 12px; border: none; cursor: pointer;
      background: var(--color-bg-surface-3, #2a2f3d);
      transition: background .22s;
    }
    .cl-toggle[data-on="true"] {
      background: #2563eb;
    }
    .cl-toggle-knob {
      position: absolute; top: 3px; left: 3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #fff; transition: transform .22s;
      display: block;
      box-shadow: 0 1px 3px rgba(0,0,0,.35);
    }
    .cl-toggle[data-on="true"] .cl-toggle-knob {
      transform: translateX(20px);
    }

    /* ── Footer ── */
    .cl-footer {
      display: flex; align-items: center; justify-content: flex-end;
      gap: var(--space-4, 16px);
      padding-top: var(--space-5, 20px);
    }
    .cl-footer-hint {
      font-size: 12px; color: var(--color-text-muted, #555e71);
      margin-right: auto;
    }
    .cl-btn-clean {
      background: #2563eb; color: #fff; border: none;
      border-radius: var(--radius-lg, 10px);
      padding: 9px 20px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: background .15s, opacity .15s;
      display: flex; align-items: center; gap: 6px;
    }
    .cl-btn-clean:hover { background: #1d4ed8; }
    .cl-btn-clean:disabled { opacity: .6; cursor: not-allowed; }

    /* ── Result banner ── */
    .cl-result {
      margin-top: var(--space-4, 16px);
      padding: 10px 16px; border-radius: var(--radius-lg, 10px);
      font-size: 13px; font-weight: 500;
    }
    .cl-result--ok    { background: rgba(0,255,136,.12); color: #00ff88; border: 1px solid rgba(0,255,136,.25); }
    .cl-result--warn  { background: rgba(243,156,18,.12); color: #f39c12; border: 1px solid rgba(243,156,18,.25); }
    .cl-result--error { background: rgba(231,76,60,.12);  color: #e74c3c; border: 1px solid rgba(231,76,60,.25); }
  `;
  document.head.appendChild(s);
}
