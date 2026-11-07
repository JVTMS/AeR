/**
 * AeR - Advanced Engine Reborn
 * Main Process (Electron) — v0.3.0 (Passo 3: Git/GitHub IPC)
 *
 * Responsabilidades:
 *  - Criar e gerenciar a janela principal com Mica/Acrylic (Windows 11)
 *  - Iniciar e gerenciar o processo do Backend C# (AeR.Api)
 *  - Conectar ao servidor Named Pipe do backend via PipeClient
 *  - Registrar handlers IPC para o Renderer (via ContextBridge)
 *  - Encaminhar eventos push do backend para o Renderer
 *  - Executar operações Git via IPC (painel GitHub)
 *
 * Segurança: nodeIntegration desativado, contextIsolation ativado, CSP estrito.
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, execFile } = require('child_process');
const pipeClient = require('./pipe-client');
const gitHandlers = require('./git-handlers');
const WindowStateManager = require('./window-state-manager');

let windowStateManager = null;

// ─── Configurações Globais ─────────────────────────────────────────────────
const IS_DEV = process.argv.includes('--inspect=5858') || !app.isPackaged;

// Caminho do executável do backend C#
function getBackendExe() {
  if (!IS_DEV) {
    return path.join(process.resourcesPath, 'backend', 'AeR.Api.exe');
  }
  const candidates = [
    path.join(__dirname, '../../backend/AeR.Api/bin/Debug/net10.0/win-x64/AeR.Api.exe'),
    path.join(__dirname, '../../backend/AeR.Api/bin/Release/net10.0/win-x64/AeR.Api.exe'),
    path.join(__dirname, '../../backend/AeR.Api/bin/Debug/net10.0/AeR.Api.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const BACKEND_EXE = getBackendExe();

/** Delay antes de tentar conectar ao pipe (dar tempo ao backend de inicializar) */
const BACKEND_STARTUP_DELAY_MS = 800;

let mainWindow = null;
let backendProcess = null;

// ─── Criação da Janela Principal ──────────────────────────────────────────
function createMainWindow() {
  if (!windowStateManager) {
    windowStateManager = new WindowStateManager();
  }
  const initialBounds = windowStateManager.getValidatedBounds();

  mainWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 780,
    minHeight: 540,
    resizable: true,
    frame: false,           // Frameless para titlebar customizada
    transparent: false,
    backgroundColor: '#0A0A0F',
    show: false,            // Exibir somente após 'ready-to-show' (sem flash branco)
    opacity: 0,             // Começa invisível para fade-in suave
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,  // SEGURANÇA: Isolamento de contexto obrigatório
      nodeIntegration: false,  // SEGURANÇA: Node desabilitado no renderer
      sandbox: true,           // SEGURANÇA: Sandbox do Chromium ativado
      webSecurity: true,
    },
  });

  windowStateManager.manage(mainWindow);

  // Notificar Renderer sobre qualquer alteração no estado da janela
  const notifyWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.send('window:state-changed', {
        isMaximized: mainWindow.isMaximized(),
        isFullScreen: mainWindow.isFullScreen(),
        isMinimized: mainWindow.isMinimized(),
        bounds: mainWindow.getBounds(),
      });
    } catch { }
  };

  mainWindow.on('maximize', notifyWindowState);
  mainWindow.on('unmaximize', notifyWindowState);
  mainWindow.on('enter-full-screen', notifyWindowState);
  mainWindow.on('leave-full-screen', notifyWindowState);
  mainWindow.on('resized', notifyWindowState);
  mainWindow.on('moved', notifyWindowState);
  mainWindow.on('restore', notifyWindowState);

  // Ativar efeito Mica no Windows 11 (substitui backdrop-filter CSS puro)
  if (process.platform === 'win32') {
    try {
      mainWindow.setBackgroundMaterial('mica');
    } catch {
      // Electron version sem suporte a Mica — fallback para CSS blur
      console.warn('[AeR Main] Mica não suportado nesta versão do Electron.');
    }
  }

  mainWindow.loadFile(path.join(__dirname, '../html/index.html'));

  // Exibir janela com fade-in suave quando estiver pronta
  mainWindow.once('ready-to-show', () => {
    if (initialBounds.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    notifyWindowState();

    // Fade-in: incrementa opacity de 0 → 1 em ~200ms
    let op = 0;
    const step = () => {
      op = Math.min(1, op + 0.08);
      mainWindow.setOpacity(op);
      if (op < 1) setTimeout(step, 12);
    };
    step();
  });

  // Bloquear DevTools em produção (build empacotado)
  if (!IS_DEV) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Gerenciamento do Backend C# ──────────────────────────────────────────

/**
 * Verifica se o Named Pipe do backend já está aceitando conexões.
 */
function isPipeActive(timeoutMs = 350) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { }
      resolve(val);
    };
    const sock = net.createConnection('\\\\.\\pipe\\AeR_IPC', () => done(true));
    sock.on('error', () => done(false));
    setTimeout(() => done(false), timeoutMs);
  });
}

/**
 * Inicia o processo do backend C# (AeR.Api.exe).
 * Se o pipe já estiver ativo (ex: iniciado pelo start-aer.ps1), não inicia duplicata.
 */
async function startBackend() {
  if (fs.existsSync('\\\\.\\pipe\\AeR_IPC') || await isPipeActive()) {
    console.log('[AeR Main] Backend já está em execução (pipe ativo).');
    return;
  }

  const exe = getBackendExe();
  if (!fs.existsSync(exe)) {
    console.warn('[AeR Main] Executável do backend não encontrado:', exe);
    if (IS_DEV) {
      console.log('[AeR Main] Modo DEV: compile o backend com: cd backend && dotnet build');
    }
    return;
  }

  try {
    backendProcess = spawn(exe, [], {
      cwd: path.dirname(exe),
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend ERR] ${data.toString().trim()}`);
    });

    backendProcess.on('exit', (code) => {
      console.warn(`[AeR Main] Backend encerrou com código: ${code}`);
      backendProcess = null;
    });

    console.log('[AeR Main] Backend iniciado com PID:', backendProcess.pid);
  } catch (err) {
    console.error('[AeR Main] Falha ao iniciar Backend:', err.message);
  }
}

function stopBackend() {
  pipeClient.destroy();
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill('SIGTERM');
    console.log('[AeR Main] Backend encerrado.');
  }
}

// ─── Conexão ao Named Pipe ────────────────────────────────────────────────

/**
 * Conecta ao servidor Named Pipe do backend C# com retry.
 * Notifica o Renderer sobre mudanças de status de conexão.
 */
async function connectToPipe() {
  // Eventos de status da conexão → Renderer
  pipeClient.on('connected', () => {
    console.log('[AeR Main] IPC conectado.');
    mainWindow?.webContents.send('backend:status', 'connected');
  });

  pipeClient.on('disconnected', () => {
    console.warn('[AeR Main] IPC desconectado. Reconectando...');
    mainWindow?.webContents.send('backend:status', 'disconnected');
  });

  // Encaminhar eventos push do backend para o Renderer
  // Ex: 'metrics:update' → window.aer.on('metrics:update', ...)
  const PUSH_EVENTS = ['metrics:update', 'processes:update', 'alerts:new'];
  PUSH_EVENTS.forEach(event => {
    pipeClient.on(`push:${event}`, (data) => {
      mainWindow?.webContents.send(`backend:push:${event}`, data);
    });
  });

  // Aguardar backend inicializar antes de conectar apenas se o pipe ainda não existir
  if (!fs.existsSync('\\\\.\\pipe\\AeR_IPC')) {
    await new Promise(resolve => setTimeout(resolve, BACKEND_STARTUP_DELAY_MS));
  }

  try {
    await pipeClient.connect();
  } catch (err) {
    console.warn('[AeR Main] Primeira tentativa de conexão falhou. O PipeClient tentará reconectar automaticamente.');
    // O PipeClient tentará reconectar automaticamente via backoff exponencial
  }
}

// ─── Handlers IPC (Main ↔ Renderer) ──────────────────────────────────────

/**
 * Handler principal: Renderer chama window.aer.invoke(command, payload, timeoutMs)
 * → preload → ipcRenderer.invoke('backend:invoke', ...) → aqui → Named Pipe → Backend C#
 */
ipcMain.handle('backend:invoke', async (_event, { command, payload, timeoutMs }) => {
  if (!pipeClient.isConnected) {
    throw new Error('Backend não está conectado. Aguarde a reconexão.');
  }
  return await pipeClient.invoke(command, payload, timeoutMs);
});

// ── Utilitários do sistema ────────────────────────────────────────────────
ipcMain.handle('app:openExternal', async (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    return await shell.openExternal(url);
  }
});

ipcMain.handle('backend:is-connected', () => pipeClient.isConnected);

// ── Controle de janela frameless e responsiva ──────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.maximize());
ipcMain.on('window:unmaximize', () => mainWindow?.unmaximize());
ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:toggle-fullscreen', () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.on('window:close', () => mainWindow?.close());

ipcMain.handle('window:is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);
ipcMain.handle('window:is-fullscreen', () => mainWindow ? mainWindow.isFullScreen() : false);
ipcMain.handle('window:get-state', () => {
  if (!mainWindow) return null;
  return {
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen(),
    isMinimized: mainWindow.isMinimized(),
    bounds: mainWindow.getBounds(),
  };
});

// ─── Ciclo de Vida da App ─────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startBackend();
  createMainWindow();
  await connectToPipe();

  // ── Registrar handlers Git ───────────────────────────────────────────────
  gitHandlers.register(ipcMain);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});
