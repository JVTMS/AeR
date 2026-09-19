/**
 * AeR — Pipe Client (Main Process - Node.js)
 *
 * Cliente de Named Pipe para o Main Process do Electron.
 * Conecta ao servidor C# (AeR.Api) via \\.\pipe\AeR_IPC
 *
 * Protocolo (linha por linha JSON):
 *  Request:  { "id": "<uuid>", "command": "<cmd>", "payload": {} }
 *  Response: { "id": "<uuid>", "success": true, "data": {} }
 *  Push:     { "event": "<name>", "data": {} }
 *
 * Funcionalidades:
 *  - Reconexão automática com backoff exponencial
 *  - Correlação de requests por UUID (Promise pending map)
 *  - Suporte a eventos push do backend (telemetria em tempo real)
 *  - Buffer de linha para mensagens fragmentadas pelo TCP stack
 */

const net = require('net');
const { randomUUID } = require('crypto');
const EventEmitter = require('events');

const PIPE_PATH = '\\\\.\\pipe\\AeR_IPC';
const MAX_RECONNECT_DELAY = 15000; // 15s máximo de espera
const INITIAL_RECONNECT_DELAY = 500;

class PipeClient extends EventEmitter {
  constructor() {
    super();
    this._socket = null;
    this._connected = false;
    this._buffer = '';
    this._pending = new Map(); // Map<uuid, { resolve, reject, timeout }>
    this._reconnectDelay = INITIAL_RECONNECT_DELAY;
    this._reconnectTimer = null;
    this._destroyed = false;
  }

  // ── Conexão ─────────────────────────────────────────────────────────────

  /**
   * Conecta ao servidor Named Pipe do backend C#.
   * @returns {Promise<void>} Resolve quando a conexão é estabelecida.
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this._connected) {
        resolve();
        return;
      }

      this._socket = net.createConnection(PIPE_PATH);

      // ── Handlers de Socket ─────────────────────────────────────────────
      this._socket.once('connect', () => {
        console.log('[PipeClient] Conectado ao backend C#.');
        this._connected = true;
        this._reconnectDelay = INITIAL_RECONNECT_DELAY; // Reset backoff
        this.emit('connected');
        resolve();
      });

      this._socket.on('data', (chunk) => this._handleData(chunk));

      this._socket.on('close', () => {
        this._handleDisconnect();
      });

      this._socket.on('error', (err) => {
        if (!this._connected) {
          // Falha na conexão inicial — rejeitar a promise e agendar reconexão
          console.warn(`[PipeClient] Falha ao conectar: ${err.message}`);
          reject(err);
        } else {
          console.error(`[PipeClient] Erro de socket: ${err.message}`);
        }
        this._handleDisconnect();
      });
    });
  }

  /** Encerra a conexão permanentemente (sem reconexão). */
  destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._rejectAllPending('PipeClient destruído.');
    this._socket?.destroy();
    this._socket = null;
    this._connected = false;
  }

  // ── Comunicação ──────────────────────────────────────────────────────────

  /**
   * Envia um comando ao backend e retorna uma Promise com a resposta.
   * @param {string} command - Ex: 'ping', 'metrics:get'
   * @param {object} [payload={}] - Payload opcional
   * @param {number} [timeoutMs=10000] - Timeout em ms
   * @returns {Promise<object>} Dados da resposta
   */
  invoke(command, payload = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this._socket) {
        reject(new Error('PipeClient não está conectado.'));
        return;
      }

      const id = randomUUID();
      const message = JSON.stringify({ id, command, payload }) + '\n';

      // Registrar promise pendente com timeout
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Timeout no comando '${command}' (${timeoutMs}ms).`));
        }
      }, timeoutMs);

      this._pending.set(id, { resolve, reject, timer });

      this._socket.write(message, 'utf8', (err) => {
        if (err) {
          clearTimeout(timer);
          this._pending.delete(id);
          reject(err);
        }
      });
    });
  }

  // ── Handlers Internos ────────────────────────────────────────────────────

  /**
   * Processa dados recebidos do socket (pode chegar fragmentado).
   * Acumula em buffer e processa linha por linha.
   */
  _handleData(chunk) {
    this._buffer += chunk.toString('utf8');
    const lines = this._buffer.split('\n');

    // Última linha pode estar incompleta — manter no buffer
    this._buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this._processMessage(trimmed);
    }
  }

  /** Processa uma mensagem JSON completa recebida do backend. */
  _processMessage(json) {
    let message;
    try {
      message = JSON.parse(json);
    } catch {
      console.error('[PipeClient] Mensagem JSON inválida:', json);
      return;
    }

    // ── Evento Push (sem ID) ──────────────────────────────────────────────
    if (message.event) {
      this.emit(`push:${message.event}`, message.data);
      return;
    }

    // ── Resposta de Comando (com ID) ──────────────────────────────────────
    if (message.id && this._pending.has(message.id)) {
      const { resolve, reject, timer } = this._pending.get(message.id);
      clearTimeout(timer);
      this._pending.delete(message.id);

      if (message.success) {
        resolve(message.data);
      } else {
        reject(new Error(message.error || 'Erro desconhecido no backend.'));
      }
    }
  }

  /** Trata desconexão: rejeita pendentes e agenda reconexão. */
  _handleDisconnect() {
    if (!this._connected && !this._socket) return; // Já tratado

    this._connected = false;
    this._socket = null;
    this._buffer = '';
    this.emit('disconnected');

    // Rejeitar todas as promises pendentes
    this._rejectAllPending('Conexão com o backend perdida.');

    if (!this._destroyed) {
      this._scheduleReconnect();
    }
  }

  /** Rejeita todas as promises pendentes com uma mensagem de erro. */
  _rejectAllPending(reason) {
    for (const { reject, timer } of this._pending.values()) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    this._pending.clear();
  }

  /** Agenda uma tentativa de reconexão com backoff exponencial. */
  _scheduleReconnect() {
    console.log(`[PipeClient] Reconectando em ${this._reconnectDelay}ms...`);
    this._reconnectTimer = setTimeout(async () => {
      if (this._destroyed) return;
      try {
        await this.connect();
      } catch {
        // Dobrar o delay (backoff exponencial), limitado ao máximo
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, MAX_RECONNECT_DELAY);
        this._scheduleReconnect();
      }
    }, this._reconnectDelay);
  }

  /** Retorna true se o cliente está conectado. */
  get isConnected() {
    return this._connected;
  }
}

// Exportar instância singleton para uso no Main Process
module.exports = new PipeClient();
