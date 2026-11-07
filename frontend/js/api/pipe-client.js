/**
 * AeR — Pipe Client (API Layer)
 * Abstração para comunicação com o Backend C# via Named Pipe (através do Main Process).
 * O Renderer nunca acessa Pipes diretamente — tudo passa pelo ContextBridge (window.aer).
 */

import { Logger } from '../utils/logger.js';

const MODULE = 'PipeClient';

/** Listeners de eventos push (telemetria em tempo real) */
const listeners = new Map();

/**
 * Envia um comando ao backend e aguarda resposta.
 * @param {string} command - Comando ex: 'metrics:get'
 * @param {object} [payload] - Payload opcional
 * @param {number} [timeoutMs] - Timeout opcional em ms
 * @returns {Promise<object>} Resposta deserializada
 */
export async function invoke(command, payload = {}, timeoutMs) {
  Logger.debug(MODULE, `invoke → ${command}`, payload);
  try {
    const result = await window.aer.invoke(command, payload, timeoutMs);
    Logger.debug(MODULE, `invoke ← ${command}`, result);
    return result;
  } catch (err) {
    Logger.error(MODULE, `Erro em invoke(${command}):`, err);
    throw err;
  }
}

/**
 * Registra listener para eventos push do backend.
 * @param {string} event - Nome do evento ex: 'metrics:update'
 * @param {function} callback - Função chamada com os dados do evento
 * @returns {function} Função para cancelar o listener
 */
export function on(event, callback) {
  const removeListener = window.aer.on(event, callback);
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push({ callback, remove: removeListener });

  Logger.debug(MODULE, `Listener registrado: ${event}`);
  return removeListener;
}

/**
 * Cancela todos os listeners de um evento.
 * @param {string} event
 */
export function off(event) {
  const eventListeners = listeners.get(event) || [];
  eventListeners.forEach(({ remove }) => remove());
  listeners.delete(event);
  Logger.debug(MODULE, `Listeners removidos: ${event}`);
}

// ── Comandos de Alto Nível ─────────────────────────────────────────────────

/** Obtém snapshot atual de todas as métricas do sistema. */
export const getMetrics = () => invoke('metrics:get');

/** Lista processos em execução. */
export const getProcesses = () => invoke('processes:list');

/** Encerra um processo pelo PID. */
export const killProcess = (pid) => invoke('processes:kill', { pid });

/** Lista serviços do Windows. */
export const getServices = () => invoke('services:list');

/** Inicia/para/reinicia/habilita/desativa um serviço. */
export const controlService = (name, action) => invoke('services:control', { name, action });

// ── API do Otimizador ──────────────────────────────────────────────────────

/** Obtém o catálogo completo de otimizações com status atual. */
export const getOptimizerCatalog = () => invoke('optimizer:catalog:get');

/** Aplica uma otimização pelo ID. */
export const applyOptimization = (id) => invoke('optimizer:apply', { id });

/** Reverte uma otimização pelo ID. */
export const revertOptimization = (id) => invoke('optimizer:revert', { id });

/** Lista backups de otimizações disponíveis para reversão. */
export const listOptimizerBackups = () => invoke('optimizer:backup:list');

// ── API de Diagnóstico ─────────────────────────────────────────────────────

/** Score de saúde do sistema (CPU, RAM, disco, uptime). */
export const getDiagnosticsHealth = () => invoke('diagnostics:health');

/** Eventos críticos do Windows Event Log (últimas 24h). */
export const getSystemEvents = () => invoke('diagnostics:events');

// ── API de Energia ─────────────────────────────────────────────────────────

/** Lista planos de energia disponíveis (powercfg /list). */
export const getPowerPlans = () => invoke('energy:plans:get');

/** Ativa um plano de energia pelo GUID. */
export const setPowerPlan = (guid) => invoke('energy:plans:set', { guid });

// ── API de Benchmark ───────────────────────────────────────────────────────

/** Inicia benchmark de CPU (SHA-256). durationSec padrão = 5. */
export const runCpuBenchmark  = (durationSec = 5) => invoke('benchmark:cpu:start', { durationSec });

/** Inicia benchmark de disco (128 MB leitura/escrita). */
export const runDiskBenchmark = () => invoke('benchmark:disk:start');

/** Inicia benchmark de RAM (velocidade de cópia de memória). */
export const runRamBenchmark  = () => invoke('benchmark:ram:start');

// ── API de Monitor ─────────────────────────────────────────────────────────

/** Obtém histórico de métricas acumulado pelo backend. */
export const getMonitorHistory = () => invoke('monitor:history:get');

// ── API de Limpeza ─────────────────────────────────────────────────────────

/** Analisa arquivos temporários e retorna categorias com tamanho. */
export const runCleanupScan    = () => invoke('cleanup:scan');

/** Executa a limpeza das pastas selecionadas. */
export const runCleanupExecute = (paths) => invoke('cleanup:execute', { paths });

// ── API de Inicialização ───────────────────────────────────────────────────

/** Lista itens de inicialização do registro do Windows. */
export const getStartupItems   = () => invoke('startup:list');

/** Habilita ou desabilita um item de inicialização. */
export const toggleStartupItem = (name, scope, enabled) => invoke('startup:toggle', { name, scope, enabled });

// ── API de Rede ────────────────────────────────────────────────────────────

/** Lista adaptadores de rede com IP, DNS, MAC e status. */
export const getNetworkAdapters = () => invoke('network:adapters');

/** Executa ping para um host (4 tentativas). */
export const pingHost           = (host) => invoke('network:ping', { host });

// ── API de Terminal ────────────────────────────────────────────────────────

/** Executa um comando via cmd.exe com timeout de 30s. */
export const execTerminal = (command) => invoke('terminal:exec', { command });

// ── API de Armazenamento (Fase 15) ─────────────────────────────────────────

/** Lista todos os discos com uso, formato e tipo. */
export const getStorageList = () => invoke('storage:list');

// ── API de Drivers (Fase 15) ───────────────────────────────────────────────

/** Lista drivers de dispositivos via WMI. */
export const getDriversList = () => invoke('drivers:list');

// ── API de Segurança (Fase 16) ─────────────────────────────────────────────

/** Verifica status do Windows Defender e Firewall. */
export const getSecurityStatus = () => invoke('security:status');

// ── API de Backup (Fase 16) ────────────────────────────────────────────────

/** Lista backups existentes. */
export const getBackupList     = () => invoke('backup:list');

/** Cria um novo backup. */
export const createBackup      = (name, type, key) => invoke('backup:create', { name, type, key });

/** Restaura um backup pelo caminho do arquivo. */
export const restoreBackup     = (path) => invoke('backup:restore', { path });

/** Exclui um backup pelo caminho do arquivo. */
export const deleteBackup      = (path) => invoke('backup:delete', { path });

// ── API de Logs (Fase 17) ──────────────────────────────────────────────────

/** Lê as últimas 200 linhas de um arquivo de log. */
export const readLog = (file) => invoke('logs:read', { file });

// ── API de Atualizações (Fase 18) ─────────────────────────────────────────

/** Verifica se há atualizações disponíveis. */
export const checkUpdates = () => invoke('updates:check');

// ── API de Biblioteca (Fase 19) ────────────────────────────────────────────

/** Lista todos os softwares salvos na biblioteca. */
export const getLibraryList    = () => invoke('library:list');

/** Adiciona um software à biblioteca. */
export const addToLibrary      = (item) => invoke('library:add', item);

/** Remove um software da biblioteca pelo ID. */
export const removeFromLibrary = (id) => invoke('library:remove', { id });

/** Inicia download ou instalação de um software. */
export const installFromLibrary = (url, filePath) => invoke('library:install', { url, filePath });

// ── API do Otimizador — Scan Real (Fase 22) ────────────────────────────────

/**
 * Escaneia o estado REAL de todas as otimizações no PC atual.
 * Cada otimização é verificada com timeout de 2s.
 * Retorna isApplied=true mesmo para otimizações feitas fora do AeR.
 */
export const scanOptimizations = () => invoke('optimizer:scan');

// ── API de Programas Instalados (Fase 23) ──────────────────────────────────

/** Lista todos os programas instalados (registry). */
export const listPrograms = () => invoke('programs:list');

/**
 * Busca programas pelo nome ou editor.
 * @param {string} query - Texto de busca
 */
export const searchPrograms = (query) => invoke('programs:search', { query });

/**
 * Desinstala um programa.
 * @param {object} program - Objeto InstalledProgram com uninstallCommand e quickUninstallCommand
 * @param {boolean} silent - Se true, usa desinstalação silenciosa quando disponível
 */
export const uninstallProgram = (program, silent = true) => invoke('programs:uninstall', {
  uninstallCommand:      program.uninstallCommand,
  quietUninstallCommand: program.quietUninstallCommand,
  silent,
});

// ── API Game Mode (Fase 25) ────────────────────────────────────────────────

/** Status do Game Mode: jogo detectado, turbo ativo, kill list. */
export const getGameStatus = () => invoke('game:status');

/** Ativa o Modo Turbo (fecha processos da kill list). */
export const enableTurbo = (killList) => invoke('game:turbo:enable', killList ? { killList } : {});

/** Desativa o Modo Turbo. */
export const disableTurbo = () => invoke('game:turbo:disable');

/** Define a kill list completa do Turbo Mode. */
export const setGameKillList = (processes) => invoke('game:killlist:set', { processes });

/** Adiciona um processo à kill list. */
export const addToGameKillList = (process) => invoke('game:killlist:add', { process });

/** Remove um processo da kill list. */
export const removeFromGameKillList = (process) => invoke('game:killlist:remove', { process });

// ── API Saúde dos Discos SMART (Fase 27) ────────────────────────────────────

/** Retorna dados S.M.A.R.T. de todos os discos fixos. */
export const getDiskHealth = () => invoke('disk:health');

// ── Tweaks (Fase 28) ──────────────────────────────────────────────────────
export const getTweaksList  = ()       => invoke('tweaks:list');
export const applyTweaks    = (ids)    => invoke('tweaks:apply',  { ids });
export const revertTweaks   = (ids)    => invoke('tweaks:revert', { ids });

// ── WinUtil (Fase 28) ─────────────────────────────────────────────────────
export const launchWinUtil  = ()       => invoke('winutil:launch');

// ── Sistema (Privilégio Admin & Hardware) ─────────────────────────────────
export const getSystemStatus = ()      => invoke('system:status');
export const elevateBackend  = ()      => invoke('system:elevate');
