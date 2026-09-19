/**
 * AeR — Terminal Embutido (v1.0)
 * Executa comandos cmd.exe via IPC com histórico e saída colorida.
 */
import { Logger } from '../utils/logger.js';
import { invoke } from '../api/pipe-client.js';

const MODULE = 'Terminal';
const HISTORY_KEY = 'aer:terminal:history';
const MAX_HISTORY = 100;

let cmdHistory = [];
let historyPos = -1;

export function mount(container) {
  Logger.info(MODULE, 'Montando Terminal...');
  injectStyles();
  container.innerHTML = `
    <div class="dash-root terminal-page">
      <div class="dash-header">
        <div><h1 class="dash-title">Terminal</h1><p class="dash-subtitle">Execute comandos do sistema (via cmd.exe · timeout 30s)</p></div>
        <button id="term-clear" class="btn-term-clear">✕ Limpar</button>
      </div>
      <div id="term-output" class="term-output">
        <div class="term-welcome">
          <span class="term-accent">AeR</span> Terminal — Digite um comando abaixo e pressione <kbd>Enter</kbd><br>
          Exemplos: <span class="term-eg">ipconfig</span> · <span class="term-eg">systeminfo</span> · <span class="term-eg">netstat -an</span> · <span class="term-eg">tasklist</span>
        </div>
      </div>
      <div class="term-input-row">
        <span class="term-prompt">C:\\&gt;</span>
        <input id="term-input" class="term-input" type="text" placeholder="Digite o comando..." autocomplete="off" spellcheck="false">
        <button id="term-run" class="btn-term-run">▶ Executar</button>
      </div>
    </div>`;

  cmdHistory = loadHistory();

  const input = container.querySelector('#term-input');
  const runBtn = container.querySelector('#term-run');

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { runCommand(); return; }
    if (e.key === 'ArrowUp') {
      historyPos = Math.min(historyPos + 1, cmdHistory.length - 1);
      input.value = cmdHistory[historyPos] ?? '';
      e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
      historyPos = Math.max(historyPos - 1, -1);
      input.value = historyPos >= 0 ? cmdHistory[historyPos] : '';
      e.preventDefault();
    }
  });

  runBtn.addEventListener('click', runCommand);
  container.querySelector('#term-clear').addEventListener('click', clearOutput);

  input.focus();
}

export function unmount() {}

async function runCommand() {
  const input  = document.getElementById('term-input');
  const cmd    = input?.value?.trim();
  if (!cmd) return;

  appendLine(`<span class="term-prompt-line">C:\\&gt; ${escHtml(cmd)}</span>`);
  historyPos = -1;
  saveHistory(cmd);
  input.value = '';
  input.disabled = true;
  document.getElementById('term-run').disabled = true;

  appendLine(`<span class="term-running">⏳ Executando...</span>`);

  try {
    const r = await invoke('terminal:exec', { command: cmd });
    removeLastRunning();

    if (r.stdout) appendLine(`<pre class="term-stdout">${escHtml(r.stdout)}</pre>`);
    if (r.stderr) appendLine(`<pre class="term-stderr">${escHtml(r.stderr)}</pre>`);
    if (!r.stdout && !r.stderr) appendLine(`<span class="term-muted">(sem saída)</span>`);

    const exitColor = r.exitCode === 0 ? 'term-exit-ok' : 'term-exit-err';
    appendLine(`<span class="${exitColor}">✓ Saiu com código ${r.exitCode}</span>`);
  } catch (e) {
    removeLastRunning();
    appendLine(`<span class="term-stderr">⚠️ Erro: ${escHtml(e?.message ?? 'Falha ao executar')}</span>`);
  } finally {
    input.disabled = false;
    document.getElementById('term-run').disabled = false;
    input.focus();
    scrollToBottom();
  }
}

function appendLine(html) {
  const output = document.getElementById('term-output');
  if (!output) return;
  const div = document.createElement('div');
  div.className = 'term-line';
  div.innerHTML = html;
  output.appendChild(div);
  scrollToBottom();
}

function removeLastRunning() {
  document.querySelector('.term-running')?.closest('.term-line')?.remove();
}

function clearOutput() {
  const output = document.getElementById('term-output');
  if (output) output.innerHTML = '';
}

function scrollToBottom() {
  const output = document.getElementById('term-output');
  if (output) output.scrollTop = output.scrollHeight;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function saveHistory(cmd) {
  cmdHistory = [cmd, ...cmdHistory.filter(c => c !== cmd)].slice(0, MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(cmdHistory)); } catch { }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function injectStyles() {
  if (document.getElementById('terminal-styles')) return;
  const s = document.createElement('style');
  s.id = 'terminal-styles';
  s.textContent = `
    .terminal-page { display:flex; flex-direction:column; gap:0; height:100%; }
    .btn-term-clear { background:transparent; border:1px solid var(--color-border-subtle); color:var(--color-text-muted); padding:5px 12px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-xs); transition:var(--transition-fast); }
    .btn-term-clear:hover { border-color:#e74c3c; color:#e74c3c; }
    .term-output { flex:1; background:var(--color-bg-surface-1); border:1px solid var(--color-border-subtle); border-radius:var(--radius-lg) var(--radius-lg) 0 0; padding:var(--space-4); font-family:var(--font-mono); font-size:13px; overflow-y:auto; min-height:200px; }
    .term-input-row { display:flex; align-items:center; gap:var(--space-3); background:var(--color-bg-surface-2); border:1px solid var(--color-border-subtle); border-top:none; border-radius:0 0 var(--radius-lg) var(--radius-lg); padding:var(--space-3) var(--space-4); }
    .term-prompt { color:var(--color-accent-primary); font-family:var(--font-mono); font-size:13px; font-weight:700; white-space:nowrap; }
    .term-input { flex:1; background:transparent; border:none; outline:none; color:var(--color-text-primary); font-family:var(--font-mono); font-size:13px; }
    .btn-term-run { background:var(--color-accent-primary); border:none; color:#000; font-weight:700; padding:6px 16px; border-radius:var(--radius-sm); cursor:pointer; font-size:var(--text-xs); transition:var(--transition-fast); white-space:nowrap; }
    .btn-term-run:disabled { opacity:.5; cursor:not-allowed; }
    .term-line { margin-bottom:4px; }
    .term-prompt-line { color:var(--color-accent-primary); font-weight:600; }
    .term-stdout { margin:2px 0; color:var(--color-text-secondary); white-space:pre-wrap; word-break:break-word; }
    .term-stderr { margin:2px 0; color:#e74c3c; white-space:pre-wrap; word-break:break-word; }
    .term-exit-ok { color:#2ecc71; font-size:11px; }
    .term-exit-err { color:#e74c3c; font-size:11px; }
    .term-running { color:#f1c40f; font-style:italic; }
    .term-muted { color:var(--color-text-muted); font-style:italic; }
    .term-accent { color:var(--color-accent-primary); font-weight:700; }
    .term-eg { color:#3498db; background:rgba(52,152,219,.1); padding:1px 5px; border-radius:3px; }
    .term-welcome { color:var(--color-text-muted); font-size:12px; margin-bottom:var(--space-3); line-height:1.6; }
    kbd { background:var(--color-bg-surface-3); border:1px solid var(--color-border-subtle); border-radius:3px; padding:1px 5px; font-size:11px; color:var(--color-text-secondary); }
  `;
  document.head.appendChild(s);
}
