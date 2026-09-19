/**
 * AeR — Particles (Componente)
 * Partículas flutuantes decorativas no fundo da tela.
 * Ultra-leve: usa CSS animations, sem Canvas ou WebGL.
 */

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
    const size = Math.random() * 3 + 1;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = Math.random() * 10 + 8;
    const delay = Math.random() * 8;

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
