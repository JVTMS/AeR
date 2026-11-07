/**
 * AeR — Splash Screen Controller
 * Gerencia animação e fechamento da splash de inicialização.
 * Arquivo externo para contornar a CSP que bloqueia scripts inline.
 */

(function () {
  var bar    = document.getElementById('splash-bar');
  var status = document.getElementById('splash-status');
  var pCont  = document.getElementById('splash-particles');

  if (!bar || !status) return; // splash não existe

  /**
   * Número pseudo-aleatório para uso EXCLUSIVAMENTE visual (posição e temporização
   * de partículas decorativas da splash screen). Não criptográfico.
   * @returns {number} valor em [0, 1)
   */
  function visualRand() {
    return Math.random();
  }

  // Gerar partículas flutuantes
  for (var i = 0; i < 18; i++) {
    var p = document.createElement('div');
    p.className = 'splash-particle';
    p.style.left              = (visualRand() * 100) + '%';        // posição horizontal
    p.style.animationDuration = (4 + visualRand() * 8) + 's';     // duração da animação
    p.style.animationDelay    = (visualRand() * 6) + 's';         // delay da animação
    p.style.setProperty('--drift', ((visualRand() - 0.5) * 80) + 'px'); // deriva horizontal
    p.style.opacity           = String(0.3 + visualRand() * 0.7); // opacidade visual
    if (pCont) pCont.appendChild(p);
  }

  // Sequência de progresso automática
  var steps = [
    { pct: 15, msg: 'Carregando interface...',   delay: 150  },
    { pct: 35, msg: 'Iniciando servi\u00e7os...', delay: 600  },
    { pct: 60, msg: 'Conectando ao backend...',  delay: 1400 },
    { pct: 80, msg: 'Verificando sistema...',    delay: 2400 },
  ];

  steps.forEach(function (s) {
    setTimeout(function () {
      if (bar)    bar.style.width    = s.pct + '%';
      if (status) status.textContent = s.msg;
    }, s.delay);
  });

  // Expõe função global para app.js fechar a splash
  window.__splashDone = function (callback) {
    if (bar)    bar.style.width    = '100%';
    if (status) status.textContent = 'Pronto!';

    setTimeout(function () {
      var splash = document.getElementById('aer-splash');
      if (splash) {
        splash.classList.add('hidden');
        setTimeout(function () {
          if (splash.parentNode) splash.parentNode.removeChild(splash);
          if (typeof callback === 'function') callback();
        }, 600);
      }
    }, 300);
  };
})();
