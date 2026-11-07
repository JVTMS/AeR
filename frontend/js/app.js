/**
 * AeR — App Entry Point (v0.4.0)
 * Inicializa router, janela, IPC, busca global Ctrl+K e notificações.
 */

import { initRouter, navigate } from './utils/router.js';
import { Logger }               from './utils/logger.js';
import { applySettings }        from './pages/settings.js';

const MODULE = 'App';

// ─── Controles de Janela Frameless e Responsiva ──────────────────────────
function initWindowControls() {
  const btnMin = document.getElementById('btn-minimize');
  const btnMax = document.getElementById('btn-maximize');
  const btnFs  = document.getElementById('btn-fullscreen');
  const btnClose = document.getElementById('btn-close');
  const titlebar = document.getElementById('titlebar');

  btnMin?.addEventListener('click', () => window.windowAPI?.minimize());
  btnMax?.addEventListener('click', () => window.windowAPI?.toggleMaximize());
  btnFs?.addEventListener('click',  () => window.windowAPI?.toggleFullscreen());
  btnClose?.addEventListener('click', () => window.windowAPI?.close());

  // Duplo clique na área de arraste da titlebar para maximizar / restaurar
  titlebar?.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, .status-chip, a')) return;
    window.windowAPI?.toggleMaximize();
  });

  // Atualizar visual da UI conforme estado da janela
  const updateUIState = (state) => {
    if (!state) return;
    if (state.isMaximized) {
      document.body.classList.add('is-maximized');
      if (btnMax) {
        btnMax.setAttribute('aria-label', 'Restaurar');
        btnMax.title = 'Restaurar';
      }
    } else {
      document.body.classList.remove('is-maximized');
      if (btnMax) {
        btnMax.setAttribute('aria-label', 'Maximizar');
        btnMax.title = 'Maximizar';
      }
    }

    if (state.isFullScreen) {
      document.body.classList.add('is-fullscreen');
      if (btnFs) {
        btnFs.setAttribute('aria-label', 'Sair da tela cheia');
        btnFs.title = 'Sair da tela cheia (F11)';
      }
    } else {
      document.body.classList.remove('is-fullscreen');
      if (btnFs) {
        btnFs.setAttribute('aria-label', 'Tela cheia');
        btnFs.title = 'Tela cheia (F11)';
      }
    }
  };

  // Listener de eventos vindos do Main Process
  if (typeof window.windowAPI?.onStateChange === 'function') {
    window.windowAPI.onStateChange(updateUIState);
  }

  // Buscar estado inicial
  if (typeof window.windowAPI?.getState === 'function') {
    window.windowAPI.getState().then(updateUIState).catch(() => {});
  }

  // Atalhos globais de teclado: F11 (Tela cheia), Ctrl+B (Sidebar)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      window.windowAPI?.toggleFullscreen();
    }
    if (e.key === 'Escape' && document.body.classList.contains('is-fullscreen')) {
      window.windowAPI?.toggleFullscreen();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      const sidebar = document.getElementById('sidebar');
      const isCollapsed = sidebar?.classList.contains('sidebar--collapsed');
      sidebar?.classList.toggle('sidebar--collapsed');
      localStorage.setItem('aer:sidebar-collapsed', String(!isCollapsed));
    }
  });
}

// ─── Status Chip (topbar) ─────────────────────────────────────────────────
let currentIsAdmin = null;

function setChipStatus(status, isAdmin = currentIsAdmin) {
  const chip  = document.getElementById('backend-chip');
  const label = document.getElementById('backend-chip-label');
  if (!chip || !label) return;
  if (typeof isAdmin === 'boolean') currentIsAdmin = isAdmin;

  if (status === 'connected') {
    chip.className = 'status-chip';
    if (currentIsAdmin === true) {
      label.textContent = 'Online · Admin 🛡️';
      chip.title        = 'Backend C# conectado com privilégios de Administrador';
      chip.style.cursor = 'default';
    } else if (currentIsAdmin === false) {
      label.textContent = 'Online · Elevar ⚠️';
      chip.title        = 'Executando como usuário padrão. Clique para elevar como Administrador (UAC).';
      chip.style.cursor = 'pointer';
    } else {
      label.textContent = 'Online';
      chip.title        = 'Status de conexão com o Backend C#';
      chip.style.cursor = 'default';
    }
  } else {
    chip.className    = 'status-chip status-chip--offline';
    label.textContent = 'Offline';
    chip.title        = 'Backend C# desconectado';
    chip.style.cursor = 'default';
  }
}

async function handleChipClick() {
  if (currentIsAdmin !== false) return;
  const label = document.getElementById('backend-chip-label');
  if (label) label.textContent = 'Elevando UAC...';
  try {
    const res = await window.aer?.invoke('system:elevate');
    if (res?.success) {
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 700));
        const ok = await runPingTest();
        if (ok && currentIsAdmin) break;
      }
    } else {
      setChipStatus('connected', false);
    }
  } catch {
    setChipStatus('connected', false);
  }
}

// ─── Conexão com o Backend C# ─────────────────────────────────────────────
async function initBackendConnection() {
  setChipStatus('disconnected');
  document.getElementById('backend-chip')?.addEventListener('click', handleChipClick);

  // Fechar splash: usa __splashDone se disponível, senão manipula DOM direto
  let splashClosed = false;
  function closeSplash() {
    if (splashClosed) return;
    splashClosed = true;

    if (typeof window.__splashDone === 'function') {
      window.__splashDone();
      return;
    }

    // Fallback direto — caso splash.js ainda não tenha carregado
    const splash = document.getElementById('aer-splash');
    if (splash) {
      const bar    = document.getElementById('splash-bar');
      const status = document.getElementById('splash-status');
      if (bar)    bar.style.width    = '100%';
      if (status) status.textContent = 'Pronto!';
      splash.style.transition = 'opacity 0.5s ease, visibility 0.5s ease';
      setTimeout(() => {
        splash.style.opacity    = '0';
        splash.style.visibility = 'hidden';
        setTimeout(() => { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 600);
      }, 300);
    }
  }

  if (typeof window.aer?.onStatusChange === 'function') {
    window.aer.onStatusChange((status) => {
      Logger.info(MODULE, `Status do backend: ${status}`);
      setChipStatus(status);
      if (status === 'connected') {
        runPingTest().then(() => closeSplash());
      }
    });
  }

  // Sondagem ativa imediata (a cada 300ms nos primeiros 3s) para conectar no menor tempo possível
  runPingTest().then(ok => { if (ok) closeSplash(); });
  let pollCount = 0;
  const pollTimer = setInterval(async () => {
    pollCount++;
    const isOnline = document.getElementById('backend-chip-label')?.textContent === 'Online';
    if (isOnline || pollCount > 10) {
      clearInterval(pollTimer);
      if (isOnline) closeSplash();
      return;
    }
    const ok = await runPingTest();
    if (ok) {
      clearInterval(pollTimer);
      closeSplash();
    }
  }, 300);

  // Fallback de segurança: fechar splash após 3s mesmo se o backend estiver offline
  setTimeout(() => closeSplash(), 3000);
}

async function runPingTest() {
  const t0 = performance.now();
  try {
    const response = await window.aer?.invoke('ping');
    if (!response) return false;
    const latency = (performance.now() - t0).toFixed(1);
    Logger.info(MODULE, `✅ Ping OK! Latência: ${latency}ms (Admin=${response.isAdmin})`);
    setChipStatus('connected', typeof response.isAdmin === 'boolean' ? response.isAdmin : currentIsAdmin);
    const el = document.getElementById('meta-score-lat');
    if (el) el.textContent = `${latency} ms`;
    return true;
  } catch (err) {
    Logger.warn(MODULE, `⚠️ Ping falhou: ${err.message}`);
    return false;
  }
}

// ─── Busca Global Ctrl+K ─────────────────────────────────────────────────

const SEARCH_ITEMS = [
  { label: 'Dashboard',      page: 'dashboard',   icon: '📊' },
  { label: 'Monitor',        page: 'monitor',     icon: '📈' },
  { label: 'Otimizador',     page: 'optimizer',   icon: '⚡' },
  { label: 'Diagnóstico',    page: 'diagnostics', icon: '🩺' },
  { label: 'Processos',      page: 'processes',   icon: '🔄' },
  { label: 'Serviços',       page: 'services',    icon: '⚙️' },
  { label: 'Energia',        page: 'energy',      icon: '🔋' },
  { label: 'Benchmark',      page: 'benchmark',   icon: '📐' },
  { label: 'Limpeza',        page: 'cleanup',     icon: '🗑️' },
  { label: 'Inicialização',  page: 'startup',     icon: '🚀' },
  { label: 'Rede',           page: 'network',     icon: '🌐' },
  { label: 'Terminal',       page: 'terminal',    icon: '💻' },
  // ── Novos módulos Fases 15-19 ──
  { label: 'Armazenamento',  page: 'storage',     icon: '💽' },
  { label: 'Drivers',        page: 'drivers',     icon: '🖥️' },
  { label: 'Segurança',      page: 'security',    icon: '🛡️' },
  { label: 'Backup',         page: 'backup',      icon: '🗃️' },
  { label: 'Logs',           page: 'logs',        icon: '📋' },
  { label: 'Configurações',  page: 'settings',    icon: '🎨' },
  { label: 'Atualizações',   page: 'updates',     icon: '✅' },
  { label: 'Plugins',        page: 'plugins',     icon: '🧩' },
  { label: 'Biblioteca',     page: 'library',     icon: '📦' },
  { label: 'Programas Instalados', page: 'programs', icon: '🗑' },
  { label: 'Game Mode',      page: 'gamemode',    icon: '🎮' },
  { label: 'Tweaks',         page: 'tweaks',      icon: '🔧' },
  { label: 'WinUtil',        page: 'winutil',     icon: '🚀' },
];

function initSearch() {
  // Atalho Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSpotlight();
    }
    if (e.key === 'Escape') closeSpotlight();
  });

  // Botão de busca no topbar
  document.getElementById('global-search')?.addEventListener('focus', openSpotlight);
  document.getElementById('global-search')?.addEventListener('click', openSpotlight);
}

function openSpotlight() {
  if (document.getElementById('aer-spotlight')) return;

  const overlay = document.createElement('div');
  overlay.id = 'aer-spotlight';
  overlay.innerHTML = `
    <div class="spotlight-box" id="spotlight-box">
      <div class="spotlight-input-row">
        <span class="spotlight-icon-search">🔍</span>
        <input class="spotlight-input" id="spotlight-input" placeholder="Buscar página ou recurso..." autofocus>
        <kbd class="spotlight-kbd">Esc</kbd>
      </div>
      <div class="spotlight-results" id="spotlight-results"></div>
    </div>`;

  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeSpotlight(); });
  document.body.appendChild(overlay);
  injectSpotlightStyles();

  const input = document.getElementById('spotlight-input');
  input?.focus();
  renderSpotlightResults('');

  input?.addEventListener('input', () => renderSpotlightResults(input.value));
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = document.querySelector('.spotlight-item');
      if (first) { navigate(first.dataset.page); closeSpotlight(); }
    }
    if (e.key === 'ArrowDown') { document.querySelector('.spotlight-item')?.focus(); e.preventDefault(); }
  });
}

function closeSpotlight() {
  document.getElementById('aer-spotlight')?.remove();
  document.getElementById('global-search')?.blur();
}

function renderSpotlightResults(query) {
  const container = document.getElementById('spotlight-results');
  if (!container) return;
  const q = query.toLowerCase();
  const filtered = SEARCH_ITEMS.filter(item =>
    !q || item.label.toLowerCase().includes(q) || item.page.includes(q)
  );
  if (!filtered.length) {
    container.innerHTML = `<div class="spotlight-empty">Nenhum resultado para "${query}"</div>`;
    return;
  }
  container.innerHTML = filtered.map(item => `
    <button class="spotlight-item" data-page="${item.page}">
      <span class="spotlight-item-icon">${item.icon}</span>
      <span class="spotlight-item-label">${item.label}</span>
      <span class="spotlight-item-page">${item.page}</span>
    </button>`).join('');

  container.querySelectorAll('.spotlight-item').forEach(btn => {
    btn.addEventListener('click', () => { navigate(btn.dataset.page); closeSpotlight(); });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { btn.nextElementSibling?.focus(); e.preventDefault(); }
      if (e.key === 'ArrowUp')   { btn.previousElementSibling?.focus() ?? document.getElementById('spotlight-input')?.focus(); e.preventDefault(); }
    });
  });
}

function injectSpotlightStyles() {
  if (document.getElementById('spotlight-styles')) return;
  const s = document.createElement('style');
  s.id = 'spotlight-styles';
  s.textContent = `
    #aer-spotlight { position:fixed; inset:0; background:rgba(0,0,0,.6); backdrop-filter:blur(6px); z-index:9999; display:flex; align-items:flex-start; justify-content:center; padding-top:15vh; }
    .spotlight-box { background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); width:560px; max-width:90vw; box-shadow:0 24px 64px rgba(0,0,0,.5); overflow:hidden; }
    .spotlight-input-row { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-4); border-bottom:1px solid var(--color-border-subtle); }
    .spotlight-icon-search { font-size:1.1rem; flex-shrink:0; }
    .spotlight-input { flex:1; background:transparent; border:none; outline:none; color:var(--color-text-primary); font-size:var(--text-base); }
    .spotlight-kbd { background:var(--color-bg-surface-3); border:1px solid var(--color-border-subtle); border-radius:4px; padding:2px 6px; font-size:11px; color:var(--color-text-muted); flex-shrink:0; }
    .spotlight-results { max-height:320px; overflow-y:auto; padding:var(--space-2); }
    .spotlight-item { display:flex; align-items:center; gap:var(--space-3); width:100%; background:transparent; border:none; border-radius:var(--radius-md); padding:var(--space-3) var(--space-3); cursor:pointer; text-align:left; transition:background var(--transition-fast); }
    .spotlight-item:hover, .spotlight-item:focus { background:var(--color-bg-surface-2); outline:none; }
    .spotlight-item-icon { font-size:1.2rem; flex-shrink:0; }
    .spotlight-item-label { color:var(--color-text-primary); font-size:var(--text-sm); font-weight:500; flex:1; }
    .spotlight-item-page { color:var(--color-text-muted); font-size:var(--text-xs); font-family:var(--font-mono); }
    .spotlight-empty { text-align:center; padding:var(--space-6); color:var(--color-text-muted); font-size:var(--text-sm); }
  `;
  document.head.appendChild(s);
}

// ─── Notificações ─────────────────────────────────────────────────────────

const NOTIF_KEY = 'aer:notifications';
let notifPanelOpen = false;

export function pushNotification(title, message, type = 'info') {
  const notifs = loadNotifications();
  notifs.unshift({ id: Date.now(), title, message, type, time: new Date().toISOString(), read: false });
  saveNotifications(notifs.slice(0, 50));
  updateNotifBadge();
}

function loadNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '[]'); } catch { return []; }
}

function saveNotifications(notifs) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs)); } catch { }
}

function updateNotifBadge() {
  const unread = loadNotifications().filter(n => !n.read).length;
  let badge = document.getElementById('notif-badge');
  if (!badge) {
    const btn = document.getElementById('btn-notifications');
    if (!btn) return;
    badge = document.createElement('span');
    badge.id = 'notif-badge';
    badge.className = 'notif-badge';
    btn.style.position = 'relative';
    btn.appendChild(badge);
    injectNotifStyles();
  }
  badge.textContent = unread > 0 ? String(unread > 99 ? '99+' : unread) : '';
  badge.style.display = unread > 0 ? 'flex' : 'none';
}

function initNotifications() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;
  btn.addEventListener('click', toggleNotifPanel);
  updateNotifBadge();
}

function toggleNotifPanel() {
  if (notifPanelOpen) { closeNotifPanel(); return; }
  openNotifPanel();
}

function openNotifPanel() {
  notifPanelOpen = true;
  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.className = 'notif-panel';
  renderNotifPanel(panel);
  document.body.appendChild(panel);

  setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);
}

function closeOnOutside(e) {
  const panel = document.getElementById('notif-panel');
  const btn   = document.getElementById('btn-notifications');
  if (panel && !panel.contains(e.target) && e.target !== btn) closeNotifPanel();
}

function closeNotifPanel() {
  notifPanelOpen = false;
  document.getElementById('notif-panel')?.remove();
  document.removeEventListener('mousedown', closeOnOutside);
}

function renderNotifPanel(panel) {
  const notifs = loadNotifications();
  const icons  = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
  panel.innerHTML = `
    <div class="notif-header">
      <span class="notif-title">Notificações</span>
      <button class="notif-clear-all" id="notif-clear-all">Limpar todas</button>
    </div>
    <div class="notif-list">
      ${notifs.length ? notifs.map(n => `
        <div class="notif-item ${n.read ? 'notif-read' : 'notif-unread'}" data-id="${n.id}">
          <span class="notif-item-icon">${icons[n.type] ?? 'ℹ️'}</span>
          <div class="notif-item-body">
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-msg">${n.message}</div>
            <div class="notif-item-time">${new Date(n.time).toLocaleString('pt-BR')}</div>
          </div>
        </div>`).join('')
        : `<div class="notif-empty">Nenhuma notificação</div>`}
    </div>`;

  // Marcar todas como lidas ao abrir
  const notifs2 = loadNotifications().map(n => ({ ...n, read: true }));
  saveNotifications(notifs2);
  updateNotifBadge();

  panel.querySelector('#notif-clear-all')?.addEventListener('click', () => {
    saveNotifications([]);
    updateNotifBadge();
    closeNotifPanel();
  });
}

function injectNotifStyles() {
  if (document.getElementById('notif-styles')) return;
  const s = document.createElement('style');
  s.id = 'notif-styles';
  s.textContent = `
    .notif-badge { position:absolute; top:-4px; right:-4px; background:#e74c3c; color:#fff; font-size:9px; font-weight:700; width:16px; height:16px; border-radius:50%; align-items:center; justify-content:center; }
    .notif-panel { position:fixed; top:52px; right:16px; width:340px; max-height:480px; background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-xl); box-shadow:0 16px 48px rgba(0,0,0,.4); z-index:9998; display:flex; flex-direction:column; overflow:hidden; }
    .notif-header { display:flex; align-items:center; justify-content:space-between; padding:var(--space-3) var(--space-4); border-bottom:1px solid var(--color-border-subtle); }
    .notif-title { font-weight:600; font-size:var(--text-sm); color:var(--color-text-primary); }
    .notif-clear-all { background:transparent; border:none; color:var(--color-text-muted); font-size:var(--text-xs); cursor:pointer; padding:2px 6px; border-radius:var(--radius-sm); transition:var(--transition-fast); }
    .notif-clear-all:hover { color:#e74c3c; }
    .notif-list { overflow-y:auto; max-height:400px; }
    .notif-item { display:flex; gap:var(--space-3); padding:var(--space-3) var(--space-4); border-bottom:1px solid var(--color-border-subtle); cursor:default; transition:background var(--transition-fast); }
    .notif-item:hover { background:var(--color-bg-surface-2); }
    .notif-unread { background:rgba(0,255,136,.04); }
    .notif-item-icon { font-size:1.1rem; flex-shrink:0; margin-top:1px; }
    .notif-item-body { flex:1; min-width:0; }
    .notif-item-title { font-size:var(--text-sm); font-weight:600; color:var(--color-text-primary); }
    .notif-item-msg { font-size:var(--text-xs); color:var(--color-text-muted); margin-top:1px; }
    .notif-item-time { font-size:10px; color:var(--color-text-muted); margin-top:3px; opacity:.7; }
    .notif-empty { text-align:center; padding:var(--space-8); color:var(--color-text-muted); font-size:var(--text-sm); }
  `;
  document.head.appendChild(s);
}

// ─── Controle Responsivo da Sidebar ───────────────────────────────────────
function initSidebarControls() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const STORAGE_KEY = 'aer:sidebar-collapsed';

  const userPref = localStorage.getItem(STORAGE_KEY);
  let isCollapsed = userPref === 'true';

  const applySidebarState = (collapsed, save = true) => {
    isCollapsed = collapsed;
    if (collapsed) {
      sidebar?.classList.add('sidebar--collapsed');
    } else {
      sidebar?.classList.remove('sidebar--collapsed');
    }
    if (save) {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    }
  };

  // Aplica preferência inicial ou auto-colapso em telas menores
  if (userPref !== null) {
    applySidebarState(isCollapsed, false);
  } else if (window.innerWidth <= 880) {
    applySidebarState(true, false);
  }

  toggleBtn?.addEventListener('click', () => {
    applySidebarState(!sidebar?.classList.contains('sidebar--collapsed'), true);
  });

  // Auto-colapso responsivo com debounce ao redimensionar
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const storedPref = localStorage.getItem(STORAGE_KEY);
      if (window.innerWidth <= 880) {
        sidebar?.classList.add('sidebar--collapsed');
      } else if (storedPref !== 'true') {
        sidebar?.classList.remove('sidebar--collapsed');
      }
    }, 100);
  });

  // Configura tooltips automáticos nos itens de navegação para o modo recolhido
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    const text = item.textContent.trim();
    if (text && !item.getAttribute('title')) {
      item.setAttribute('title', text);
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  applySettings(); // aplica tema persistido antes de qualquer coisa
  Logger.info(MODULE, '⚡ AeR v0.5.0 iniciando...');
  Logger.info(MODULE, `Plataforma: ${window.systemInfo?.platform} | Arch: ${window.systemInfo?.arch}`);

  initWindowControls();
  initSidebarControls();
  initSearch();
  initNotifications();
  initRouter();
  await initBackendConnection();

  Logger.info(MODULE, '✅ App inicializado.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
