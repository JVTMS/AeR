/**
 * AeR — Git Client (Renderer)
 * Módulo de comunicação com o Main Process para operações Git.
 * Todas as chamadas passam pelo contextBridge (window.gitAPI).
 */

const MODULE = 'GitClient';

/**
 * Executa um comando git via IPC.
 * @param {string} command - Nome do comando (ex: 'status', 'commit')
 * @param {object} [params] - Parâmetros do comando
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function gitInvoke(command, params = {}) {
  if (typeof window.gitAPI?.invoke !== 'function') {
    return { ok: false, error: 'Git API não disponível. Verifique o preload.' };
  }
  try {
    const result = await window.gitAPI.invoke(command, params);
    return result;
  } catch (err) {
    return { ok: false, error: err.message || 'Erro desconhecido' };
  }
}

/** Retorna status atual do repositório (arquivos modificados, branch, etc.) */
export async function getStatus() {
  return gitInvoke('status');
}

/** Retorna informações do remote (url, nome) */
export async function getRemoteInfo() {
  return gitInvoke('remote-info');
}

/** Retorna histórico de commits */
export async function getLog(limit = 20) {
  return gitInvoke('log', { limit });
}

/** Retorna lista de branches (locais e remotas) */
export async function getBranches() {
  return gitInvoke('branches');
}

/** Retorna diff de um arquivo específico */
export async function getDiff(file = null) {
  return gitInvoke('diff', { file });
}

/**
 * Faz commit com a mensagem fornecida.
 * @param {string} message - Mensagem do commit
 * @param {string[]} files - Arquivos a commitar ([] = todos)
 */
export async function commit(message, files = []) {
  if (!message?.trim()) {
    return { ok: false, error: 'Mensagem do commit não pode ser vazia.' };
  }
  return gitInvoke('commit', { message, files });
}

/** Faz push para o remote */
export async function push(branch = null) {
  return gitInvoke('push', { branch });
}

/** Faz pull do remote */
export async function pull(branch = null) {
  return gitInvoke('pull', { branch });
}

/**
 * Cria uma nova branch.
 * @param {string} name - Nome da branch
 */
export async function createBranch(name) {
  if (!name?.trim()) {
    return { ok: false, error: 'Nome da branch não pode ser vazio.' };
  }
  return gitInvoke('create-branch', { name });
}

/**
 * Troca para uma branch existente.
 * @param {string} name - Nome da branch
 */
export async function checkoutBranch(name) {
  return gitInvoke('checkout', { name });
}
