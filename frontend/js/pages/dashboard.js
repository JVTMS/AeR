/**
 * AeR — Dashboard Page (v0.4 — Design conforme screenshot)
 *
 * Layout:
 *  - 6 metric cards com anéis circulares SVG (CPU, Memória, GPU, Disco, Rede, Score)
 *  - Gráfico de linha em tempo real com Chart.js
 *  - 3 colunas: Processos Ativos | Informações do Sistema | Alertas Recentes
 */

import { Logger } from '../utils/logger.js';

const MODULE = 'Dashboard';
let updateInterval  = null;
let telemetryChart  = null;
let cleanupBackend  = null;   // Função para remover listener do backend

// ── Histórico para o gráfico ──────────────────────────────────────────────
const HISTORY_MAX = 30;
const cpuHistory  = [];
const ramHistory  = [];
const gpuHistory  = [];

// ── Mock fallback — pseudo-aleatoriedade EXCLUSIVAMENTE para dados visuais de demonstração ─────
// Não criptográfico: simula métricas de dashboard enquanto o backend está offline.
// Não usar para tokens, autenticação ou qualquer contexto de segurança.
const mockRand  = (min, max) => Math.random() * (max - min) + min;
const mockRandI = (min, max) => Math.floor(mockRand(min, max));
// Aliases curtos internos ao módulo (uso: ri/r nas funções de mock abaixo)
const r  = mockRand;
const ri = mockRandI;

// ── Estado da fonte de dados ──────────────────────────────────────────────
let usingRealData = false;


export async function mount(container) {
  Logger.info(MODULE, 'Montando Dashboard v0.4...');

  container.innerHTML = `
    <div class="dash-root">

      <!-- Header -->
      <div class="dash-header">
        <div>
          <h1 class="dash-title">Dashboard</h1>
          <p class="dash-subtitle">Visão geral em tempo real do desempenho do sistema</p>
        </div>
      </div>

      <!-- Banner: Jogo Detectado (Fase 25) -->
      <div id="dash-game-banner" style="display:none" class="dash-game-banner">
        <span class="dash-game-banner-dot pulse"></span>
        <span>🎮 <strong id="dash-game-name">Jogo</strong> detectado em execução</span>
        <button class="dash-game-turbo-btn" id="dash-game-turbo-btn">⚡ Ativar Modo Turbo</button>
        <a href="#" class="dash-game-go-btn" data-page="gamemode">Ver Game Mode →</a>
      </div>

      <!-- Score Detail Panel (Fase 26) — oculto, abre ao clicar no card de score -->
      <div id="score-detail-panel" class="score-detail-panel" style="display:none">
        <div class="sdp-header">
          <span class="sdp-title">📊 Breakdown do Score</span>
          <button class="sdp-close" id="sdp-close">✕</button>
        </div>
        <div class="sdp-bars" id="sdp-bars">
          <!-- preenchido dinamicamente -->
        </div>
        <div class="sdp-tips" id="sdp-tips"></div>
      </div>

      <!-- ── 6 Metric Cards ── -->
      <div class="ring-grid" id="ring-grid">

        <!-- CPU -->
        <div class="ring-card" id="rc-cpu">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"/>
              <circle class="ring-fg" id="ring-cpu" cx="50" cy="50" r="40"
                stroke="hsl(195,100%,60%)" stroke-dasharray="251.2" stroke-dashoffset="251.2"/>
            </svg>
            <div class="ring-label">
              <span class="ring-pct" id="pct-cpu">0</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="ring-name">CPU</div>
          <div class="ring-meta">
            <span class="ring-meta-row"><span class="ring-meta-k">Temp</span><span class="ring-meta-v" id="meta-cpu-temp">--°C</span></span>
            <span class="ring-meta-row"><span class="ring-meta-k">Free</span><span class="ring-meta-v" id="meta-cpu-free">-- GHz</span></span>
          </div>
        </div>

        <!-- Memória -->
        <div class="ring-card" id="rc-ram">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"/>
              <circle class="ring-fg" id="ring-ram" cx="50" cy="50" r="40"
                stroke="hsl(145,70%,55%)" stroke-dasharray="251.2" stroke-dashoffset="251.2"/>
            </svg>
            <div class="ring-label">
              <span class="ring-pct" id="pct-ram">0</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="ring-name">Memória</div>
          <div class="ring-meta">
            <span class="ring-meta-row"><span class="ring-meta-k">Em uso</span><span class="ring-meta-v" id="meta-ram-used">--/32GB</span></span>
            <span class="ring-meta-row"><span class="ring-meta-k">Drive</span><span class="ring-meta-v" id="meta-ram-drive">-- GB</span></span>
          </div>
        </div>

        <!-- GPU -->
        <div class="ring-card" id="rc-gpu">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"/>
              <circle class="ring-fg" id="ring-gpu" cx="50" cy="50" r="40"
                stroke="hsl(265,80%,65%)" stroke-dasharray="251.2" stroke-dashoffset="251.2"/>
            </svg>
            <div class="ring-label">
              <span class="ring-pct" id="pct-gpu">0</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="ring-name">GPU</div>
          <div class="ring-meta">
            <span class="ring-meta-row"><span class="ring-meta-k">Temp</span><span class="ring-meta-v" id="meta-gpu-temp">--°C</span></span>
            <span class="ring-meta-row"><span class="ring-meta-k">VRAM</span><span class="ring-meta-v" id="meta-gpu-vram">-- GB</span></span>
          </div>
        </div>

        <!-- Disco -->
        <div class="ring-card" id="rc-disk">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"/>
              <circle class="ring-fg" id="ring-disk" cx="50" cy="50" r="40"
                stroke="hsl(38,95%,58%)" stroke-dasharray="251.2" stroke-dashoffset="251.2"/>
            </svg>
            <div class="ring-label">
              <span class="ring-pct" id="pct-disk">0</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="ring-name">Disco</div>
          <div class="ring-meta">
            <span class="ring-meta-row"><span class="ring-meta-k">Leitura</span><span class="ring-meta-v" id="meta-disk-r">-- MB/s</span></span>
            <span class="ring-meta-row"><span class="ring-meta-k">Escrita</span><span class="ring-meta-v" id="meta-disk-w">-- MB/s</span></span>
          </div>
        </div>

        <!-- Rede -->
        <div class="ring-card" id="rc-net">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"/>
              <circle class="ring-fg" id="ring-net" cx="50" cy="50" r="40"
                stroke="hsl(210,80%,60%)" stroke-dasharray="251.2" stroke-dashoffset="251.2"/>
            </svg>
            <div class="ring-label">
              <span class="ring-pct" id="pct-net">0</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="ring-name">Rede</div>
          <div class="ring-meta">
            <span class="ring-meta-row"><span class="ring-meta-k">Download</span><span class="ring-meta-v" id="meta-net-d">-- MB/s</span></span>
            <span class="ring-meta-row"><span class="ring-meta-k">Upload</span><span class="ring-meta-v" id="meta-net-u">-- MB/s</span></span>
          </div>
        </div>

        <!-- Score -->
        <div class="ring-card ring-card--clickable" id="rc-score" title="Clique para ver o breakdown detalhado">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="40"/>
              <circle class="ring-fg" id="ring-score" cx="50" cy="50" r="40"
                stroke="hsl(28,95%,58%)" stroke-dasharray="251.2" stroke-dashoffset="251.2"/>
            </svg>
            <div class="ring-label">
              <span class="ring-pct" id="pct-score">0</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="ring-name">Score <span style="font-size:9px;opacity:.5">▼ detalhes</span></div>
          <div class="ring-meta">
            <span class="ring-meta-row"><span class="ring-meta-k">Estado</span><span class="ring-meta-v" id="meta-score-state">Ótimo</span></span>
            <span class="ring-meta-row"><span class="ring-meta-k">Latência</span><span class="ring-meta-v" id="meta-score-lat">-- ms</span></span>
          </div>
        </div>

      </div><!-- /.ring-grid -->

      <!-- ── Gráfico em Tempo Real ── -->
      <div class="dash-chart-card">
        <div class="dash-chart-header">
          <span class="dash-chart-title">Desempenho em Tempo Real</span>
          <div class="dash-chart-legend">
            <span class="legend-dot" style="background:hsl(195,100%,60%)"></span> CPU
            <span class="legend-dot" style="background:hsl(145,70%,55%); margin-left:12px;"></span> RAM
            <span class="legend-dot" style="background:hsl(265,80%,65%); margin-left:12px;"></span> GPU
          </div>
        </div>
        <div class="dash-chart-wrap">
          <canvas id="chart-realtime"></canvas>
        </div>
      </div>

      <!-- ── Bottom 3 Colunas ── -->
      <div class="dash-bottom">

        <!-- Processos Ativos -->
        <div class="dash-panel">
          <div class="dash-panel-header">
            <span class="dash-panel-title">Processos Ativos</span>
            <span class="dash-panel-badge" id="proc-count">0</span>
          </div>
          <table class="proc-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>PID</th>
                <th>CPU</th>
                <th>RAM</th>
              </tr>
            </thead>
            <tbody id="proc-tbody"></tbody>
          </table>
        </div>

        <!-- Informações do Sistema -->
        <div class="dash-panel">
          <div class="dash-panel-header">
            <span class="dash-panel-title">Informações do Sistema</span>
          </div>
          <div class="sysinfo-list">
            <div class="sysinfo-row"><span class="sysinfo-k">Sistema</span><span class="sysinfo-v" id="si-os">Carregando...</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Processador</span><span class="sysinfo-v" id="si-cpu">Carregando...</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Memória RAM</span><span class="sysinfo-v" id="si-ram">Carregando...</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Placa de Vídeo</span><span class="sysinfo-v" id="si-gpu">Carregando...</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Armazenamento</span><span class="sysinfo-v" id="si-disk">Carregando...</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Placa Mãe</span><span class="sysinfo-v" id="si-mb">Carregando...</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Tipo</span><span class="sysinfo-v" id="si-type">--</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Uptime</span><span class="sysinfo-v" id="si-uptime">--</span></div>
            <div class="sysinfo-row"><span class="sysinfo-k">Kernel</span><span class="sysinfo-v" id="si-ip">--</span></div>
          </div>
        </div>

        <!-- Alertas Recentes -->
        <div class="dash-panel">
          <div class="dash-panel-header">
            <span class="dash-panel-title">Alertas Recentes</span>
            <span class="dash-panel-badge dash-panel-badge--warn" id="alert-count">3</span>
          </div>
          <div class="alerts-list" id="alerts-list">
            <div class="alert-item alert-item--warn">
              <div class="alert-icon alert-icon--warn">🌡️</div>
              <div class="alert-body">
                <div class="alert-msg">Temperatura da CPU acima de 60°C por 5 minutos</div>
                <div class="alert-time">Agora</div>
              </div>
            </div>
            <div class="alert-item alert-item--info">
              <div class="alert-icon alert-icon--info">🔄</div>
              <div class="alert-body">
                <div class="alert-msg">Atualização do Windows disponível (KB3044386)</div>
                <div class="alert-time">30 min atrás</div>
              </div>
            </div>
            <div class="alert-item alert-item--warn">
              <div class="alert-icon alert-icon--warn">💾</div>
              <div class="alert-body">
                <div class="alert-msg">Uso de memória excede 80% momentaneamente</div>
                <div class="alert-time">1h atrás</div>
              </div>
            </div>
            <div class="alert-item alert-item--ok">
              <div class="alert-icon alert-icon--ok">✅</div>
              <div class="alert-body">
                <div class="alert-msg">Ótimo desempenho geral do sistema</div>
                <div class="alert-time">2h atrás</div>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /.dash-bottom -->

    </div><!-- /.dash-root -->
  `;

  injectDashboardStyles();
  initChart();

  // ── Tentar usar dados reais do backend ──────────────────────────────────
  if (typeof window.aer?.on === 'function') {
    cleanupBackend = window.aer.on('metrics:update', (data) => {
      if (!usingRealData) {
        // Primeira vez que recebe dados reais: parar mocks
        clearInterval(updateInterval);
        updateInterval = null;
        usingRealData = true;
        Logger.info(MODULE, '✅ Dados reais do backend recebidos! Mocks desativados.');
        // Atualizar badge de fonte de dados
        const badge = document.getElementById('data-source-badge');
        if (badge) { badge.textContent = '● Dados reais'; badge.style.color = 'hsl(145,70%,55%)'; }
      }
      applyRealData(data);
    });
    Logger.info(MODULE, 'Aguardando dados reais do backend...');
  }

  // Iniciar com mocks até os dados reais chegarem (ou se o backend estiver offline)
  updateAll();
  updateInterval = setInterval(() => {
    if (usingRealData) { clearInterval(updateInterval); updateInterval = null; return; }
    if (!document.getElementById('pct-cpu')) { clearInterval(updateInterval); return; }
    updateAll();
  }, 2000);

  // ── Score Detail Panel (Fase 26) ──────────────────────────────────────────
  const scoreCard = document.getElementById('rc-score');
  const scorePanel = document.getElementById('score-detail-panel');
  const sdpClose  = document.getElementById('sdp-close');
  if (scoreCard && scorePanel) {
    scoreCard.addEventListener('click', () => {
      scorePanel.style.display = scorePanel.style.display === 'none' ? 'block' : 'none';
    });
  }
  if (sdpClose && scorePanel) {
    sdpClose.addEventListener('click', () => { scorePanel.style.display = 'none'; });
  }

  // ── Banner de Jogo Detectado (Fase 25) ───────────────────────────────────
  const gameBtn = document.getElementById('dash-game-turbo-btn');
  if (gameBtn) {
    gameBtn.addEventListener('click', async () => {
      try {
        if (window.aer?.invoke) {
          gameBtn.disabled = true;
          gameBtn.textContent = '⏳ Ativando...';
          await window.aer.invoke('game:turbo:enable', {});
          gameBtn.textContent = '✅ Turbo Ativo!';
          setTimeout(() => { gameBtn.textContent = '⚡ Ativar Modo Turbo'; gameBtn.disabled = false; }, 3000);
        }
      } catch(e) { gameBtn.disabled = false; gameBtn.textContent = '⚡ Ativar Modo Turbo'; }
    });
  }
  const gameGoBtn = document.querySelector('.dash-game-go-btn');
  if (gameGoBtn) {
    gameGoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.__router?.navigate) window.__router.navigate('gamemode');
    });
  }
  // Poll jogo detectado a cada 8s
  startGamePoll();
}

export function unmount() {
  clearInterval(updateInterval);
  clearInterval(_gamePollTimer);
  _gamePollTimer = null;
  if (typeof cleanupBackend === 'function') cleanupBackend();
  cleanupBackend = null;
  usingRealData  = false;
  if (telemetryChart) { telemetryChart.destroy(); telemetryChart = null; }
  Logger.info(MODULE, 'Dashboard desmontado.');
}

// ── Ring Progress ─────────────────────────────────────────────────────────
const CIRCUMFERENCE = 251.2; // 2 * π * 40

function setRing(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, pct)) / 100);
  el.style.strokeDashoffset = offset;
  el.style.transition = 'stroke-dashoffset 600ms cubic-bezier(0.4,0,0.2,1)';
}

function setPct(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = Math.round(val);
}

function setTxt(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Chart.js Init ─────────────────────────────────────────────────────────
function initChart() {
  const canvas = document.getElementById('chart-realtime');
  if (!canvas || typeof Chart === 'undefined') return;

  // Inicializar histórico vazio
  for (let i = 0; i < HISTORY_MAX; i++) {
    cpuHistory.push(0);
    ramHistory.push(0);
    gpuHistory.push(0);
  }

  const labels = Array.from({ length: HISTORY_MAX }, (_, i) => i);

  const makeDataset = (label, data, color) => ({
    label,
    data,
    borderColor: color,
    backgroundColor: color.replace('hsl', 'hsla').replace(')', ', 0.08)'),
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.4,
    fill: true,
  });

  telemetryChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        makeDataset('CPU',  cpuHistory, 'hsl(195,100%,60%)'),
        makeDataset('RAM',  ramHistory, 'hsl(145,70%,55%)'),
        makeDataset('GPU',  gpuHistory, 'hsl(265,80%,65%)'),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'hsla(228,22%,14%,0.95)',
          borderColor: 'hsla(215,20%,25%,0.6)',
          borderWidth: 1,
          titleColor: 'hsl(210,20%,90%)',
          bodyColor:  'hsl(210,15%,65%)',
          padding: 10,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          min: 0, max: 100,
          grid: {
            color: 'hsla(215,20%,18%,0.8)',
            drawBorder: false,
          },
          ticks: {
            color: 'hsl(210,12%,38%)',
            font: { size: 10, family: 'JetBrains Mono' },
            callback: v => `${v}%`,
            maxTicksLimit: 5,
          },
          border: { display: false },
        },
      },
    },
  });
}

// ── updateAll: dados mockados (usado enquanto backend está offline) ────────
function updateAll() {
  const cpu  = ri(8, 85);
  const ram  = ri(30, 75);
  const gpu  = ri(10, 90);
  const disk = ri(0, 70);
  const net  = ri(5, 40);
  const score = ri(70, 95);

  setRing('ring-cpu', cpu);     setPct('pct-cpu', cpu);
  setRing('ring-ram', ram);     setPct('pct-ram', ram);
  setRing('ring-gpu', gpu);     setPct('pct-gpu', gpu);
  setRing('ring-disk', disk);   setPct('pct-disk', disk);
  setRing('ring-net', net);     setPct('pct-net', net);
  setRing('ring-score', score); setPct('pct-score', score);

  const cpuTemp = ri(38, 82);
  const gpuTemp = ri(42, 80);
  setTxt('meta-cpu-temp', `${cpuTemp}°C`);
  setTxt('meta-cpu-free', `${r(2.8, 4.9).toFixed(2)} GHz`);
  setTxt('meta-ram-used', `${(ram * 0.32).toFixed(1)}/32GB`);
  setTxt('meta-ram-drive', `${r(0.1, 1.2).toFixed(1)} GB`);
  setTxt('meta-gpu-temp', `${gpuTemp}°C`);
  setTxt('meta-gpu-vram', `${ri(2, 12)} GB`);
  setTxt('meta-disk-r', `${ri(0, 800)} MB/s`);
  setTxt('meta-disk-w', `${ri(0, 300)} MB/s`);
  setTxt('meta-net-d', `${ri(0, 150)} MB/s`);
  setTxt('meta-net-u', `${ri(0, 50)} MB/s`);
  setTxt('meta-score-state', score >= 80 ? 'Ótimo' : score >= 60 ? 'Bom' : 'Atenção');
  setTxt('meta-score-lat', `${ri(1, 8)} ms`);

  const upSec = Math.floor(performance.now() / 1000);
  const h = Math.floor(upSec / 3600), m = Math.floor((upSec % 3600) / 60);
  setTxt('si-uptime', `${h}d ${h}h${String(m).padStart(2,'0')}m`);

  updateChart(cpu, ram, gpu);
  updateProcesses(cpu, ram);
}

// ── applyRealData: dados reais do backend C# ──────────────────────────────
/**
 * Aplica um MetricsSnapshot recebido via Named Pipe ao Dashboard.
 * @param {object} d - MetricsSnapshot serializado pelo C# (camelCase .NET)
 */
function applyRealData(d) {
  if (!d) return;

  const ramPct  = d.ramPercent   ?? (d.ramTotalMB > 0 ? d.ramUsedMB / d.ramTotalMB * 100 : 0);
  const diskPct = d.diskActivityPercent ?? 0;
  const gpuPct  = d.gpuPercent   ?? 0;
  const netPct  = Math.min(100, ((d.netDownMBps ?? 0) + (d.netUpMBps ?? 0)) * 10);
  const score   = d.systemScore  ?? 80;

  // ── Anéis ──────────────────────────────────────────────────────────────
  setRing('ring-cpu',   d.cpuPercent ?? 0); setPct('pct-cpu',   d.cpuPercent ?? 0);
  setRing('ring-ram',   ramPct);            setPct('pct-ram',   Math.round(ramPct));
  setRing('ring-gpu',   gpuPct);            setPct('pct-gpu',   gpuPct);
  setRing('ring-disk',  diskPct);           setPct('pct-disk',  Math.round(diskPct));
  setRing('ring-net',   netPct);            setPct('pct-net',   Math.round(netPct));
  setRing('ring-score', score);             setPct('pct-score', score);

  // ── Metadados CPU ───────────────────────────────────────────────────────
  setTxt('meta-cpu-temp', d.cpuTempCelsius > 0 ? `${Math.round(d.cpuTempCelsius)}°C` : '--°C');
  setTxt('meta-cpu-free', d.cpuFreqGHz > 0 ? `${Number(d.cpuFreqGHz).toFixed(2)} GHz` : '--');

  // ── Metadados RAM ───────────────────────────────────────────────────────
  const usedGB  = ((d.ramUsedMB  ?? 0) / 1024).toFixed(1);
  const totalGB = ((d.ramTotalMB ?? 0) / 1024).toFixed(0);
  const freeMB  = d.ramFreeMB ?? ((d.ramTotalMB ?? 0) - (d.ramUsedMB ?? 0));
  setTxt('meta-ram-used',  `${usedGB}/${totalGB}GB`);
  setTxt('meta-ram-drive', `${(freeMB / 1024).toFixed(1)} GB livre`);

  // ── Metadados GPU ───────────────────────────────────────────────────────
  setTxt('meta-gpu-temp', d.gpuTempCelsius > 0 ? `${Math.round(d.gpuTempCelsius)}°C` : '--°C');
  setTxt('meta-gpu-vram', d.gpuVramInfo || '--');

  // ── Metadados Disco ─────────────────────────────────────────────────────
  setTxt('meta-disk-r', `${(d.diskReadMBps  ?? 0).toFixed(0)} MB/s`);
  setTxt('meta-disk-w', `${(d.diskWriteMBps ?? 0).toFixed(1)} MB/s`);

  // ── Metadados Rede ──────────────────────────────────────────────────────
  setTxt('meta-net-d', `${(d.netDownMBps ?? 0).toFixed(2)} MB/s`);
  setTxt('meta-net-u', `${(d.netUpMBps   ?? 0).toFixed(2)} MB/s`);

  // ── Metadados Score + Breakdown (Fase 26) ───────────────────────────────
  setTxt('meta-score-state', d.systemState ?? 'Bom');
  setTxt('meta-score-lat',   '--');
  if (d.scoreDetail) updateScoreDetail(d.scoreDetail);

  // ── Contagem de processos ───────────────────────────────────────────────
  const procCount = document.getElementById('proc-count');
  if (procCount) procCount.textContent = `${d.processCount ?? '--'}`;

  // ── Gráfico ─────────────────────────────────────────────────────────────
  updateChart(d.cpuPercent ?? 0, ramPct, gpuPct);

  // ── Informações do Sistema (WMI — preenche quando disponível) ───────────
  if (d.osName)          setTxt('si-os',   d.osName);
  if (d.cpuName)         setTxt('si-cpu',  d.cpuName);
  if (d.ramInfo)         setTxt('si-ram',  d.ramInfo);
  if (d.gpuName)         setTxt('si-gpu',  d.gpuName);
  if (d.diskInfo)        setTxt('si-disk', d.diskInfo);
  if (d.motherboardName) setTxt('si-mb',   d.motherboardName);
  if (d.systemType)      setTxt('si-type', d.systemType);
  if (d.uptimeFormatted) setTxt('si-uptime', d.uptimeFormatted);
  if (d.kernelVersion)   setTxt('si-ip',   d.kernelVersion);

  // ── Processos com CPU% real ─────────────────────────────────────────────
  if (Array.isArray(d.topProcesses) && d.topProcesses.length > 0) {
    applyRealProcesses(d.topProcesses);
  }

  // ── Alertas dinâmicos ───────────────────────────────────────────────────
  if (Array.isArray(d.alerts)) {
    applyAlerts(d.alerts);
  }
}

/** Preenche a tabela de processos com dados reais do backend. */
function applyRealProcesses(procs) {
  const tbody = document.getElementById('proc-tbody');
  if (!tbody) return;

  const cpuColor = (v) => {
    if (v > 15) return 'hsl(355,80%,60%)';
    if (v > 5)  return 'hsl(38,90%,58%)';
    return 'hsl(145,60%,55%)';
  };

  // Constrói linhas via DOM — p.name pode conter caracteres HTML; textContent é seguro.
  tbody.textContent = '';
  procs.forEach(p => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'proc-name';
    tdName.textContent = p.name ?? '--';

    const tdPid = document.createElement('td');
    tdPid.className = 'proc-pid';
    tdPid.textContent = String(p.pid ?? '--');

    const tdCpu = document.createElement('td');
    tdCpu.className = 'proc-cpu';
    tdCpu.style.color = cpuColor(p.cpuPercent ?? 0);
    tdCpu.textContent = `${(p.cpuPercent ?? 0).toFixed(1)}%`;

    const tdRam = document.createElement('td');
    tdRam.className = 'proc-ram';
    tdRam.textContent = `${(p.memoryMB ?? 0).toFixed(0)} MB`;

    tr.appendChild(tdName);
    tr.appendChild(tdPid);
    tr.appendChild(tdCpu);
    tr.appendChild(tdRam);
    tbody.appendChild(tr);
  });
}

/** Renderiza alertas dinâmicos vindos do backend. */
function applyAlerts(alerts) {
  const list  = document.getElementById('alerts-list');
  const badge = document.getElementById('alert-count');
  if (!list) return;

  if (!alerts || alerts.length === 0) return;

  const iconMap  = { error: '🔴', warn: '⚠️', info: '🔵', ok: '✅' };
  const classMap = {
    error: 'alert-item--warn',
    warn:  'alert-item--warn',
    info:  'alert-item--info',
    ok:    'alert-item--ok',
  };
  // Conjunto de classes permitidas — evita injeção via a.level
  const allowedClasses = new Set(Object.values(classMap));

  // Constrói alertas via DOM — a.message e a.time vêm do backend e são tratados como texto.
  list.textContent = '';
  alerts.forEach(a => {
    const safeClass = allowedClasses.has(classMap[a.level]) ? classMap[a.level] : 'alert-item--info';

    const item = document.createElement('div');
    item.className = `alert-item ${safeClass}`;

    const iconEl = document.createElement('div');
    iconEl.className = 'alert-icon';
    iconEl.textContent = iconMap[a.level] ?? 'ℹ️';

    const body = document.createElement('div');
    body.className = 'alert-body';

    const msg = document.createElement('div');
    msg.className = 'alert-msg';
    msg.textContent = a.message ?? '';        // textContent — nunca innerHTML

    const timeEl = document.createElement('div');
    timeEl.className = 'alert-time';
    timeEl.textContent = a.time ?? 'Agora';   // textContent — nunca innerHTML

    body.appendChild(msg);
    body.appendChild(timeEl);
    item.appendChild(iconEl);
    item.appendChild(body);
    list.appendChild(item);
  });

  if (badge) {
    const warnCount = alerts.filter(a => a.level === 'warn' || a.level === 'error').length;
    badge.textContent = `${warnCount}`;
    badge.style.display = warnCount > 0 ? '' : 'none';
  }
}


function updateChart(cpu, ram, gpu) {
  if (!telemetryChart) return;
  cpuHistory.push(cpu); if (cpuHistory.length > HISTORY_MAX) cpuHistory.shift();
  ramHistory.push(ram); if (ramHistory.length > HISTORY_MAX) ramHistory.shift();
  gpuHistory.push(gpu); if (gpuHistory.length > HISTORY_MAX) gpuHistory.shift();
  telemetryChart.update('none');
}

const PROC_NAMES = [
  'System', 'svchost.exe (rede)', 'canva.exe',
  'WindowsTerminal.exe', 'chrome.exe', 'code.exe',
  'AeR.Api.exe', 'explorer.exe', 'Discord.exe', 'node.exe',
];

function updateProcesses(totalCpu, _totalRam) {
  const tbody = document.getElementById('proc-tbody');
  if (!tbody) return;

  const procs = PROC_NAMES.slice(0, 6).map((name, i) => ({
    name,
    pid: 4 + ri(100, 9000),
    cpu: i === 0 ? r(0, 1).toFixed(1) : r(0, totalCpu * 0.25).toFixed(1),
    ram: `${ri(5, 500)} MB`,
  })).sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu));

  document.getElementById('proc-count').textContent = `${ri(80, 180)}`;

  const cpuColor = (v) => {
    const n = parseFloat(v);
    if (n > 15) return 'hsl(355,80%,60%)';
    if (n > 8)  return 'hsl(38,90%,58%)';
    return 'hsl(145,60%,55%)';
  };

  tbody.innerHTML = procs.map(p => `
    <tr>
      <td class="proc-name">${p.name}</td>
      <td class="proc-pid">${p.pid}</td>
      <td class="proc-cpu" style="color:${cpuColor(p.cpu)}">${p.cpu}%</td>
      <td class="proc-ram">${p.ram}</td>
    </tr>
  `).join('');
}

// ── Score Detail Panel (Fase 26) ──────────────────────────────────────────
function updateScoreDetail(detail) {
  const barsEl = document.getElementById('sdp-bars');
  const tipsEl = document.getElementById('sdp-tips');
  if (!barsEl || !detail) return;

  const components = [
    { label: '🖥 CPU',     score: detail.cpuScore     ?? 100 },
    { label: '🧠 RAM',     score: detail.ramScore     ?? 100 },
    { label: '💾 Disco',   score: detail.diskScore    ?? 100 },
    { label: '🎮 GPU',     score: detail.gpuScore     ?? 100 },
    { label: '🌡 Térmica', score: detail.thermalScore ?? 100 },
  ];

  const barColor = (s) => s >= 75 ? '#00ff88' : s >= 50 ? '#f39c12' : '#ff3b30';

  // Barras de score — labels hardcoded (seguros), scores são numéricos (seguros).
  barsEl.textContent = '';
  components.forEach(c => {
    const row = document.createElement('div');
    row.className = 'sdp-bar-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'sdp-bar-label';
    labelEl.textContent = c.label;           // hardcoded — seguro

    const track = document.createElement('div');
    track.className = 'sdp-bar-track';

    const fill = document.createElement('div');
    fill.className = 'sdp-bar-fill';
    fill.style.width      = `${Number(c.score)}%`; // Number() garante que é numérico
    fill.style.background = barColor(c.score);

    track.appendChild(fill);

    const val = document.createElement('span');
    val.className  = 'sdp-bar-val';
    val.style.color = barColor(c.score);
    val.textContent = String(c.score);       // numérico — seguro

    row.appendChild(labelEl);
    row.appendChild(track);
    row.appendChild(val);
    barsEl.appendChild(row);
  });

  if (tipsEl && Array.isArray(detail.tips)) {
    // Tips vêm do backend — usar textContent, nunca innerHTML.
    tipsEl.textContent = '';

    const title = document.createElement('div');
    title.className = 'sdp-tips-title';
    title.textContent = '💡 Recomendações';
    tipsEl.appendChild(title);

    detail.tips.forEach(t => {
      const tip = document.createElement('div');
      tip.className = 'sdp-tip';
      tip.textContent = `• ${t}`;            // textContent — sem risco de XSS
      tipsEl.appendChild(tip);
    });
  }
}

// ── Game Polling (Fase 25) ────────────────────────────────────────────────
let _gamePollTimer = null;
function startGamePoll() {
  clearInterval(_gamePollTimer);
  _gamePollTimer = setInterval(async () => {
    const banner   = document.getElementById('dash-game-banner');
    const gameName = document.getElementById('dash-game-name');
    if (!banner || !gameName) { clearInterval(_gamePollTimer); return; }
    try {
      if (!window.aer?.invoke) return;
      const status = await window.aer.invoke('game:status', {});
      if (status?.isGameRunning) {
        gameName.textContent = status.gameName || 'Jogo';
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    } catch { }
  }, 8000);
}

// ── Estilos do Dashboard (injetados dinamicamente) ────────────────────────
function injectDashboardStyles() {
  const id = 'dash-styles';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
    .dash-root { display: flex; flex-direction: column; gap: 16px; min-height: 100%; }

    /* Header */
    .dash-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2px; }
    .dash-title { font-size: 22px; font-weight: 700; color: hsl(210,20%,94%); }
    .dash-subtitle { font-size: 12px; color: hsl(210,12%,48%); margin-top: 3px; }

    /* Ring Grid Responsivo */
    .ring-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
    }
    @media (max-width: 1240px) { .ring-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 680px)  { .ring-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 440px)  { .ring-grid { grid-template-columns: 1fr; } }

    .ring-card {
      background: hsl(228,18%,13%);
      border: 1px solid hsla(215,20%,20%,0.7);
      border-radius: 10px;
      padding: 16px 12px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .ring-card:hover {
      border-color: hsla(215,30%,30%,0.8);
      box-shadow: 0 4px 20px hsla(0,0%,0%,0.3);
    }

    .ring-wrap {
      position: relative;
      width: 90px; height: 90px;
    }

    .ring-svg {
      width: 100%; height: 100%;
      transform: rotate(-90deg);
    }

    .ring-bg {
      fill: none;
      stroke: hsla(215,20%,20%,0.8);
      stroke-width: 7;
    }

    .ring-fg {
      fill: none;
      stroke-width: 7;
      stroke-linecap: round;
    }

    .ring-label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      gap: 1px;
    }

    .ring-pct {
      font-size: 22px;
      font-weight: 700;
      color: hsl(210,20%,94%);
      line-height: 1;
    }

    .ring-unit {
      font-size: 11px;
      color: hsl(210,12%,50%);
      align-self: flex-end;
      margin-bottom: 3px;
    }

    .ring-name {
      font-size: 12px;
      font-weight: 600;
      color: hsl(210,15%,70%);
      letter-spacing: 0.03em;
    }

    .ring-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: 100%;
    }

    .ring-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
    }

    .ring-meta-k { color: hsl(210,12%,42%); }
    .ring-meta-v { color: hsl(210,15%,68%); font-family: 'JetBrains Mono', monospace; font-size: 10px; }

    /* Chart */
    .dash-chart-card {
      background: hsl(228,18%,13%);
      border: 1px solid hsla(215,20%,20%,0.7);
      border-radius: 10px;
      padding: 16px 18px;
    }

    .dash-chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .dash-chart-title {
      font-size: 13px;
      font-weight: 600;
      color: hsl(210,18%,82%);
    }

    .dash-chart-legend {
      display: flex;
      align-items: center;
      font-size: 11px;
      color: hsl(210,12%,52%);
      gap: 4px;
    }

    .legend-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .dash-chart-wrap {
      height: 160px;
      position: relative;
    }

    /* Bottom 3 cols Responsivo */
    .dash-bottom {
      display: grid;
      grid-template-columns: 1.3fr 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 1160px) {
      .dash-bottom { grid-template-columns: 1fr 1fr; }
      .dash-bottom > .dash-panel:first-child { grid-column: 1 / -1; }
    }
    @media (max-width: 820px) {
      .dash-bottom { grid-template-columns: 1fr; }
      .dash-bottom > .dash-panel:first-child { grid-column: auto; }
    }

    .dash-panel {
      background: hsl(228,18%,13%);
      border: 1px solid hsla(215,20%,20%,0.7);
      border-radius: 10px;
      padding: 14px 16px;
      overflow: hidden;
    }

    .dash-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .dash-panel-title {
      font-size: 13px;
      font-weight: 600;
      color: hsl(210,18%,82%);
    }

    .dash-panel-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 20px;
      background: hsla(195,100%,60%,0.12);
      color: hsl(195,100%,65%);
      border: 1px solid hsla(195,100%,60%,0.25);
      font-family: 'JetBrains Mono', monospace;
    }

    .dash-panel-badge--warn {
      background: hsla(38,90%,58%,0.12);
      color: hsl(38,90%,62%);
      border-color: hsla(38,90%,58%,0.25);
    }

    /* Processos */
    .proc-table { width: 100%; border-collapse: collapse; }
    .proc-table th {
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: hsl(210,12%,38%);
      padding: 0 6px 8px;
    }
    .proc-table th:not(:first-child) { text-align: right; }
    .proc-table td {
      padding: 6px 6px;
      font-size: 11.5px;
      border-top: 1px solid hsla(215,20%,18%,0.8);
    }
    .proc-table tr:hover td { background: hsla(215,20%,16%,0.6); }
    .proc-name { color: hsl(210,18%,80%); font-family: 'JetBrains Mono', monospace; }
    .proc-pid  { color: hsl(210,12%,45%); font-family: 'JetBrains Mono', monospace; text-align: right; }
    .proc-cpu  { font-family: 'JetBrains Mono', monospace; font-weight: 600; text-align: right; }
    .proc-ram  { color: hsl(210,15%,58%); font-family: 'JetBrains Mono', monospace; text-align: right; }

    /* System Info */
    .sysinfo-list { display: flex; flex-direction: column; gap: 0; }
    .sysinfo-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid hsla(215,20%,18%,0.7);
      font-size: 11.5px;
    }
    .sysinfo-row:last-child { border-bottom: none; }
    .sysinfo-k { color: hsl(210,12%,42%); flex-shrink: 0; }
    .sysinfo-v { color: hsl(210,16%,72%); text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Alertas */
    .alerts-list { display: flex; flex-direction: column; gap: 8px; }
    .alert-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 10px;
      border-radius: 8px;
      background: hsla(215,20%,15%,0.6);
      border: 1px solid hsla(215,20%,20%,0.5);
    }
    .alert-item--warn { border-left: 2px solid hsl(38,90%,58%); }
    .alert-item--info { border-left: 2px solid hsl(195,100%,60%); }
    .alert-item--ok   { border-left: 2px solid hsl(145,70%,55%); }
    .alert-icon { font-size: 16px; flex-shrink: 0; }
    .alert-body { flex: 1; min-width: 0; }
    .alert-msg { font-size: 11.5px; color: hsl(210,16%,76%); line-height: 1.4; }
    .alert-time { font-size: 10px; color: hsl(210,12%,42%); margin-top: 3px; }

    /* ── Game Banner (Fase 25) ── */
    .dash-game-banner {
      display: flex; align-items: center; gap: 10px;
      background: rgba(255,107,0,.12); border: 1px solid rgba(255,107,0,.35);
      border-radius: var(--radius-xl); padding: 10px 18px;
      font-size: var(--text-sm); color: var(--color-text-primary);
    }
    .dash-game-banner-dot { width:8px;height:8px;border-radius:50%;background:#ff6b00;flex-shrink:0; }
    .dash-game-banner-dot.pulse { animation: gm-pulse 1.5s infinite; }
    @keyframes gm-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
    .dash-game-turbo-btn {
      margin-left: auto; background: #ff6b00; color: #fff; border: none;
      border-radius: var(--radius-lg); padding: 6px 14px; font-size: 12px;
      font-weight: 600; cursor: pointer; transition: opacity .15s;
    }
    .dash-game-turbo-btn:hover { opacity: .85; }
    .dash-game-go-btn { font-size: 12px; color: rgba(255,107,0,.8); text-decoration: none; white-space: nowrap; }
    .dash-game-go-btn:hover { color: #ff6b00; }

    /* ── Ring card clickable ── */
    .ring-card--clickable { cursor: pointer; transition: transform .15s, box-shadow .15s; }
    .ring-card--clickable:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.25); }

    /* ── Score Detail Panel (Fase 26) ── */
    .score-detail-panel {
      background: var(--color-bg-surface-1); border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl); padding: var(--space-4) var(--space-5);
    }
    .sdp-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3); }
    .sdp-title { font-size: var(--text-sm); font-weight: 600; }
    .sdp-close { background:none; border:none; cursor:pointer; color:var(--color-text-muted); font-size:14px; padding:0 4px; }
    .sdp-close:hover { color: var(--color-text-primary); }
    .sdp-bar-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .sdp-bar-label { font-size:12px; width:80px; flex-shrink:0; }
    .sdp-bar-track { flex:1; height:6px; background:var(--color-bg-surface-3); border-radius:3px; overflow:hidden; }
    .sdp-bar-fill { height:100%; border-radius:3px; transition:width .4s; }
    .sdp-bar-val { font-size:12px; font-weight:600; width:30px; text-align:right; }
    .sdp-tips { border-top:1px solid var(--color-border-subtle); padding-top:var(--space-3); margin-top:var(--space-2); }
    .sdp-tips-title { font-size:11px; font-weight:600; color:var(--color-text-muted); margin-bottom:6px; }
    .sdp-tip { font-size:11.5px; color:var(--color-text-secondary); margin-bottom:4px; line-height:1.4; }
  `;
  document.head.appendChild(s);
}
