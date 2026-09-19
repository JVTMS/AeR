/**
 * AeR — WinUtil Launcher (Fase 28)
 * Página dedicada para lançar o Chris Titus Tech WinUtil.
 */
import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'WinUtil';

export async function mount(container) {
  Logger.info(MODULE, 'Montando WinUtil...');
  injectStyles();

  container.innerHTML = `
    <div class="wu-root">

      <!-- Header especial -->
      <div class="wu-hero">
        <div class="wu-hero-glow"></div>
        <div class="wu-hero-logo">🚀</div>
        <div class="wu-hero-text">
          <div class="wu-hero-title">WinUtil</div>
          <div class="wu-hero-author">por Chris Titus Tech</div>
          <div class="wu-hero-desc">
            Ferramenta avançada e open source de otimização, limpeza e instalação de programas para Windows.
          </div>
        </div>
      </div>

      <!-- O que o WinUtil faz -->
      <div class="wu-features-title">O que o WinUtil oferece:</div>
      <div class="wu-features">
        <div class="wu-feature">
          <span class="wu-feature-icon">📦</span>
          <div>
            <div class="wu-feature-label">Instalação de Aplicativos</div>
            <div class="wu-feature-sub">Instale dezenas de programas populares via WinGet ou Chocolatey com um clique.</div>
          </div>
        </div>
        <div class="wu-feature">
          <span class="wu-feature-icon">🔧</span>
          <div>
            <div class="wu-feature-label">Tweaks Avançados</div>
            <div class="wu-feature-sub">Tweaks essenciais e avançados do Windows com checkboxes e descrições detalhadas.</div>
          </div>
        </div>
        <div class="wu-feature">
          <span class="wu-feature-icon">⚙️</span>
          <div>
            <div class="wu-feature-label">Configurações do Sistema</div>
            <div class="wu-feature-sub">Preferências e configurações do Windows com toggles — Taskbar, Explorer, etc.</div>
          </div>
        </div>
        <div class="wu-feature">
          <span class="wu-feature-icon">🪟</span>
          <div>
            <div class="wu-feature-label">Win11 Creator & Updates</div>
            <div class="wu-feature-sub">Criação de mídia de instalação e controle de atualizações do Windows.</div>
          </div>
        </div>
      </div>

      <!-- Aviso de segurança -->
      <div class="wu-security">
        <span class="wu-security-icon">🔒</span>
        <div>
          <div class="wu-security-title">Aviso de Segurança</div>
          <div class="wu-security-body">
            O WinUtil é executado como <strong>Administrador</strong> em uma janela PowerShell separada.
            O script é <strong>open source</strong> e pode ser inspecionado em <code>christitus.com/win</code>.
            Nunca execute scripts de fontes desconhecidas.
          </div>
        </div>
      </div>

      <!-- Botão principal -->
      <div class="wu-launch-area">
        <button class="wu-btn-launch" id="wu-btn-launch">
          <span class="wu-btn-icon">🚀</span>
          Abrir WinUtil
        </button>
        <div class="wu-launch-note">Abrirá em uma janela PowerShell elevada (requer confirmação UAC)</div>
      </div>

      <!-- Status -->
      <div class="wu-status" id="wu-status" style="display:none"></div>

    </div>`;

  // Binding do botão
  container.querySelector('#wu-btn-launch')?.addEventListener('click', () => launchWinUtil(container));
}

export function unmount() {}

async function launchWinUtil(container) {
  const btn    = container.querySelector('#wu-btn-launch');
  const status = container.querySelector('#wu-status');

  if (!confirm('Deseja abrir o WinUtil em uma janela PowerShell elevada?\n\nSerá solicitada a confirmação do UAC (Controle de Conta de Usuário).')) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="wu-btn-icon">⏳</span> Iniciando...';

  try {
    const res = await invoke('winutil:launch', {});
    if (res?.success) {
      showStatus(status, 'ok', '✅ WinUtil iniciado! Verifique a janela do PowerShell que foi aberta.');
      btn.innerHTML = '<span class="wu-btn-icon">✅</span> WinUtil Aberto!';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="wu-btn-icon">🚀</span> Abrir WinUtil Novamente';
      }, 4000);
    } else {
      throw new Error(res?.message ?? 'Falha ao iniciar');
    }
  } catch (e) {
    showStatus(status, 'error', `❌ Erro: ${e?.message ?? 'Falha ao abrir WinUtil'}. Tente abrir manualmente com: <code>irm https://christitus.com/win | iex</code>`);
    btn.disabled = false;
    btn.innerHTML = '<span class="wu-btn-icon">🚀</span> Tentar Novamente';
  }
}

function showStatus(el, type, html) {
  if (!el) return;
  el.className = `wu-status wu-status--${type}`;
  el.innerHTML = html;
  el.style.display = 'block';
}

function injectStyles() {
  if (document.getElementById('winutil-styles')) return;
  const s = document.createElement('style');
  s.id = 'winutil-styles';
  s.textContent = `
    .wu-root {
      display: flex; flex-direction: column; gap: var(--space-5, 20px);
      padding: var(--space-5, 20px) var(--space-6, 24px);
      min-height: 100%; box-sizing: border-box;
    }

    /* Hero */
    .wu-hero {
      position: relative; display: flex; align-items: center; gap: var(--space-5, 20px);
      background: linear-gradient(135deg, rgba(37,99,235,.15) 0%, rgba(109,40,217,.1) 100%);
      border: 1px solid rgba(37,99,235,.3);
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-6, 24px);
      overflow: hidden;
    }
    .wu-hero-glow {
      position: absolute; top: -30px; right: -30px;
      width: 150px; height: 150px;
      background: radial-gradient(circle, rgba(37,99,235,.25) 0%, transparent 70%);
      pointer-events: none;
    }
    .wu-hero-logo { font-size: 3.5rem; flex-shrink: 0; }
    .wu-hero-title { font-size: 1.6rem; font-weight: 800; color: var(--color-text-primary); }
    .wu-hero-author { font-size: 13px; color: #818cf8; margin-bottom: 8px; }
    .wu-hero-desc { font-size: 13px; color: var(--color-text-muted); line-height: 1.6; max-width: 480px; }

    /* Features */
    .wu-features-title { font-size: 13px; font-weight: 700; color: var(--color-text-muted); letter-spacing: .05em; text-transform: uppercase; }
    .wu-features { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-3, 12px); }
    .wu-feature {
      display: flex; align-items: flex-start; gap: 12px;
      background: var(--color-bg-surface-1); border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-lg); padding: var(--space-4, 16px);
    }
    .wu-feature-icon { font-size: 1.4rem; flex-shrink: 0; }
    .wu-feature-label { font-size: 13px; font-weight: 600; color: var(--color-text-primary); margin-bottom: 3px; }
    .wu-feature-sub { font-size: 11.5px; color: var(--color-text-muted); line-height: 1.45; }

    /* Security */
    .wu-security {
      display: flex; align-items: flex-start; gap: 14px;
      background: rgba(255,107,0,.08); border: 1px solid rgba(255,107,0,.25);
      border-radius: var(--radius-lg); padding: var(--space-4, 16px);
    }
    .wu-security-icon { font-size: 1.4rem; flex-shrink: 0; }
    .wu-security-title { font-size: 13px; font-weight: 700; color: #fb923c; margin-bottom: 4px; }
    .wu-security-body { font-size: 12px; color: var(--color-text-muted); line-height: 1.55; }
    .wu-security-body strong { color: var(--color-text-secondary); }
    .wu-security-body code {
      background: rgba(255,255,255,.08); padding: 1px 6px;
      border-radius: 4px; font-family: var(--font-mono); font-size: 11px;
    }

    /* Launch */
    .wu-launch-area { display: flex; flex-direction: column; align-items: center; gap: var(--space-3, 12px); padding: var(--space-4, 16px) 0; }
    .wu-btn-launch {
      display: flex; align-items: center; gap: 10px;
      background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
      color: #fff; border: none;
      border-radius: var(--radius-xl, 16px);
      padding: 14px 36px; font-size: 15px; font-weight: 700;
      cursor: pointer; transition: opacity .15s, transform .15s;
      box-shadow: 0 4px 20px rgba(37,99,235,.4);
    }
    .wu-btn-launch:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
    .wu-btn-launch:disabled { opacity: .6; cursor: not-allowed; transform: none; }
    .wu-btn-icon { font-size: 1.2rem; }
    .wu-launch-note { font-size: 11.5px; color: var(--color-text-muted); text-align: center; }

    /* Status */
    .wu-status {
      border-radius: var(--radius-lg); padding: 12px 16px;
      font-size: 13px; font-weight: 500; line-height: 1.5;
    }
    .wu-status--ok    { background: rgba(0,255,136,.1); color: #00ff88; border: 1px solid rgba(0,255,136,.25); }
    .wu-status--error { background: rgba(231,76,60,.1);  color: #e74c3c; border: 1px solid rgba(231,76,60,.25); }
    .wu-status--error code { background: rgba(255,255,255,.08); padding: 1px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; }
  `;
  document.head.appendChild(s);
}
