/**
 * AeR — Router (v0.3)
 * Roteador simples baseado em data-page. Carrega páginas dinamicamente
 * via import() e injeta no #page-container.
 */

import { Logger } from './logger.js';

const MODULE = 'Router';

/** Mapa de páginas disponíveis */
const ROUTES = {
  dashboard:   () => import('../pages/dashboard.js'),
  diagnostics: () => import('../pages/diagnostics.js'),
  benchmark:   () => import('../pages/benchmark.js'),
  monitor:     () => import('../pages/monitor.js'),
  optimizer:   () => import('../pages/optimizer.js'),
  cleanup:     () => import('../pages/cleanup.js'),
  startup:     () => import('../pages/startup.js'),
  services:    () => import('../pages/services.js'),
  processes:   () => import('../pages/processes.js'),
  network:     () => import('../pages/network.js'),
  terminal:    () => import('../pages/terminal.js'),
  energy:      () => import('../pages/energy.js'),
  // ── Fase 15-19: Novos módulos ──
  drivers:     () => import('../pages/drivers.js'),
  storage:     () => import('../pages/storage.js'),
  logs:        () => import('../pages/logs.js'),
  plugins:     () => import('../pages/plugins.js'),
  settings:    () => import('../pages/settings.js'),
  updates:     () => import('../pages/updates.js'),
  security:    () => import('../pages/security.js'),
  backup:      () => import('../pages/backup.js'),
  library:     () => import('../pages/library.js'),
  programs:    () => import('../pages/programs.js'),
  gamemode:    () => import('../pages/gamemode.js'),
  tweaks:      () => import('../pages/tweaks.js'),
  winutil:     () => import('../pages/winutil.js'),
  github:      () => import('../pages/github.js'),
};

const pageContainer = document.getElementById('page-container');
let currentPage   = null;
let currentModule = null;

/**
 * Navega para uma página pelo id.
 * @param {string} pageId
 */
export async function navigate(pageId) {
  if (pageId === currentPage) return;

  Logger.info(MODULE, `Navegando para: ${pageId}`);

  try {
    const loader = ROUTES[pageId];
    if (!loader) {
      Logger.warn(MODULE, `Rota desconhecida: ${pageId}. Usando stub.`);
      return;
    }

    // Unmount da página atual
    if (currentModule && typeof currentModule.unmount === 'function') {
      currentModule.unmount();
    }

    pageContainer.innerHTML = '';
    pageContainer.className = 'page-container';

    // Carregar e montar nova página
    currentModule = await loader();
    if (typeof currentModule.mount === 'function') {
      await currentModule.mount(pageContainer);
    }

    // Animação de entrada
    pageContainer.classList.add('page-enter');
    pageContainer.addEventListener('animationend', () => {
      pageContainer.classList.remove('page-enter');
    }, { once: true });

    currentPage = pageId;

    // Atualizar nav items ativos
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      const isActive = item.dataset.page === pageId;
      item.classList.toggle('nav-item--active', isActive);
      item.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    Logger.info(MODULE, `Página "${pageId}" carregada com sucesso.`);

  } catch (err) {
    Logger.error(MODULE, `Erro ao carregar página "${pageId}":`, err);
    // Fallback: mostrar mensagem de erro inline
    pageContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;color:hsl(210,12%,50%);">
        <div style="font-size:32px;">⚠️</div>
        <div style="font-size:14px;">Módulo em desenvolvimento</div>
        <div style="font-size:12px;opacity:0.6;">${pageId}</div>
      </div>`;
    currentPage = pageId;
  }
}

/** Inicializa o router, vinculando os nav items. */
export function initRouter() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  // Página inicial: Dashboard
  navigate('dashboard');
  Logger.info(MODULE, 'Router inicializado.');
}
