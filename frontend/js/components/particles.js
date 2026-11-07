/**
 * AeR — Particles (Componente)
 * Partículas flutuantes decorativas no fundo da tela.
 * Ultra-leve: usa CSS animations, sem Canvas ou WebGL.
 */

/**
 * Número pseudo-aleatório para uso EXCLUSIVAMENTE visual (posição, tamanho,
 * duração de animação de partículas decorativas). Não criptográfico — não usar
 * para tokens, autenticação ou qualquer contexto de segurança.
 * @returns {number} valor em [0, 1)
 */
function visualRand() {
  return Math.random();
}

export function initParticles(container) {
  const colors = [
    'hsl(195, 100%, 60%)',  // Ciano
    'hsl(265, 80%, 65%)',   // Violeta
    'hsl(145, 70%, 55%)',   // Verde
  ];

  const count = 18;
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    const size     = visualRand() * 3 + 1;                          // tamanho visual
    const color    = colors[Math.floor(visualRand() * colors.length)]; // cor visual
    const left     = visualRand() * 100;                            // posição horizontal
    const duration = visualRand() * 10 + 8;                         // duração da animação
    const delay    = visualRand() * 8;                              // delay da animação

    el.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${left}%;
      background: ${color};
      box-shadow: 0 0 ${size * 3}px ${color};
      --duration: ${duration}s;
      --delay: ${delay}s;
    `;
    fragment.appendChild(el);
  }

  container.appendChild(fragment);
}
