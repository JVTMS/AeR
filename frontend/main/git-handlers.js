/**
 * AeR — Git IPC Handlers (Main Process) — v1.0.0
 *
 * Executa operações Git via child_process no Main Process do Electron.
 * Comunicação com o Renderer via IPC (ipcMain.handle).
 *
 * Todas as operações retornam: { ok: boolean, data?: any, error?: string }
 *
 * SEGURANÇA:
 *  - Parâmetros são sanitizados antes de passar ao shell
 *  - Operações destrutivas requerem confirmação no Renderer (não aqui)
 *  - O token Git é lido de variável de ambiente, nunca hardcoded no código
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs   = require('fs');

// ─── Caminho raiz do repositório ───────────────────────────────────────────
// De frontend/main/ sobem 2 níveis para chegar em AeR/
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Verifica se a pasta é um repositório git válido
function isGitRepo() {
  return fs.existsSync(path.join(REPO_ROOT, '.git'));
}

// ─── Utilitário: executa git com promessa ───────────────────────────────────
function runGit(args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };

    // Autenticação HTTPS via credencial embutida (lida de variável de ambiente)
    // O token NÃO é hardcoded — deve ser configurado via git config credential.helper
    execFile('git', args, {
      cwd: REPO_ROOT,
      env,
      timeout: 30_000,       // 30s timeout para operações de rede
      maxBuffer: 2 * 1024 * 1024, // 2MB de buffer
      ...options,
    }, (err, stdout, stderr) => {
      if (err && !options.allowNonZero) {
        reject(new Error(stderr?.trim() || err.message));
      } else {
        resolve({ stdout: stdout?.trim() || '', stderr: stderr?.trim() || '' });
      }
    });
  });
}

// ─── Sanitização básica ─────────────────────────────────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return '';
  // Remove caracteres perigosos para uso em args do shell
  return str.replace(/[;&|`$(){}[\]<>\\]/g, '').trim().slice(0, 200);
}

function sanitizeBranch(name) {
  // Nomes de branch: letras, números, -, _, /
  return (name || '').replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 100);
}

// ─── Parsers de saída Git ───────────────────────────────────────────────────

function parseStatus(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  const modified  = [];
  const added     = [];
  const deleted   = [];
  const untracked = [];
  const staged    = [];

  for (const line of lines) {
    if (line.length < 3) continue;
    const xy   = line.slice(0, 2);
    const file = line.slice(3).trim();
    const x    = xy[0]; // staged
    const y    = xy[1]; // unstaged

    if (x === '?' && y === '?') { untracked.push(file); continue; }
    if (x === 'A') staged.push(file);
    if (x === 'M') staged.push(file);
    if (y === 'M') modified.push(file);
    if (y === 'D' || x === 'D') deleted.push(file);
    if (x === 'A' && y === ' ') added.push(file);
  }

  return { modified, added, deleted, untracked, staged };
}

function parseLog(stdout) {
  if (!stdout) return [];
  return stdout.split('\n---COMMIT---\n').filter(Boolean).map(block => {
    const [hash, author, date, ...msgParts] = block.split('\n');
    return {
      hash:    hash?.trim()    || '',
      author:  author?.trim()  || '',
      date:    date?.trim()    || '',
      message: msgParts.join(' ').trim() || '',
    };
  });
}

function parseBranches(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  const local  = [];
  const remote = [];
  let current  = '';

  for (const line of lines) {
    const clean = line.trim();
    if (clean.startsWith('remotes/')) {
      if (!clean.endsWith('HEAD')) remote.push(clean.replace('remotes/', ''));
    } else {
      const name = clean.replace(/^\*\s*/, '');
      local.push(name);
      if (clean.startsWith('*')) current = name;
    }
  }

  return { current, local, remote };
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleStatus() {
  if (!isGitRepo()) {
    return { ok: false, error: 'Repositório Git não encontrado em: ' + REPO_ROOT };
  }

  try {
    // Status porcelain v1
    const { stdout: statusOut } = await runGit(['status', '--porcelain', '--short']);
    // Branch atual
    const { stdout: branchOut } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    // Último commit
    let lastCommit = null;
    try {
      const { stdout: logOut } = await runGit([
        'log', '-1', '--format=%H%n%an%n%ai%n%s'
      ]);
      const parts = logOut.split('\n');
      if (parts.length >= 4) {
        lastCommit = { hash: parts[0], author: parts[1], date: parts[2], message: parts[3] };
      }
    } catch { /* sem commits ainda */ }

    // Ahead/behind do remote
    let ahead = 0, behind = 0;
    try {
      const { stdout: abOut } = await runGit(
        ['rev-list', '--left-right', '--count', '@{u}...HEAD'],
        { allowNonZero: true }
      );
      const [b, a] = (abOut || '0\t0').split('\t').map(Number);
      ahead = a || 0; behind = b || 0;
    } catch { /* sem upstream */ }

    const parsed = parseStatus(statusOut);

    return {
      ok: true,
      data: {
        branch: branchOut || 'main',
        ...parsed,
        ahead,
        behind,
        lastCommit,
        hasConflicts: false,
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handleRemoteInfo() {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  try {
    const { stdout } = await runGit(['remote', '-v']);
    const lines = stdout.split('\n').filter(l => l.includes('(fetch)'));
    if (!lines.length) return { ok: true, data: { name: 'AeR', url: '' } };
    const parts = lines[0].split(/\s+/);
    return { ok: true, data: { name: parts[0] || 'origin', url: parts[1] || '' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handleLog(_e, { limit = 20 } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  try {
    const { stdout } = await runGit([
      'log',
      `-${Math.min(limit, 50)}`,
      '--format=%H%n%an%n%ai%n%s%n---COMMIT---',
    ]);
    return { ok: true, data: parseLog(stdout) };
  } catch (err) {
    // Sem commits ainda
    return { ok: true, data: [] };
  }
}

async function handleBranches() {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  try {
    const { stdout } = await runGit(['branch', '-a', '--format=%(refname:short)']);
    // Obtém branch atual separadamente
    const { stdout: current } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const lines = stdout.split('\n').filter(Boolean);
    const local = lines.filter(l => !l.startsWith('origin/'));
    const remote = lines.filter(l => l.startsWith('origin/'));
    return { ok: true, data: { current: current.trim(), local, remote } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handleDiff(_e, { file } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  try {
    const args = ['diff', 'HEAD'];
    if (file) args.push('--', sanitize(file));
    const { stdout } = await runGit(args, { allowNonZero: true });
    return { ok: true, data: stdout || '(sem alterações)' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handleCommit(_e, { message, files = [] } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  if (!message?.trim()) return { ok: false, error: 'Mensagem não pode ser vazia.' };

  try {
    // Adicionar arquivos
    if (files.length > 0) {
      const safeFiles = files.map(f => sanitize(f)).filter(Boolean);
      await runGit(['add', '--', ...safeFiles]);
    } else {
      await runGit(['add', '-A']);
    }

    // Verificar se há algo para commitar
    const { stdout: statusOut } = await runGit(['status', '--porcelain']);
    if (!statusOut.trim()) {
      return { ok: false, error: 'Nenhuma alteração para commitar.' };
    }

    await runGit(['commit', '-m', sanitize(message)]);
    return { ok: true, data: 'Commit realizado com sucesso.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handlePush(_e, { branch } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  try {
    const args = ['push', 'origin'];
    if (branch) args.push(sanitizeBranch(branch));
    else args.push('HEAD');
    await runGit(args);
    return { ok: true, data: 'Push realizado com sucesso.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handlePull(_e, { branch } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  try {
    const args = ['pull', 'origin'];
    if (branch) args.push(sanitizeBranch(branch));
    await runGit(args);
    return { ok: true, data: 'Pull realizado com sucesso.' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handleCreateBranch(_e, { name } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  const safe = sanitizeBranch(name);
  if (!safe) return { ok: false, error: 'Nome de branch inválido.' };
  try {
    await runGit(['checkout', '-b', safe]);
    return { ok: true, data: `Branch "${safe}" criada.` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function handleCheckout(_e, { name } = {}) {
  if (!isGitRepo()) return { ok: false, error: 'Repositório não encontrado.' };
  const safe = sanitizeBranch(name);
  if (!safe) return { ok: false, error: 'Nome de branch inválido.' };
  try {
    await runGit(['checkout', safe]);
    return { ok: true, data: `Trocado para "${safe}".` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Dispatcher central ─────────────────────────────────────────────────────
const COMMAND_MAP = {
  'status':        handleStatus,
  'remote-info':   handleRemoteInfo,
  'log':           handleLog,
  'branches':      handleBranches,
  'diff':          handleDiff,
  'commit':        handleCommit,
  'push':          handlePush,
  'pull':          handlePull,
  'create-branch': handleCreateBranch,
  'checkout':      handleCheckout,
};

// ─── Registro no ipcMain ────────────────────────────────────────────────────
function register(ipcMain) {
  ipcMain.handle('git:invoke', async (event, { command, params } = {}) => {
    const handler = COMMAND_MAP[command];
    if (!handler) {
      return { ok: false, error: `Comando git desconhecido: "${command}"` };
    }
    try {
      return await handler(event, params || {});
    } catch (err) {
      console.error('[Git Handler] Erro inesperado:', err);
      return { ok: false, error: err.message };
    }
  });

  console.log('[AeR Git] Handlers IPC registrados para:', Object.keys(COMMAND_MAP).join(', '));
}

module.exports = { register };
