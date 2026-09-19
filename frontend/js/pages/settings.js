import { Logger } from '../utils/logger.js';
const MODULE = 'Settings';

// ── Defini\u00e7\u00e3o de todos os temas ───────────────────────────────────────────────
const THEMES = [
  { id:'dark-default', name:'Escuro Padr\u00e3o',    emoji:'\ud83c\udf11', colors:{ accent:'#d4b483', bg:'#0e0e0e', surface1:'#141414', surface2:'#1c1c1c', surface3:'#252525', border:'rgba(255,255,255,.07)', textPrimary:'#f0f0f0', textSecondary:'#aaa', textMuted:'#666' } },
  { id:'dark-blue',    name:'Azul Noite',           emoji:'\ud83d\udd35', colors:{ accent:'#3498db', bg:'#0a0f1a', surface1:'#111827', surface2:'#1a2236', surface3:'#243049', border:'rgba(52,152,219,.15)', textPrimary:'#e8f0fe', textSecondary:'#93b4d8', textMuted:'#4d6a8a' } },
  { id:'dark-purple',  name:'Roxo Nebula',          emoji:'\ud83d\udc9c', colors:{ accent:'#a855f7', bg:'#0d0a14', surface1:'#130d1e', surface2:'#1c1330', surface3:'#261840', border:'rgba(168,85,247,.15)', textPrimary:'#f0e8ff', textSecondary:'#c4a8e8', textMuted:'#5e4a7a' } },
  { id:'dark-green',   name:'Matrix Verde',         emoji:'\ud83d\udc9a', colors:{ accent:'#00ff9f', bg:'#020e08', surface1:'#071410', surface2:'#0d1f17', surface3:'#122a1f', border:'rgba(0,255,159,.12)', textPrimary:'#c8ffe6', textSecondary:'#4dcc8f', textMuted:'#1a5c3a' } },
  { id:'dark-red',     name:'Vermelho Fogo',        emoji:'\ud83d\udd34', colors:{ accent:'#e74c3c', bg:'#0f0808', surface1:'#180c0c', surface2:'#221212', surface3:'#2e1616', border:'rgba(231,76,60,.12)', textPrimary:'#ffe8e8', textSecondary:'#cc7070', textMuted:'#664040' } },
  { id:'dark-orange',  name:'Laranja Lava',         emoji:'\ud83d\udfe0', colors:{ accent:'#f39c12', bg:'#0f0c07', surface1:'#17110a', surface2:'#21190e', surface3:'#2d2212', border:'rgba(243,156,18,.12)', textPrimary:'#fff3d6', textSecondary:'#c49040', textMuted:'#664d1a' } },
  { id:'dark-pink',    name:'Rosa Neon',            emoji:'\ud83c\udf38', colors:{ accent:'#ff6fa3', bg:'#0f090c', surface1:'#180c12', surface2:'#22101a', surface3:'#2d1522', border:'rgba(255,111,163,.12)', textPrimary:'#ffe8f0', textSecondary:'#cc6090', textMuted:'#664050' } },
  { id:'dark-cyan',    name:'Ciano Aqua',           emoji:'\ud83e\udee6', colors:{ accent:'#00d4ff', bg:'#040e11', surface1:'#091518', surface2:'#0f2027', surface3:'#152c36', border:'rgba(0,212,255,.12)', textPrimary:'#d6f7ff', textSecondary:'#40aabf', textMuted:'#1a5566' } },
  { id:'dark-gold',    name:'Dourado Royal',        emoji:'\u2728',       colors:{ accent:'#ffd700', bg:'#0c0a04', surface1:'#141108', surface2:'#1e190d', surface3:'#282212', border:'rgba(255,215,0,.12)', textPrimary:'#fff8d6', textSecondary:'#bfa040', textMuted:'#665a1a' } },
  { id:'dark-silver',  name:'Prata Glacial',        emoji:'\u26aa',       colors:{ accent:'#c0c0c0', bg:'#0a0a0a', surface1:'#111111', surface2:'#181818', surface3:'#222222', border:'rgba(192,192,192,.12)', textPrimary:'#f5f5f5', textSecondary:'#aaaaaa', textMuted:'#555555' } },
  { id:'dark-teal',    name:'Teal Profundo',        emoji:'\ud83e\udd9a', colors:{ accent:'#1abc9c', bg:'#040e0c', surface1:'#091512', surface2:'#0f201c', surface3:'#152b26', border:'rgba(26,188,156,.12)', textPrimary:'#d6fff8', textSecondary:'#40bfaa', textMuted:'#1a6657' } },
  { id:'dark-indigo',  name:'Indigo Cosmos',        emoji:'\ud83c\udf0c', colors:{ accent:'#6366f1', bg:'#07070f', surface1:'#0e0e1a', surface2:'#141426', surface3:'#1a1a33', border:'rgba(99,102,241,.12)', textPrimary:'#e8e8ff', textSecondary:'#8888cc', textMuted:'#404070' } },
  { id:'light-clean',  name:'Claro Limpo',          emoji:'\u2600\ufe0f', colors:{ accent:'#2563eb', bg:'#f8fafc', surface1:'#ffffff', surface2:'#f1f5f9', surface3:'#e2e8f0', border:'rgba(0,0,0,.08)', textPrimary:'#0f172a', textSecondary:'#475569', textMuted:'#94a3b8' } },
  { id:'light-warm',   name:'Claro Quente',         emoji:'\ud83c\udf05', colors:{ accent:'#d97706', bg:'#fdf7f0', surface1:'#fffbf5', surface2:'#fef3e2', surface3:'#fde8c8', border:'rgba(180,100,0,.1)', textPrimary:'#1c0a00', textSecondary:'#8a5a30', textMuted:'#c49060' } },
  { id:'amoled',       name:'AMOLED Puro',          emoji:'\u26ab',       colors:{ accent:'#ffffff', bg:'#000000', surface1:'#000000', surface2:'#0a0a0a', surface3:'#111111', border:'rgba(255,255,255,.06)', textPrimary:'#ffffff', textSecondary:'#aaaaaa', textMuted:'#555555' } },
  { id:'catppuccin',   name:'Catppuccin Mocha',     emoji:'\ud83d\udc08', colors:{ accent:'#cba6f7', bg:'#1e1e2e', surface1:'#181825', surface2:'#11111b', surface3:'#313244', border:'rgba(203,166,247,.15)', textPrimary:'#cdd6f4', textSecondary:'#bac2de', textMuted:'#585b70' } },
  { id:'dracula',      name:'Dracula',              emoji:'\ud83e\uddd9', colors:{ accent:'#ff79c6', bg:'#282a36', surface1:'#21222c', surface2:'#1e1f29', surface3:'#343746', border:'rgba(255,121,198,.15)', textPrimary:'#f8f8f2', textSecondary:'#bd93f9', textMuted:'#6272a4' } },
  { id:'tokyo-night',  name:'Tokyo Night',          emoji:'\ud83d\uddfc', colors:{ accent:'#7aa2f7', bg:'#1a1b26', surface1:'#16161e', surface2:'#13131a', surface3:'#24283b', border:'rgba(122,162,247,.12)', textPrimary:'#c0caf5', textSecondary:'#a9b1d6', textMuted:'#565f89' } },
  { id:'nord',         name:'Nord Arctic',          emoji:'\u2744\ufe0f', colors:{ accent:'#88c0d0', bg:'#2e3440', surface1:'#3b4252', surface2:'#434c5e', surface3:'#4c566a', border:'rgba(136,192,208,.15)', textPrimary:'#eceff4', textSecondary:'#d8dee9', textMuted:'#8895a7' } },
  { id:'gruvbox',      name:'Gruvbox',              emoji:'\ud83d\udfe7', colors:{ accent:'#fabd2f', bg:'#282828', surface1:'#1d2021', surface2:'#32302f', surface3:'#3c3836', border:'rgba(250,189,47,.1)', textPrimary:'#ebdbb2', textSecondary:'#d5c4a1', textMuted:'#928374' } },
  { id:'one-dark',     name:'One Dark',             emoji:'\ud83c\udf13', colors:{ accent:'#61afef', bg:'#282c34', surface1:'#21252b', surface2:'#1e2227', surface3:'#2c313c', border:'rgba(97,175,239,.12)', textPrimary:'#abb2bf', textSecondary:'#9da5b4', textMuted:'#5c6370' } },
];

// ── Defini\u00e7\u00e3o de bordas ────────────────────────────────────────────────────────
const RADIUS_PRESETS = [
  { id:'flat',    name:'Sem Borda',                values:{ xs:'0px', sm:'0px', md:'0px', lg:'0px', xl:'0px', '2xl':'0px' } },
  { id:'slight',  name:'Levemente Arredondada',    values:{ xs:'2px', sm:'4px', md:'6px', lg:'8px', xl:'10px', '2xl':'12px' } },
  { id:'rounded', name:'Arredondada (Padr\u00e3o)',values:{ xs:'4px', sm:'6px', md:'8px', lg:'12px', xl:'16px', '2xl':'20px' } },
  { id:'rounder', name:'Bem Arredondada',          values:{ xs:'6px', sm:'10px', md:'14px', lg:'20px', xl:'24px', '2xl':'28px' } },
  { id:'pill',    name:'Pill / Bolha',             values:{ xs:'99px', sm:'99px', md:'99px', lg:'99px', xl:'99px', '2xl':'99px' } },
];

// ── Font sizes ────────────────────────────────────────────────────────────────
const FONT_SIZES = [
  { id:'small',  name:'Pequeno',               base:13 },
  { id:'medium', name:'M\u00e9dio (Padr\u00e3o)', base:14 },
  { id:'large',  name:'Grande',                base:15 },
  { id:'xlarge', name:'Extra Grande',          base:17 },
];

const STORAGE_KEY_THEME   = 'aer-theme';
const STORAGE_KEY_RADIUS  = 'aer-radius';
const STORAGE_KEY_FONT    = 'aer-font-size';
const STORAGE_KEY_ANIM    = 'aer-animations';
const STORAGE_KEY_CUSTOM  = 'aer-accent-custom';

export function applySettings() {
  const tid     = localStorage.getItem(STORAGE_KEY_THEME)  || 'dark-default';
  const rid     = localStorage.getItem(STORAGE_KEY_RADIUS) || 'rounded';
  const fid     = localStorage.getItem(STORAGE_KEY_FONT)   || 'medium';
  const noAnim  = localStorage.getItem(STORAGE_KEY_ANIM)   === 'off';
  const custom  = localStorage.getItem(STORAGE_KEY_CUSTOM);

  const theme  = THEMES.find(t => t.id === tid)  || THEMES[0];
  const radius = RADIUS_PRESETS.find(r => r.id === rid) || RADIUS_PRESETS[2];
  const font   = FONT_SIZES.find(f => f.id === fid) || FONT_SIZES[1];

  const root = document.documentElement;
  const c = theme.colors;

  root.style.setProperty('--color-accent',       custom || c.accent);
  root.style.setProperty('--color-bg-base',      c.bg);
  root.style.setProperty('--color-bg-surface-1', c.surface1);
  root.style.setProperty('--color-bg-surface-2', c.surface2);
  root.style.setProperty('--color-bg-surface-3', c.surface3);
  root.style.setProperty('--color-border-subtle',c.border);
  root.style.setProperty('--color-text-primary', c.textPrimary);
  root.style.setProperty('--color-text-secondary',c.textSecondary);
  root.style.setProperty('--color-text-muted',   c.textMuted);

  Object.entries(radius.values).forEach(([k,v]) => root.style.setProperty(`--radius-${k}`, v));

  const b = font.base;
  root.style.setProperty('--text-xs',   `${b-2}px`);
  root.style.setProperty('--text-sm',   `${b-1}px`);
  root.style.setProperty('--text-base', `${b}px`);
  root.style.setProperty('--text-lg',   `${b+2}px`);
  root.style.setProperty('--text-xl',   `${b+5}px`);
  root.style.setProperty('--text-2xl',  `${b+9}px`);

  if (noAnim) {
    root.style.setProperty('--transition-fast', 'none');
    root.style.setProperty('--transition-base', 'none');
  } else {
    root.style.setProperty('--transition-fast', 'all .12s ease');
    root.style.setProperty('--transition-base', 'all .2s ease');
  }
}

export async function mount(container) {
  Logger.info(MODULE, 'Montando Configura\u00e7\u00f5es...');
  injectStyles();

  const curTheme  = localStorage.getItem(STORAGE_KEY_THEME)  || 'dark-default';
  const curRadius = localStorage.getItem(STORAGE_KEY_RADIUS) || 'rounded';
  const curFont   = localStorage.getItem(STORAGE_KEY_FONT)   || 'medium';
  const curAnim   = localStorage.getItem(STORAGE_KEY_ANIM)   !== 'off';
  const curCustom = localStorage.getItem(STORAGE_KEY_CUSTOM) || '';

  container.innerHTML = `<div class="dash-root settings-page">
    <div class="dash-header"><div><h1 class="dash-title">Configura\u00e7\u00f5es</h1><p class="dash-subtitle">Personalize a apar\u00eancia do AeR ao seu gosto</p></div>
    <button id="cfg-reset" class="btn-secondary">\u21ba Restaurar Padr\u00e3o</button></div>

    <div class="cfg-section">
      <h2 class="cfg-section-title">\ud83c\udfa8 Tema</h2>
      <div class="cfg-themes-grid">
        ${THEMES.map(t=>`
        <button class="cfg-theme-card ${t.id===curTheme?'active':''}" data-tid="${t.id}" style="--prev-bg:${t.colors.bg};--prev-accent:${t.colors.accent};--prev-s1:${t.colors.surface1}">
          <div class="cfg-theme-preview">
            <div class="ctp-sidebar"></div>
            <div class="ctp-content"><div class="ctp-bar"></div><div class="ctp-bar ctp-bar-sm"></div></div>
          </div>
          <span class="cfg-theme-emoji">${t.emoji}</span>
          <span class="cfg-theme-name">${t.name}</span>
        </button>`).join('')}
      </div>
    </div>

    <div class="cfg-section">
      <h2 class="cfg-section-title">\ud83c\udfaf Cor de Destaque Personalizada</h2>
      <div class="cfg-custom-accent">
        <input type="color" id="cfg-accent-picker" value="${curCustom || '#d4b483'}" class="cfg-color-picker">
        <span class="cfg-accent-label">Cor atual: <span id="cfg-accent-val">${curCustom || 'Padr\u00e3o do tema'}</span></span>
        <button id="cfg-accent-clear" class="btn-secondary btn-sm">Usar cor do tema</button>
      </div>
    </div>

    <div class="cfg-section">
      <h2 class="cfg-section-title">\u2b1c Bordas</h2>
      <div class="cfg-radius-row">
        ${RADIUS_PRESETS.map(r=>`
        <button class="cfg-radius-btn ${r.id===curRadius?'active':''}" data-rid="${r.id}">
          <div class="cfg-radius-preview" style="border-radius:${r.values.xl}"></div>
          <span>${r.name}</span>
        </button>`).join('')}
      </div>
    </div>

    <div class="cfg-section">
      <h2 class="cfg-section-title">\ud83d\udd24 Tamanho do Texto</h2>
      <div class="cfg-font-row">
        ${FONT_SIZES.map(f=>`
        <button class="cfg-font-btn ${f.id===curFont?'active':''}" data-fid="${f.id}">
          <span class="cfg-font-sample" style="font-size:${f.base}px">Aa</span>
          <span>${f.name}</span>
        </button>`).join('')}
      </div>
    </div>

    <div class="cfg-section">
      <h2 class="cfg-section-title">\u26a1 Anima\u00e7\u00f5es</h2>
      <label class="cfg-toggle-row">
        <div class="cfg-toggle-info"><strong>Anima\u00e7\u00f5es de Transi\u00e7\u00e3o</strong><p>Desative para melhor performance</p></div>
        <div class="cfg-toggle-switch ${curAnim?'on':''}" id="cfg-anim-toggle"></div>
      </label>
    </div>
  </div>`;

  // ── Event Listeners ────────────────────────────────────────────────────────
  container.querySelectorAll('.cfg-theme-card').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cfg-theme-card').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem(STORAGE_KEY_THEME, btn.dataset.tid);
      applySettings();
    });
  });

  container.querySelectorAll('.cfg-radius-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cfg-radius-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem(STORAGE_KEY_RADIUS, btn.dataset.rid);
      applySettings();
    });
  });

  container.querySelectorAll('.cfg-font-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cfg-font-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      localStorage.setItem(STORAGE_KEY_FONT, btn.dataset.fid);
      applySettings();
    });
  });

  const animToggle = container.querySelector('#cfg-anim-toggle');
  animToggle.addEventListener('click', () => {
    const isOn = animToggle.classList.toggle('on');
    localStorage.setItem(STORAGE_KEY_ANIM, isOn ? 'on' : 'off');
    applySettings();
  });

  const picker = container.querySelector('#cfg-accent-picker');
  picker.addEventListener('input', () => {
    localStorage.setItem(STORAGE_KEY_CUSTOM, picker.value);
    container.querySelector('#cfg-accent-val').textContent = picker.value;
    applySettings();
  });

  container.querySelector('#cfg-accent-clear').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY_CUSTOM);
    picker.value = '#d4b483';
    container.querySelector('#cfg-accent-val').textContent = 'Padr\u00e3o do tema';
    applySettings();
  });

  container.querySelector('#cfg-reset').addEventListener('click', () => {
    if (!confirm('Restaurar todas as configura\u00e7\u00f5es para o padr\u00e3o?')) return;
    [STORAGE_KEY_THEME, STORAGE_KEY_RADIUS, STORAGE_KEY_FONT, STORAGE_KEY_ANIM, STORAGE_KEY_CUSTOM].forEach(k => localStorage.removeItem(k));
    applySettings();
    mount(container);
  });
}

export function unmount() {}

function injectStyles() {
  if (document.getElementById('cfg-styles')) return;
  const s = document.createElement('style'); s.id = 'cfg-styles';
  s.textContent = `.settings-page{display:flex;flex-direction:column;height:100%;overflow-y:auto;gap:0}
    .cfg-section{margin-bottom:var(--space-8);background:var(--color-bg-surface-1);border:1px solid var(--color-border-subtle);border-radius:var(--radius-xl);padding:var(--space-6)}
    .cfg-section-title{margin:0 0 var(--space-5) 0;font-size:var(--text-base);font-weight:600;color:var(--color-text-primary)}
    .cfg-themes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:var(--space-3)}
    .cfg-theme-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:var(--space-3);border:2px solid var(--color-border-subtle);border-radius:var(--radius-xl);cursor:pointer;background:var(--color-bg-surface-2);transition:var(--transition-base)}
    .cfg-theme-card:hover{border-color:var(--color-accent);transform:translateY(-2px)}
    .cfg-theme-card.active{border-color:var(--color-accent);background:rgba(255,255,255,.05)}
    .cfg-theme-preview{width:80px;height:50px;border-radius:8px;overflow:hidden;background:var(--prev-bg);display:flex;border:1px solid rgba(255,255,255,.1)}
    .ctp-sidebar{width:22px;background:var(--prev-s1);border-right:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .ctp-content{flex:1;padding:5px;display:flex;flex-direction:column;gap:3px}
    .ctp-bar{height:5px;border-radius:3px;background:var(--prev-accent);opacity:.8}
    .ctp-bar-sm{width:60%;opacity:.4}
    .cfg-theme-emoji{font-size:18px}.cfg-theme-name{font-size:11px;color:var(--color-text-secondary);text-align:center;line-height:1.3}
    .cfg-custom-accent{display:flex;align-items:center;gap:var(--space-4)}
    .cfg-color-picker{width:48px;height:48px;border:2px solid var(--color-border-subtle);border-radius:var(--radius-lg);cursor:pointer;background:none;padding:2px}
    .cfg-accent-label{font-size:var(--text-sm);color:var(--color-text-secondary)}#cfg-accent-val{color:var(--color-accent);font-weight:600}
    .cfg-radius-row{display:flex;flex-wrap:wrap;gap:var(--space-4)}
    .cfg-radius-btn{display:flex;flex-direction:column;align-items:center;gap:var(--space-2);padding:var(--space-4);border:2px solid var(--color-border-subtle);border-radius:var(--radius-lg);cursor:pointer;background:var(--color-bg-surface-2);min-width:100px;transition:var(--transition-base);color:var(--color-text-secondary);font-size:var(--text-xs)}
    .cfg-radius-btn:hover,.cfg-radius-btn.active{border-color:var(--color-accent);color:var(--color-text-primary)}
    .cfg-radius-preview{width:50px;height:30px;background:var(--color-accent);opacity:.7}
    .cfg-font-row{display:flex;flex-wrap:wrap;gap:var(--space-3)}
    .cfg-font-btn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:var(--space-4) var(--space-6);border:2px solid var(--color-border-subtle);border-radius:var(--radius-lg);cursor:pointer;background:var(--color-bg-surface-2);transition:var(--transition-base);color:var(--color-text-secondary)}
    .cfg-font-btn:hover,.cfg-font-btn.active{border-color:var(--color-accent);color:var(--color-text-primary)}
    .cfg-font-sample{font-weight:700;color:var(--color-accent)}
    .cfg-toggle-row{display:flex;align-items:center;cursor:pointer}
    .cfg-toggle-info{flex:1}.cfg-toggle-info strong{color:var(--color-text-primary)}.cfg-toggle-info p{margin:4px 0 0;font-size:var(--text-sm);color:var(--color-text-muted)}
    .cfg-toggle-switch{width:48px;height:26px;border-radius:99px;background:var(--color-bg-surface-3);border:2px solid var(--color-border-subtle);position:relative;transition:var(--transition-base);cursor:pointer;flex-shrink:0}
    .cfg-toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--color-text-muted);transition:var(--transition-base)}
    .cfg-toggle-switch.on{background:var(--color-accent);border-color:var(--color-accent)}.cfg-toggle-switch.on::after{left:calc(100% - 22px);background:#000}`;
  document.head.appendChild(s);
}
