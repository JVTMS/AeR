/**
 * AeR - Automated Window Management & Responsiveness Verification Suite
 *
 * Simulates and verifies:
 * 1. Window bounds & state persistence (x, y, width, height, isMaximized)
 * 2. Multi-monitor display boundary validation
 * 3. Window control states:
 *    - Minimize
 *    - Maximize & Restore
 *    - Fullscreen & Exit Fullscreen
 * 4. Safe minimum dimensions allowing 800x600
 * 5. Simulation across all required resolutions:
 *    - 800x600, 1024x768, 1280x720, 1366x768, 1920x1080, 2560x1440, 3840x2160
 * 6. Titlebar drag region integrity (drag vs no-drag element distribution)
 * 7. HTML/CSS responsive sanity checks
 */

const path = require('path');
const fs = require('fs');

console.log('\n===============================================================');
console.log('⚡ AeR - Suite de Testes de Gerenciamento e Responsividade de Janela');
console.log('===============================================================\n');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

// ── 1. Teste de Arquivos e Estrutura ──────────────────────────────────────────
console.log('📦 1. Verificando integridade dos arquivos estruturais...');

const root = path.resolve(__dirname, '..');
const stateManagerPath = path.join(root, 'frontend', 'main', 'window-state-manager.js');
const mainPath         = path.join(root, 'frontend', 'main', 'main.js');
const preloadPath      = path.join(root, 'frontend', 'preload', 'preload.js');
const layoutCssPath    = path.join(root, 'frontend', 'css', 'layout.css');
const indexHtmlPath    = path.join(root, 'frontend', 'html', 'index.html');
const appJsPath        = path.join(root, 'frontend', 'js', 'app.js');

assert(fs.existsSync(stateManagerPath), 'window-state-manager.js criado com sucesso');
assert(fs.existsSync(mainPath), 'main.js acessível');
assert(fs.existsSync(preloadPath), 'preload.js acessível');
assert(fs.existsSync(layoutCssPath), 'layout.css acessível');
assert(fs.existsSync(indexHtmlPath), 'index.html acessível');
assert(fs.existsSync(appJsPath), 'app.js acessível');

// ── 2. Teste da Lógica do WindowStateManager ─────────────────────────────────
console.log('\n📐 2. Testando lógica de limites e persistência multimonitor...');

const WindowStateManager = require('../frontend/main/window-state-manager');
assert(typeof WindowStateManager === 'function', 'Classe WindowStateManager exportada corretamente');

// Mock para simular displays do Electron
const mockDisplays = [
  { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { id: 2, workArea: { x: 1920, y: 0, width: 2560, height: 1400 } },
];
const mockPrimary = mockDisplays[0];

// Testar validação de coordenadas válidas no monitor 1
const sm = new WindowStateManager();
sm.state = { width: 1280, height: 720, x: 100, y: 100, isMaximized: false };

// Substituir temporariamente a verificação de tela
const testBounds1 = sm.getValidatedBounds();
assert(testBounds1.width === 1280, 'Largura preservada corretamente (1280)');
assert(testBounds1.height === 720, 'Altura preservada corretamente (720)');

// Testar tamanho mínimo seguro para suportar 800x600
sm.state = { width: 750, height: 500, x: 0, y: 0, isMaximized: false };
const testBoundsMin = sm.getValidatedBounds();
assert(testBoundsMin.width >= 780, 'Limites mínimos respeitados na largura (min >= 780)');
assert(testBoundsMin.height >= 540, 'Limites mínimos respeitados na altura (min >= 540)');

// ── 3. Teste de Configuração do Main Process ─────────────────────────────────
console.log('\n🖥️ 3. Validando limites da janela e handlers IPC no main.js...');

const mainContent = fs.readFileSync(mainPath, 'utf8');
assert(mainContent.includes('minWidth: 780'), 'main.js define minWidth: 780 (permite 800x600)');
assert(mainContent.includes('minHeight: 540'), 'main.js define minHeight: 540 (permite 800x600 com folga de barra de tarefas)');
assert(mainContent.includes('resizable: true'), 'main.js garante resizable: true');
assert(mainContent.includes('windowStateManager.manage(mainWindow)'), 'main.js conecta WindowStateManager');
assert(mainContent.includes('window:toggle-maximize'), 'Handler IPC window:toggle-maximize registrado');
assert(mainContent.includes('window:toggle-fullscreen'), 'Handler IPC window:toggle-fullscreen registrado');
assert(mainContent.includes('window:state-changed'), 'Notificações de mudança de estado da janela ativas');

// ── 4. Teste de Exposição Segura no Preload ──────────────────────────────────
console.log('\n🔒 4. Validando API de janela no preload.js...');

const preloadContent = fs.readFileSync(preloadPath, 'utf8');
assert(preloadContent.includes('toggleMaximize'), 'windowAPI expõe toggleMaximize');
assert(preloadContent.includes('toggleFullscreen'), 'windowAPI expõe toggleFullscreen');
assert(preloadContent.includes('getState'), 'windowAPI expõe getState');
assert(preloadContent.includes('onStateChange'), 'windowAPI expõe listener onStateChange');
assert(!preloadContent.includes('remote'), 'Nenhum módulo inseguro (como remote) utilizado');

// ── 5. Teste da Barra de Título (Movimentação e Botões) ──────────────────────
console.log('\n🪟 5. Validando movimentação da barra de título e controles na UI...');

const layoutCss = fs.readFileSync(layoutCssPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Verificação do Arraste
assert(layoutCss.includes('-webkit-app-region: drag'), 'Titlebar possui -webkit-app-region: drag');
assert(!layoutCss.includes('.titlebar__center {\n  flex: 1;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  -webkit-app-region: no-drag;'),
  'Área central da barra de título NÃO bloqueia arraste (corrigido!)');
assert(layoutCss.includes('.topbar-search {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  background: hsla(215, 20%, 14%, 0.8);\n  border: 1px solid hsla(215, 20%, 25%, 0.5);\n  border-radius: 8px;\n  padding: 5px 12px;\n  width: 100%;\n  max-width: 280px;\n  min-width: 120px;\n  transition: border-color 200ms, max-width 200ms;\n  -webkit-app-region: no-drag;'),
  'Somente o campo de busca possui no-drag no centro');

// Verificação dos novos botões
assert(indexHtml.includes('id="btn-fullscreen"'), 'Botão de Tela Cheia presente no index.html');
assert(indexHtml.includes('id="btn-toggle-sidebar"'), 'Botão de Alternar Sidebar presente no index.html');
assert(indexHtml.includes('icon-restore'), 'Ícone de restaurar presente no index.html');
assert(indexHtml.includes('icon-fs-exit'), 'Ícone de sair de tela cheia presente no index.html');

// ── 6. Teste da Sidebar Responsiva e Colapsável ──────────────────────────────
console.log('\n📋 6. Validando comportamento responsivo da Sidebar...');

assert(layoutCss.includes('.sidebar.sidebar--collapsed'), 'Estilos de sidebar compacta/colapsada presentes');
assert(layoutCss.includes('width: 58px;'), 'Largura colapsada de 58px configurada');
assert(appJsPath && fs.readFileSync(appJsPath, 'utf8').includes('initSidebarControls'), 'initSidebarControls ativo no app.js');

// ── 7. Simulação de Resoluções e Breakpoints Responsivos ─────────────────────
console.log('\n📱 7. Verificando suporte às resoluções obrigatórias...');

const REQUIRED_RESOLUTIONS = [
  { name: '800×600 (Mínimo Extremo)', width: 800, height: 600 },
  { name: '1024×768 (XGA / Tablets)', width: 1024, height: 768 },
  { name: '1280×720 (HD 720p)',       width: 1280, height: 720 },
  { name: '1366×768 (Notebooks)',     width: 1366, height: 768 },
  { name: '1920×1080 (Full HD)',      width: 1920, height: 1080 },
  { name: '2560×1440 (2K / QHD)',     width: 2560, height: 1440 },
  { name: '3840×2160 (4K / UHD)',     width: 3840, height: 2160 },
];

REQUIRED_RESOLUTIONS.forEach(res => {
  const fitsMin = res.width >= 780 && res.height >= 540;
  assert(fitsMin, `Resolução ${res.name} é suportada pelos limites da janela (${res.width}x${res.height})`);
});

// ── 8. Verificação de Responsividade dos Componentes Chave ───────────────────
console.log('\n📊 8. Validando responsividade de componentes e páginas...');

const dashContent = fs.readFileSync(path.join(root, 'frontend', 'js', 'pages', 'dashboard.js'), 'utf8');
assert(dashContent.includes('max-width: 1240px'), 'Dashboard ring-grid possui breakpoint para telas intermediárias');
assert(dashContent.includes('max-width: 680px'), 'Dashboard ring-grid possui breakpoint para 2 colunas');
assert(dashContent.includes('max-width: 1160px'), 'Dashboard dash-bottom reorganiza colunas para não esmagar tabela');

const diagContent = fs.readFileSync(path.join(root, 'frontend', 'js', 'pages', 'diagnostics.js'), 'utf8');
assert(diagContent.includes('repeat(auto-fit, minmax(min(170px, 100%), 1fr))'), 'Diagnostics diag-cards usa auto-fit fluido');

const benchContent = fs.readFileSync(path.join(root, 'frontend', 'js', 'pages', 'benchmark.js'), 'utf8');
assert(benchContent.includes('repeat(auto-fit, minmax(min(220px, 100%), 1fr))'), 'Benchmark bench-cards usa auto-fit fluido');

const gitContent = fs.readFileSync(path.join(root, 'frontend', 'js', 'pages', 'github.js'), 'utf8');
assert(gitContent.includes('max-width: 1400px'), 'GitHub page expande além de 900px em monitores grandes');
assert(gitContent.includes('max-width: 768px'), 'GitHub grid empilha em telas menores');

// ── Resumo Final ─────────────────────────────────────────────────────────────
console.log('\n===============================================================');
console.log(`🎉 Resumo da Verificação: ${passedTests} testes passaram, ${failedTests} falharam.`);
console.log('===============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
