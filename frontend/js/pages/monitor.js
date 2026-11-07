/**
 * AeR — Monitor (v3.0) — Ultra Real-Time
 *
 * Melhorias v3.0:
 *  - Atualização a 500ms (push do backend 4× mais rápido)
 *  - requestAnimationFrame para rendering sem jank
 *  - Interpolação suave (lerp) entre valores
 *  - VRAM NVIDIA em tempo real
 *  - 9 métricas simultâneas
 *  - Indicador LIVE pulsante
 *  - Gráfico de área preenchida com glow neon
 */

import { Logger } from '../utils/logger.js';
import { on }     from '../api/pipe-client.js';

const MODULE     = 'Monitor';
const MAX_POINTS = 120; // 60s de histórico a 500ms

const SERIES = {
  cpu:   { label: 'CPU',      color: '#00ff88', unit: '%',    key: 'cpuPercent',         max: 100 },
  ram:   { label: 'RAM',      color: '#9b59b6', unit: '%',    key: 'ramPercent',          max: 100 },
  gpu:   { label: 'GPU',      color: '#e67e22', unit: '%',    key: 'gpuPercent',          max: 100 },
  vram:  { label: 'VRAM',     color: '#f39c12', unit: '%',    key: 'gpuVramPercent',      max: 100 },
  disk:  { label: 'Disco',    color: '#e74c3c', unit: '%',    key: 'diskActivityPercent', max: 100 },
  netDn: { label: 'Down',     color: '#3498db', unit: 'MB/s', key: 'netDownMBps',         max: null },
  netUp: { label: 'Up',       color: '#2ecc71', unit: 'MB/s', key: 'netUpMBps',           max: null },
};

const history    = Object.fromEntries(Object.keys(SERIES).map(k => [k, []]));
const displayVal = Object.fromEntries(Object.keys(SERIES).map(k => [k, 0]));
const targetVal  = Object.fromEntries(Object.keys(SERIES).map(k => [k, 0]));
let rafId = null;
let removeListener = null;

export function mount(container) {
  Logger.info(MODULE, 'Montando Monitor v3.0...');
  injectStyles();

  container.innerHTML = `
    <div class="dash-root monitor-page">
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Monitoramento <span class="mon-live-badge">● LIVE</span></h1>
          <p class="dash-subtitle">Atualizado a cada 500ms — 60s de histórico — renderização via requestAnimationFrame</p>
        </div>
        <div class="monitor-legend">
          ${Object.entries(SERIES).map(([k, s]) =>
            `<span class="mon-leg-dot" style="background:${s.color}"></span><span class="mon-leg-label">${s.label}</span>`
          ).join('')}
        </div>
      </div>

      <div class="monitor-grid">
        ${chartCard('cpu-ram',  'CPU & RAM',      ['cpu','ram'])}
        ${chartCard('gpu-vram', 'GPU & VRAM',     ['gpu','vram'])}
        ${chartCard('disk-net', 'Disco & Rede',   ['disk','netDn'])}
      </div>

      <div class="monitor-stats-grid">
        ${statCard('cpu',   'CPU',      '#00ff88')}
        ${statCard('ram',   'RAM',      '#9b59b6')}
        ${statCard('gpu',   'GPU',      '#e67e22')}
        ${statCard('vram',  'VRAM',     '#f39c12')}
        ${statCard('disk',  'Disco I/O','#e74c3c')}
        ${statCard('netDn', 'Download', '#3498db')}
        ${statCard('netUp', 'Upload',   '#2ecc71')}
        <div class="mon-extra-card">
          <div class="mon-extra-label" style="color:#f39c12">VRAM Usada</div>
          <div class="mon-extra-value" id="mon-vram-detail">—</div>
        </div>
        <div class="mon-extra-card">
          <div class="mon-extra-label" style="color:#00bfff">Processos</div>
          <div class="mon-extra-value" id="mon-proc-count">—</div>
        </div>
        <div class="mon-extra-card">
          <div class="mon-extra-label" style="color:#aaa">CPU GHz</div>
          <div class="mon-extra-value" id="mon-cpu-ghz">—</div>
        </div>
      </div>

      <div class="mon-proc-section">
        <div class="mon-section-title">Top Processos</div>
        <div class="mon-proc-table" id="mon-proc-table">
          <div style="color:var(--color-text-muted);text-align:center;padding:16px">Aguardando dados...</div>
        </div>
      </div>
    </div>`;

  removeListener = on('metrics:update', onMetrics);
  startRaf();
}

export function unmount() {
  if (removeListener) { removeListener(); removeListener = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function onMetrics(data) {
  Object.entries(SERIES).forEach(([k, s]) => {
    const val = +(data[s.key] ?? 0);
    targetVal[k] = val;
    history[k].push(val);
    if (history[k].length > MAX_POINTS) history[k].shift();
  });

  const vramEl = document.getElementById('mon-vram-detail');
  if (vramEl && data.gpuVramInfo) vramEl.textContent = data.gpuVramInfo || '—';

  const procEl = document.getElementById('mon-proc-count');
  if (procEl && data.processCount != null) procEl.textContent = data.processCount;

  const ghzEl = document.getElementById('mon-cpu-ghz');
  if (ghzEl && data.cpuFreqGHz != null) ghzEl.textContent = `${data.cpuFreqGHz} GHz`;

  updateProcessTable(data.topProcesses ?? []);
}

function startRaf() {
  let frame = 0;
  function loop() {
    rafId = requestAnimationFrame(loop);
    frame++;

    // Interpolação suave lerp α=0.12
    Object.keys(SERIES).forEach(k => {
      displayVal[k] += (targetVal[k] - displayVal[k]) * 0.12;
    });

    // Atualizar stat cards
    Object.entries(SERIES).forEach(([k, s]) => {
      const el  = document.getElementById(`mon-stat-val-${k}`);
      const bar = document.getElementById(`mon-stat-bar-${k}`);
      if (el)  el.textContent = `${displayVal[k].toFixed(1)} ${s.unit}`;
      if (bar && s.max === 100) {
        const pct = Math.min(displayVal[k], 100);
        bar.style.width      = `${pct.toFixed(1)}%`;
        bar.style.background = pct > 85 ? '#e74c3c' : pct > 60 ? '#f39c12' : s.color;
      }
    });

    // Redesenhar gráficos a ~30fps (a cada 2 frames de RAF)
    if (frame % 2 === 0) {
      drawChart('cpu-ram',  ['cpu','ram']);
      drawChart('gpu-vram', ['gpu','vram']);
      drawChart('disk-net', ['disk','netDn']);
    }
  }
  rafId = requestAnimationFrame(loop);
}

function drawChart(id, keys) {
  const canvas = document.getElementById(`mon-canvas-${id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth;
  const H   = canvas.clientHeight;
  if (!W || !H) return;

  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }

  ctx.clearRect(0, 0, W, H);

  // Fundo sutil
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 1;
  [25, 50, 75].forEach(pct => {
    const y = H - (pct / 100) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font      = '9px monospace';
    ctx.fillText(`${pct}`, 4, y - 3);
  });

  keys.forEach(k => {
    const s   = SERIES[k];
    const pts = history[k];
    if (pts.length < 2) return;
    const maxVal = s.max ?? Math.max(...pts, 1);

    const points = pts.map((v, i) => ({
      x: (i / (MAX_POINTS - 1)) * W,
      y: H - (v / maxVal) * H,
    }));

    // Área preenchida
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, hexAlpha(s.color, 0.22));
    grad.addColorStop(1, hexAlpha(s.color, 0.01));
    ctx.beginPath();
    ctx.moveTo(points[0].x, H);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points.at(-1).x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Linha com glow
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth   = 1.8;
    ctx.shadowColor = s.color;
    ctx.shadowBlur  = 8;
    ctx.lineJoin    = 'round';
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Ponto atual
    const last = points.at(-1);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle   = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur  = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function updateProcessTable(procs) {
  const el = document.getElementById('mon-proc-table');
  if (!el || !procs.length) return;
  el.innerHTML = `
    <div class="mon-proc-header">
      <span>Processo</span><span>PID</span><span>CPU %</span><span>RAM MB</span>
    </div>
    ${procs.map(p => `
      <div class="mon-proc-row">
        <span class="mon-proc-name">${p.name}</span>
        <span class="mon-proc-pid">${p.pid}</span>
        <span class="mon-proc-cpu" style="color:${p.cpuPercent>10?'#e74c3c':p.cpuPercent>5?'#f39c12':'#00ff88'}">${(p.cpuPercent||0).toFixed(1)}%</span>
        <span class="mon-proc-ram">${(p.memoryMB||0).toFixed(0)}</span>
      </div>`).join('')}`;
}

function chartCard(id, title, keys) {
  return `
    <div class="mon-chart-card">
      <div class="mon-chart-header">
        <div class="mon-chart-title">${title}</div>
        <div class="mon-chart-legend">
          ${keys.map(k => `<span style="color:${SERIES[k].color};font-size:10px">● ${SERIES[k].label}</span>`).join(' ')}
        </div>
      </div>
      <canvas id="mon-canvas-${id}" class="mon-canvas"></canvas>
    </div>`;
}

function statCard(key, label, color) {
  return `
    <div class="mon-stat-card">
      <div class="mon-stat-label" style="color:${color}">${label}</div>
      <div class="mon-stat-value" id="mon-stat-val-${key}">0.0 ${SERIES[key].unit}</div>
      ${SERIES[key].max === 100 ? `<div class="mon-stat-bar-track"><div class="mon-stat-bar" id="mon-stat-bar-${key}"></div></div>` : ''}
    </div>`;
}

function hexAlpha(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function injectStyles() {
  if (document.getElementById('monitor-styles-v3')) return;
  const s = document.createElement('style');
  s.id = 'monitor-styles-v3';
  s.textContent = `
    .monitor-page{display:flex;flex-direction:column;gap:var(--space-5);height:100%;overflow-y:auto;}
    .mon-live-badge{display:inline-block;font-size:11px;font-weight:700;color:#00ff88;background:rgba(0,255,136,.12);border:1px solid rgba(0,255,136,.3);border-radius:20px;padding:2px 8px;margin-left:8px;vertical-align:middle;animation:mon-pulse 1.2s ease-in-out infinite;}
    @keyframes mon-pulse{0%,100%{opacity:1}50%{opacity:0.35}}
    .monitor-legend{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;}
    .mon-leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
    .mon-leg-label{font-size:var(--text-xs);color:var(--color-text-muted);}
    .monitor-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(min(280px, 100%), 1fr));gap:var(--space-4);}
    .mon-chart-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-4);overflow:hidden;}
    .mon-chart-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);}
    .mon-chart-title{font-size:var(--text-sm);font-weight:600;color:var(--color-text-secondary);}
    .mon-chart-legend{display:flex;gap:8px;}
    .mon-canvas{width:100%;height:140px;display:block;border-radius:var(--radius-md);}
    .monitor-stats-grid{display:grid;grid-template-columns:repeat(auto-fit, minmax(min(160px, 100%), 1fr));gap:var(--space-3);}
    .mon-stat-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);}
    .mon-stat-label{font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
    .mon-stat-value{font-size:var(--text-lg);font-weight:700;color:var(--color-text-primary);font-family:var(--font-mono);margin-bottom:6px;}
    .mon-stat-bar-track{height:3px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden;}
    .mon-stat-bar{height:100%;border-radius:2px;transition:width .08s,background .3s;width:0%;}
    .mon-extra-card{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);}
    .mon-extra-label{font-size:var(--text-xs);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
    .mon-extra-value{font-size:var(--text-base);font-weight:700;color:var(--color-text-primary);font-family:var(--font-mono);}
    .mon-proc-section{background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-4);overflow-x:auto;}
    .mon-section-title{font-size:var(--text-sm);font-weight:700;color:var(--color-text-secondary);margin-bottom:var(--space-3);}
    .mon-proc-header{display:grid;grid-template-columns:1fr 80px 80px 80px;gap:8px;padding:6px 12px;font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);text-transform:uppercase;min-width:380px;}
    .mon-proc-row{display:grid;grid-template-columns:1fr 80px 80px 80px;gap:8px;padding:6px 12px;font-size:var(--text-sm);border-radius:var(--radius-md);transition:background .1s;min-width:380px;}
    .mon-proc-row:hover{background:var(--color-bg-surface-2);}
    .mon-proc-name{font-weight:500;color:var(--color-text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .mon-proc-pid,.mon-proc-ram{color:var(--color-text-muted);font-family:var(--font-mono);font-size:var(--text-xs);}
    .mon-proc-cpu{font-weight:700;font-family:var(--font-mono);}
    @media(max-width:900px){.monitor-grid{grid-template-columns:1fr}.monitor-stats-grid{grid-template-columns:repeat(auto-fit, minmax(min(140px, 100%), 1fr))}}
  `;
  document.head.appendChild(s);
}
