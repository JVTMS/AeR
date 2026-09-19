/**
 * AeR — Página GitHub / Versionamento (v1.0.0)
 *
 * Painel visual para Git + GitHub integrado ao app Electron.
 * Mostra status, histórico, branches e permite executar operações git.
 *
 * Segurança: todas as operações destrutivas pedem confirmação antes de executar.
 */

import {
  getStatus, getRemoteInfo, getLog, getBranches,
  getDiff, commit, push, pull, createBranch, checkoutBranch
} from '../api/git-client.js';
import { Logger } from '../utils/logger.js';

const MODULE = 'GitHub';

// ─── Estado local ──────────────────────────────────────────────────────────
let _container = null;
let _refreshTimer = null;
let _currentStatus = null;

// ─── Ícones SVG inline ─────────────────────────────────────────────────────
const ICONS = {
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  commit:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>`,
  push:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  pull:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  branch:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  diff:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  external:`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
};

// ─── Helpers de status ──────────────────────────────────────────────────────
function getSyncIndicator(status) {
  if (!status) return { dot: '⚪', label: 'Carregando...', cls: 'neutral' };
  if (status.error) return { dot: '🔴', label: 'Erro', cls: 'error' };
  if (status.hasConflicts) return { dot: '🔴', label: 'Conflito', cls: 'error' };
  if (status.modified?.length || status.added?.length || status.deleted?.length) {
    return { dot: '🟡', label: 'Alterações pendentes', cls: 'warning' };
  }
  if (!status.remoteUrl) return { dot: '⚪', label: 'Sem remote', cls: 'neutral' };
  return { dot: '🟢', label: 'Sincronizado', cls: 'success' };
}

function getFileIcon(type) {
  switch (type) {
    case 'M': return '<span style="color:#f0c040">M</span>';
    case 'A': return '<span style="color:#4caf50">A</span>';
    case 'D': return '<span style="color:#f44336">D</span>';
    case '?': return '<span style="color:#64b5f6">N</span>';
    default:  return '<span style="color:#aaa">?</span>';
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff/60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h atrás`;
  return `${Math.floor(diff/86400)}d atrás`;
}

// ─── Toast de notificação ───────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = _container;
  if (!c) return;
  const t = document.createElement('div');
  const colors = { success: '#4caf50', error: '#f44336', info: '#64b5f6', warning: '#f0c040' };
  t.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:rgba(20,20,30,0.97); border:1px solid ${colors[type]||colors.info};
    border-radius:8px; padding:12px 18px; font-size:13px; color:#eee;
    box-shadow:0 4px 20px rgba(0,0,0,0.5); max-width:360px;
    animation: fadeInUp 0.2s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ─── Dialog de confirmação ──────────────────────────────────────────────────
function confirmDialog(title, message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:9998; background:rgba(0,0,0,0.6);
      display:flex; align-items:center; justify-content:center;
    `;
    overlay.innerHTML = `
      <div style="
        background:rgba(18,18,28,0.98); border:1px solid rgba(255,255,255,0.1);
        border-radius:12px; padding:28px 32px; max-width:420px; width:90%;
        box-shadow:0 8px 40px rgba(0,0,0,0.6);
      ">
        <div style="font-size:16px; font-weight:600; color:#f0f0f0; margin-bottom:10px;">${title}</div>
        <div style="font-size:13px; color:#aaa; margin-bottom:24px; line-height:1.6;">${message}</div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="dlg-cancel" style="
            padding:8px 20px; border-radius:6px; border:1px solid rgba(255,255,255,0.15);
            background:transparent; color:#aaa; cursor:pointer; font-size:13px;
          ">Cancelar</button>
          <button id="dlg-confirm" style="
            padding:8px 20px; border-radius:6px; border:none;
            background:linear-gradient(135deg,#00d4ff,#0080ff); color:#fff;
            cursor:pointer; font-size:13px; font-weight:500;
          ">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#dlg-cancel').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#dlg-confirm').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// ─── Geração de HTML ────────────────────────────────────────────────────────

function renderRepository(status, remote) {
  const sync = getSyncIndicator(status);
  const repoName  = remote?.name  || 'AeR';
  const repoUrl   = remote?.url   || '—';
  const branch    = status?.branch || '—';
  const lastCommit = status?.lastCommit;

  return `
    <section class="git-card">
      <div class="git-card__header">
        <span class="git-card__title">Repositório</span>
        <span class="git-status-badge git-status-badge--${sync.cls}">${sync.dot} ${sync.label}</span>
      </div>
      <div class="git-info-grid">
        <div class="git-info-row">
          <span class="git-info-label">Nome</span>
          <span class="git-info-value">${repoName}</span>
        </div>
        <div class="git-info-row">
          <span class="git-info-label">Branch</span>
          <span class="git-info-value git-branch-badge">${ICONS.branch} ${branch}</span>
        </div>
        <div class="git-info-row">
          <span class="git-info-label">Remote</span>
          <span class="git-info-value" style="word-break:break-all; font-size:11px; color:#64b5f6;">
            ${repoUrl !== '—' ? `<a href="#" class="git-link" data-url="${repoUrl}">${repoUrl} ${ICONS.external}</a>` : '—'}
          </span>
        </div>
        ${lastCommit ? `
        <div class="git-info-row">
          <span class="git-info-label">Último commit</span>
          <span class="git-info-value" style="font-size:11px;">
            <span class="git-hash">${lastCommit.hash?.slice(0,7)}</span>
            ${lastCommit.message || ''}
          </span>
        </div>` : ''}
      </div>
      ${repoUrl !== '—' ? `
      <div style="margin-top:12px;">
        <button class="git-btn git-btn--ghost git-btn--sm" data-action="open-github">
          ${ICONS.external} Abrir no GitHub
        </button>
      </div>` : ''}
    </section>
  `;
}

function renderChanges(status) {
  const modified = status?.modified || [];
  const added    = status?.added    || [];
  const deleted  = status?.deleted  || [];
  const untracked = status?.untracked || [];
  const total = modified.length + added.length + deleted.length + untracked.length;

  const files = [
    ...modified.map(f  => ({ type: 'M', name: f })),
    ...added.map(f     => ({ type: 'A', name: f })),
    ...deleted.map(f   => ({ type: 'D', name: f })),
    ...untracked.map(f => ({ type: '?', name: f })),
  ];

  return `
    <section class="git-card">
      <div class="git-card__header">
        <span class="git-card__title">Alterações</span>
        ${total > 0 ? `<span class="git-badge">${total}</span>` : '<span class="git-badge git-badge--muted">0</span>'}
      </div>

      ${total === 0 ? `
        <div class="git-empty">⚪ Nenhuma alteração local</div>
      ` : `
        <div class="git-file-list" id="file-list">
          ${files.map(f => `
            <div class="git-file-row">
              <span class="git-file-type">${getFileIcon(f.type)}</span>
              <span class="git-file-name" title="${f.name}">${f.name}</span>
              <button class="git-btn git-btn--ghost git-btn--xs" data-action="diff-file" data-file="${f.name}" title="Ver diff">
                ${ICONS.diff}
              </button>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
          <input
            type="text"
            id="commit-message"
            class="git-input"
            placeholder="Mensagem do commit..."
            maxlength="100"
          />
          <div style="display:flex; gap:8px;">
            <button class="git-btn git-btn--primary git-btn--sm" data-action="commit" style="flex:1;">
              ${ICONS.commit} Commit
            </button>
          </div>
        </div>
      `}
    </section>
  `;
}

function renderSync(status) {
  return `
    <section class="git-card">
      <div class="git-card__header">
        <span class="git-card__title">Sincronização</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="git-btn git-btn--primary git-btn--sm" data-action="push">
          ${ICONS.push} Push
        </button>
        <button class="git-btn git-btn--secondary git-btn--sm" data-action="pull">
          ${ICONS.pull} Pull
        </button>
        <button class="git-btn git-btn--ghost git-btn--sm" data-action="refresh">
          ${ICONS.refresh} Atualizar Status
        </button>
      </div>
      ${status?.ahead > 0 ? `<div class="git-info-hint" style="margin-top:10px;">⬆ ${status.ahead} commit(s) aguardando push</div>` : ''}
      ${status?.behind > 0 ? `<div class="git-info-hint" style="margin-top:10px;">⬇ ${status.behind} commit(s) para pull</div>` : ''}
    </section>
  `;
}

function renderHistory(log) {
  const commits = log || [];
  return `
    <section class="git-card">
      <div class="git-card__header">
        <span class="git-card__title">Histórico</span>
        <span class="git-badge git-badge--muted">${commits.length}</span>
      </div>
      ${commits.length === 0 ? `
        <div class="git-empty">Nenhum commit ainda</div>
      ` : `
        <div class="git-commit-list">
          ${commits.map(c => `
            <div class="git-commit-row">
              <div class="git-commit-main">
                <span class="git-hash">${(c.hash||'').slice(0,7)}</span>
                <span class="git-commit-msg">${c.message || ''}</span>
              </div>
              <div class="git-commit-meta">
                <span class="git-commit-author">${c.author || ''}</span>
                <span class="git-commit-time">${timeAgo(c.date)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </section>
  `;
}

function renderBranches(data) {
  const current  = data?.current || '—';
  const locals   = data?.local   || [];
  const remotes  = data?.remote  || [];

  return `
    <section class="git-card">
      <div class="git-card__header">
        <span class="git-card__title">Branches</span>
      </div>

      <div class="git-info-row" style="margin-bottom:12px;">
        <span class="git-info-label">Atual</span>
        <span class="git-branch-badge">${ICONS.branch} ${current}</span>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <input type="text" id="new-branch-name" class="git-input" placeholder="Nova branch..." style="flex:1;" />
        <button class="git-btn git-btn--secondary git-btn--sm" data-action="create-branch">
          ${ICONS.branch} Criar
        </button>
      </div>

      ${locals.length > 1 ? `
        <div class="git-card__subtitle" style="margin-bottom:6px;">Locais</div>
        <div class="git-branch-list">
          ${locals.map(b => `
            <div class="git-branch-row ${b === current ? 'git-branch-row--active' : ''}">
              <span>${b}</span>
              ${b !== current ? `
                <button class="git-btn git-btn--ghost git-btn--xs" data-action="checkout" data-branch="${b}">
                  Trocar
                </button>` : '<span class="git-current-label">atual</span>'}
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${remotes.length > 0 ? `
        <div class="git-card__subtitle" style="margin-top:10px; margin-bottom:6px;">Remotas</div>
        <div class="git-branch-list">
          ${remotes.map(b => `<div class="git-branch-row"><span style="color:#888;">${b}</span></div>`).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderDiffPanel(diff) {
  if (!diff) return '';
  return `
    <section class="git-card" id="diff-panel">
      <div class="git-card__header">
        <span class="git-card__title">Diff</span>
        <button class="git-btn git-btn--ghost git-btn--xs" data-action="close-diff">✕ Fechar</button>
      </div>
      <pre class="git-diff-output">${escapeHtml(diff)}</pre>
    </section>
  `;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Estilos CSS da página ──────────────────────────────────────────────────
const STYLES = `
<style id="git-page-styles">
.git-page { display:flex; flex-direction:column; gap:0; padding:24px; max-width:900px; }
.git-page-header { margin-bottom:20px; }
.git-page-title { font-size:20px; font-weight:600; color:#f0f0f0; display:flex; align-items:center; gap:8px; }
.git-page-sub { font-size:12px; color:#666; margin-top:4px; }

.git-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.git-grid--full { grid-column:1/-1; }

.git-card {
  background:rgba(255,255,255,0.03);
  border:1px solid rgba(255,255,255,0.07);
  border-radius:10px; padding:16px;
}
.git-card__header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.git-card__title { font-size:13px; font-weight:600; color:#c0c0d0; text-transform:uppercase; letter-spacing:0.06em; }
.git-card__subtitle { font-size:11px; color:#666; text-transform:uppercase; letter-spacing:0.05em; }

.git-status-badge { font-size:12px; padding:3px 8px; border-radius:20px; font-weight:500; }
.git-status-badge--success { background:rgba(76,175,80,0.15); color:#81c784; }
.git-status-badge--warning { background:rgba(240,192,64,0.15); color:#f0c040; }
.git-status-badge--error   { background:rgba(244,67,54,0.15); color:#ef9a9a; }
.git-status-badge--neutral { background:rgba(255,255,255,0.06); color:#888; }

.git-badge { background:rgba(100,181,246,0.2); color:#64b5f6; border-radius:20px; padding:2px 8px; font-size:11px; font-weight:600; }
.git-badge--muted { background:rgba(255,255,255,0.06); color:#666; }

.git-info-grid { display:flex; flex-direction:column; gap:6px; }
.git-info-row { display:flex; align-items:center; gap:8px; }
.git-info-label { font-size:11px; color:#666; width:90px; flex-shrink:0; }
.git-info-value { font-size:12px; color:#c0c0d0; flex:1; }
.git-info-hint { font-size:12px; color:#f0c040; }

.git-branch-badge { display:inline-flex; align-items:center; gap:4px; background:rgba(100,181,246,0.1); color:#64b5f6; border-radius:4px; padding:2px 8px; font-size:12px; }

.git-hash { font-family:'JetBrains Mono', monospace; font-size:11px; color:#00d4ff; background:rgba(0,212,255,0.08); padding:1px 5px; border-radius:3px; flex-shrink:0; }

.git-empty { text-align:center; color:#555; font-size:13px; padding:16px 0; }

.git-file-list { display:flex; flex-direction:column; gap:2px; max-height:220px; overflow-y:auto; margin-bottom:4px; }
.git-file-row { display:flex; align-items:center; gap:8px; padding:5px 6px; border-radius:5px; }
.git-file-row:hover { background:rgba(255,255,255,0.04); }
.git-file-type { font-family:monospace; font-size:12px; font-weight:700; width:14px; flex-shrink:0; }
.git-file-name { flex:1; font-size:12px; color:#c0c0d0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:'JetBrains Mono', monospace; }

.git-commit-list { display:flex; flex-direction:column; gap:4px; max-height:280px; overflow-y:auto; }
.git-commit-row { padding:8px 6px; border-radius:6px; border-bottom:1px solid rgba(255,255,255,0.04); }
.git-commit-row:hover { background:rgba(255,255,255,0.03); }
.git-commit-main { display:flex; align-items:center; gap:8px; margin-bottom:3px; }
.git-commit-msg { font-size:12px; color:#c0c0d0; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.git-commit-meta { display:flex; gap:12px; padding-left:50px; }
.git-commit-author { font-size:11px; color:#666; }
.git-commit-time { font-size:11px; color:#555; }

.git-branch-list { display:flex; flex-direction:column; gap:2px; }
.git-branch-row { display:flex; align-items:center; justify-content:space-between; padding:5px 6px; border-radius:5px; font-size:12px; color:#c0c0d0; }
.git-branch-row:hover { background:rgba(255,255,255,0.04); }
.git-branch-row--active { background:rgba(100,181,246,0.08); color:#64b5f6; }
.git-current-label { font-size:10px; color:#4caf50; }

.git-input {
  width:100%; padding:8px 10px; border-radius:6px;
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
  color:#e0e0e0; font-size:13px; outline:none; box-sizing:border-box;
  transition:border-color 0.15s;
}
.git-input:focus { border-color:rgba(100,181,246,0.5); }

.git-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:8px 14px; border-radius:6px; border:none;
  cursor:pointer; font-size:13px; font-weight:500; transition:all 0.15s;
  white-space:nowrap;
}
.git-btn--primary { background:linear-gradient(135deg,#0080ff,#00d4ff); color:#fff; }
.git-btn--primary:hover { opacity:0.85; transform:translateY(-1px); }
.git-btn--secondary { background:rgba(100,181,246,0.15); color:#64b5f6; border:1px solid rgba(100,181,246,0.2); }
.git-btn--secondary:hover { background:rgba(100,181,246,0.25); }
.git-btn--ghost { background:transparent; color:#888; border:1px solid rgba(255,255,255,0.08); }
.git-btn--ghost:hover { background:rgba(255,255,255,0.06); color:#c0c0d0; }
.git-btn--danger { background:rgba(244,67,54,0.15); color:#ef9a9a; border:1px solid rgba(244,67,54,0.2); }
.git-btn--danger:hover { background:rgba(244,67,54,0.25); }
.git-btn--sm { padding:6px 12px; font-size:12px; }
.git-btn--xs { padding:3px 7px; font-size:11px; }
.git-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none !important; }

.git-link { color:#64b5f6; text-decoration:none; display:inline-flex; align-items:center; gap:4px; }
.git-link:hover { text-decoration:underline; }

.git-diff-output {
  background:rgba(0,0,0,0.3); border-radius:6px; padding:12px;
  font-family:'JetBrains Mono', monospace; font-size:11px; color:#c0c0d0;
  max-height:300px; overflow:auto; white-space:pre; line-height:1.5;
  border:1px solid rgba(255,255,255,0.06);
}

.git-loading { display:flex; align-items:center; gap:8px; color:#666; font-size:13px; padding:8px 0; }

@keyframes fadeInUp {
  from { opacity:0; transform:translateY(8px); }
  to   { opacity:1; transform:translateY(0); }
}
</style>
`;

// ─── Renderização principal ─────────────────────────────────────────────────
async function render(data = {}) {
  const { status, remote, log, branches, diff } = data;

  const html = `
    ${STYLES}
    <div class="git-page">
      <div class="git-page-header">
        <div class="git-page-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
            <path d="M6 9v6"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>
          </svg>
          GitHub / Versionamento
        </div>
        <div class="git-page-sub">Repositório: JVTMS/AeR · Branch: ${status?.branch || 'main'}</div>
      </div>

      ${diff ? `<div class="git-grid--full">${renderDiffPanel(diff)}</div>` : ''}

      <div class="git-grid">
        <div>${renderRepository(status, remote)}</div>
        <div>${renderSync(status)}</div>
        <div>${renderChanges(status)}</div>
        <div>${renderBranches(branches)}</div>
      </div>

      <div style="margin-top:16px;">
        ${renderHistory(log)}
      </div>
    </div>
  `;

  _container.innerHTML = html;
  bindEvents(data);
}

// ─── Event Binding ──────────────────────────────────────────────────────────
function bindEvents(currentData) {
  _container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      const action = el.dataset.action;
      await handleAction(action, el, currentData);
    });
  });

  _container.querySelectorAll('[data-url]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const url = el.dataset.url;
      if (url && url !== '—') window.aer?.openExternal(url);
    });
  });
}

async function handleAction(action, el, currentData) {
  const setLoading = (loading) => {
    if (el) el.disabled = loading;
  };

  switch (action) {
    case 'refresh':
      await loadAndRender();
      break;

    case 'open-github':
      window.aer?.openExternal('https://github.com/JVTMS/AeR');
      break;

    case 'commit': {
      const msg = _container.querySelector('#commit-message')?.value?.trim();
      if (!msg) { showToast('Digite uma mensagem para o commit.', 'warning'); return; }
      setLoading(true);
      const r = await commit(msg);
      if (r.ok) {
        showToast(`✅ Commit realizado: "${msg}"`, 'success');
        await loadAndRender();
      } else {
        showToast(`❌ Commit falhou: ${r.error}`, 'error');
        setLoading(false);
      }
      break;
    }

    case 'push': {
      const confirmed = await confirmDialog(
        'Confirmar Push',
        'Isso enviará todos os commits locais para o GitHub (remote: origin).\n\nDeseja continuar?'
      );
      if (!confirmed) return;
      setLoading(true);
      showToast('⏳ Enviando para o GitHub...', 'info');
      const r = await push();
      if (r.ok) {
        showToast('✅ Push realizado com sucesso!', 'success');
        await loadAndRender();
      } else {
        showToast(`❌ Push falhou: ${r.error}`, 'error');
        setLoading(false);
      }
      break;
    }

    case 'pull': {
      const confirmed = await confirmDialog(
        'Confirmar Pull',
        'Isso baixará as alterações do GitHub para o projeto local.\n\nSe houver conflitos, será necessário resolvê-los manualmente.'
      );
      if (!confirmed) return;
      setLoading(true);
      showToast('⏳ Baixando alterações do GitHub...', 'info');
      const r = await pull();
      if (r.ok) {
        showToast('✅ Pull realizado com sucesso!', 'success');
        await loadAndRender();
      } else {
        showToast(`❌ Pull falhou: ${r.error}`, 'error');
        setLoading(false);
      }
      break;
    }

    case 'diff-file': {
      const file = el.dataset.file;
      setLoading(true);
      const r = await getDiff(file);
      setLoading(false);
      if (r.ok) {
        await loadAndRender({ ...currentData, diff: r.data });
      } else {
        showToast(`❌ Diff falhou: ${r.error}`, 'error');
      }
      break;
    }

    case 'close-diff':
      await loadAndRender({ ...currentData, diff: null });
      break;

    case 'create-branch': {
      const name = _container.querySelector('#new-branch-name')?.value?.trim();
      if (!name) { showToast('Digite um nome para a branch.', 'warning'); return; }
      setLoading(true);
      const r = await createBranch(name);
      if (r.ok) {
        showToast(`✅ Branch "${name}" criada!`, 'success');
        await loadAndRender();
      } else {
        showToast(`❌ Erro ao criar branch: ${r.error}`, 'error');
        setLoading(false);
      }
      break;
    }

    case 'checkout': {
      const branch = el.dataset.branch;
      const confirmed = await confirmDialog(
        'Trocar de Branch',
        `Isso vai trocar para a branch <strong>${branch}</strong>.\n\nAlterações não commitadas podem ser perdidas.`
      );
      if (!confirmed) return;
      setLoading(true);
      const r = await checkoutBranch(branch);
      if (r.ok) {
        showToast(`✅ Trocado para: ${branch}`, 'success');
        await loadAndRender();
      } else {
        showToast(`❌ Checkout falhou: ${r.error}`, 'error');
        setLoading(false);
      }
      break;
    }
  }
}

// ─── Carregamento de dados ──────────────────────────────────────────────────
async function loadAndRender(extra = {}) {
  if (!_container) return;

  // Mostrar loading inicial
  if (!_currentStatus) {
    _container.innerHTML = `
      ${STYLES}
      <div class="git-page">
        <div class="git-page-header">
          <div class="git-page-title">GitHub / Versionamento</div>
        </div>
        <div class="git-loading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Carregando status do repositório...
        </div>
      </div>
      <style>#git-page-styles,@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
    `;
  }

  try {
    const [statusRes, remoteRes, logRes, branchesRes] = await Promise.all([
      getStatus(), getRemoteInfo(), getLog(15), getBranches()
    ]);

    _currentStatus = statusRes?.data;
    Logger.info(MODULE, 'Status carregado', _currentStatus);

    await render({
      status:   statusRes?.data   || {},
      remote:   remoteRes?.data   || {},
      log:      logRes?.data      || [],
      branches: branchesRes?.data || {},
      ...extra,
    });
  } catch (err) {
    Logger.error(MODULE, 'Erro ao carregar dados git:', err);
    _container.innerHTML = `
      ${STYLES}
      <div class="git-page">
        <div class="git-page-header">
          <div class="git-page-title">GitHub / Versionamento</div>
        </div>
        <div class="git-card" style="text-align:center; padding:32px;">
          <div style="font-size:32px; margin-bottom:12px;">🔴</div>
          <div style="color:#ef9a9a; margin-bottom:8px;">Erro ao conectar com o Git</div>
          <div style="color:#666; font-size:12px; margin-bottom:16px;">${err.message}</div>
          <button class="git-btn git-btn--secondary" data-action="refresh">${ICONS.refresh} Tentar novamente</button>
        </div>
      </div>
    `;
    _container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => loadAndRender());
  }
}

// ─── Ciclo de vida da página ────────────────────────────────────────────────
export async function mount(container) {
  _container = container;
  _currentStatus = null;
  Logger.info(MODULE, 'Página GitHub montada.');
  await loadAndRender();

  // Auto-refresh a cada 30 segundos
  _refreshTimer = setInterval(() => loadAndRender(), 30_000);
}

export function unmount() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
  _container = null;
  Logger.info(MODULE, 'Página GitHub desmontada.');
}
