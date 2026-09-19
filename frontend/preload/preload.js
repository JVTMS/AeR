/**
 * AeR — Preload Script — Context Bridge Seguro (v0.2.0)
 *
 * SEGURANÇA: Único ponto de contato entre o Renderer (DOM) e o Main Process.
 * Expõe apenas APIs estritamente necessárias e bem definidas.
 * Nunca expor `require`, `ipcRenderer` diretamente, ou qualquer API Node.
 */

const { contextBridge, ipcRenderer } = require('electron');

// ─── API de Controle da Janela ────────────────────────────────────────────
contextBridge.exposeInMainWorld('windowAPI', {
  minimize:     () => ipcRenderer.send('window:minimize'),
  maximize:     () => ipcRenderer.send('window:maximize'),
  close:        () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
});

// ─── API de IPC com o Backend C# ─────────────────────────────────────────
contextBridge.exposeInMainWorld('aer', {
  /**
   * Envia um comando ao backend C# via Named Pipe (passando pelo Main Process).
   * @param {string} command - Ex: 'ping', 'metrics:get', 'processes:list'
   * @param {object} [payload] - Dados opcionais do comando
   * @returns {Promise<object>} Resposta do backend
   */
  invoke: (command, payload) =>
    ipcRenderer.invoke('backend:invoke', { command, payload }),

  /**
   * Abre uma URL externa no navegador padrão do sistema.
   * @param {string} url
   */
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  /**
   * Retorna se o Named Pipe está conectado atualmente.
   * @returns {Promise<boolean>}
   */
  isConnected: () => ipcRenderer.invoke('backend:is-connected'),

  /**
   * Registra listener para eventos push do backend (telemetria em tempo real).
   * @param {string} event - Ex: 'metrics:update', 'alerts:new'
   * @param {function} callback - Função chamada com os dados do evento
   * @returns {function} Função para remover o listener (cleanup)
   */
  on: (event, callback) => {
    const handler = (_evt, data) => callback(data);
    ipcRenderer.on(`backend:push:${event}`, handler);
    return () => ipcRenderer.removeListener(`backend:push:${event}`, handler);
  },

  /**
   * Registra listener para mudanças de status da conexão com o backend.
   * @param {function} callback - Chamado com 'connected' | 'disconnected'
   * @returns {function} Função para remover o listener
   */
  onStatusChange: (callback) => {
    const handler = (_evt, status) => callback(status);
    ipcRenderer.on('backend:status', handler);
    return () => ipcRenderer.removeListener('backend:status', handler);
  },
});

// ─── API do Sistema Operacional (somente leitura) ─────────────────────────
contextBridge.exposeInMainWorld('systemInfo', {
  platform: process.platform,
  arch:     process.arch,
});

// ─── API Git / GitHub ─────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('gitAPI', {
  /**
   * Invoca um comando git no Main Process.
   * @param {string} command - Ex: 'status', 'commit', 'push', 'pull'
   * @param {object} [params] - Parâmetros do comando
   * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
   */
  invoke: (command, params) =>
    ipcRenderer.invoke('git:invoke', { command, params }),
});
