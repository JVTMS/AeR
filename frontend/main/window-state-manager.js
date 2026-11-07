/**
 * AeR - Window State Manager
 * Gerencia persistência segura e restauração do estado e limites da janela.
 *
 * Suporta:
 *  - Salvamento de largura, altura, posição X e Y
 *  - Preservação do estado maximizado / restaurado
 *  - Validação de limites contra múltiplos monitores (impede janela fora de tela)
 *  - Debounce de escrita em disco para máxima performance
 */

const { screen, app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_CONFIG = {
  width: 1280,
  height: 820,
  minWidth: 780,
  minHeight: 540,
  isMaximized: false,
};

class WindowStateManager {
  constructor(customConfigPath = null) {
    const electron = require('electron');
    const electronApp = electron.app;

    if (customConfigPath) {
      this.configPath = customConfigPath;
    } else if (electronApp && typeof electronApp.getPath === 'function') {
      this.configPath = path.join(electronApp.getPath('userData'), 'window-state.json');
    } else {
      const baseDir = process.env.APPDATA || process.env.LOCALAPPDATA || process.env.HOME || '.';
      this.configPath = path.join(baseDir, 'AeR', 'window-state.json');
    }

    this.state = this.loadState();
    this.saveTimeout = null;
    this.win = null;
  }

  /**
   * Carrega estado salvo no disco com fallback para valores seguros.
   */
  loadState() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const data = JSON.parse(raw);
        return {
          width: typeof data.width === 'number' ? data.width : DEFAULT_CONFIG.width,
          height: typeof data.height === 'number' ? data.height : DEFAULT_CONFIG.height,
          x: typeof data.x === 'number' ? data.x : undefined,
          y: typeof data.y === 'number' ? data.y : undefined,
          isMaximized: Boolean(data.isMaximized),
        };
      }
    } catch (err) {
      console.warn('[WindowStateManager] Falha ao ler estado salvo:', err.message);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Valida se os limites salvos estão visíveis em algum dos monitores conectados.
   * Se o monitor foi desconectado ou a resolução mudou, centraliza no monitor primário.
   */
  getValidatedBounds() {
    const electron = require('electron');
    const electronScreen = electron.screen;
    const displays = (electronScreen && typeof electronScreen.getAllDisplays === 'function')
      ? electronScreen.getAllDisplays()
      : [];
    const primaryDisplay = (electronScreen && typeof electronScreen.getPrimaryDisplay === 'function')
      ? electronScreen.getPrimaryDisplay()
      : null;
    const { width, height, x, y } = this.state;

    // Garantir tamanhos mínimos e adaptação automática a telas menores (ex: 1366x768, 1280x720, DPI 150%)
    const maxW = primaryDisplay?.workArea?.width  || 3840;
    const maxH = primaryDisplay?.workArea?.height || 2160;
    const rawWidth  = Math.max(DEFAULT_CONFIG.minWidth,  width  || DEFAULT_CONFIG.width);
    const rawHeight = Math.max(DEFAULT_CONFIG.minHeight, height || DEFAULT_CONFIG.height);
    const validatedWidth  = Math.min(rawWidth,  Math.max(DEFAULT_CONFIG.minWidth,  maxW));
    const validatedHeight = Math.min(rawHeight, Math.max(DEFAULT_CONFIG.minHeight, maxH));
    const autoMaximizeOnSmallScreen =
      typeof x !== 'number' && primaryDisplay?.workArea &&
      (primaryDisplay.workArea.width <= 1366 || primaryDisplay.workArea.height <= 768);

    if (typeof x !== 'number' || typeof y !== 'number') {
      return {
        width: validatedWidth,
        height: validatedHeight,
        x: undefined,
        y: undefined,
        isMaximized: Boolean(this.state.isMaximized || autoMaximizeOnSmallScreen),
      };
    }

    // Verificar se a posição intersecta significativamente alguma tela ativa
    const isVisibleOnAnyDisplay = displays.some(display => {
      const area = display.workArea;
      const minVisibleX = 100;
      const minVisibleY = 50;
      return (
        x + minVisibleX <= area.x + area.width &&
        x + validatedWidth - minVisibleX >= area.x &&
        y + minVisibleY <= area.y + area.height &&
        y + validatedHeight - minVisibleY >= area.y
      );
    });

    if (isVisibleOnAnyDisplay || !primaryDisplay) {
      return {
        width: validatedWidth,
        height: validatedHeight,
        x,
        y,
        isMaximized: this.state.isMaximized,
      };
    }

    // Se estiver fora de todas as telas (ex: monitor desconectado), reposiciona no monitor principal
    const area = primaryDisplay.workArea;
    const centeredX = Math.round(area.x + (area.width - validatedWidth) / 2);
    const centeredY = Math.round(area.y + (area.height - validatedHeight) / 2);

    return {
      width: validatedWidth,
      height: validatedHeight,
      x: Math.max(area.x, centeredX),
      y: Math.max(area.y, centeredY),
      isMaximized: this.state.isMaximized,
    };
  }

  /**
   * Conecta os listeners à janela BrowserWindow para salvar o estado automaticamente.
   */
  manage(browserWindow) {
    this.win = browserWindow;

    const updateBounds = () => {
      if (!this.win || this.win.isDestroyed()) return;

      // Não sobrescreve x, y, width, height se a janela estiver maximizada ou em fullscreen
      if (!this.win.isMaximized() && !this.win.isFullScreen()) {
        const bounds = this.win.getBounds();
        this.state.x = bounds.x;
        this.state.y = bounds.y;
        this.state.width = bounds.width;
        this.state.height = bounds.height;
      }
      this.state.isMaximized = this.win.isMaximized();
      this.debouncedSave();
    };

    browserWindow.on('resize', updateBounds);
    browserWindow.on('move', updateBounds);
    browserWindow.on('maximize', updateBounds);
    browserWindow.on('unmaximize', updateBounds);
    browserWindow.on('close', () => {
      if (!this.win || this.win.isDestroyed()) return;
      this.state.isMaximized = this.win.isMaximized();
      this.saveSync();
    });
  }

  debouncedSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveSync(), 500);
  }

  saveSync() {
    try {
      const data = JSON.stringify({
        width: this.state.width,
        height: this.state.height,
        x: this.state.x,
        y: this.state.y,
        isMaximized: this.state.isMaximized,
      }, null, 2);
      fs.writeFileSync(this.configPath, data, 'utf8');
    } catch (err) {
      console.warn('[WindowStateManager] Falha ao salvar estado:', err.message);
    }
  }
}

module.exports = WindowStateManager;
