/**
 * AeR — Stub Page
 * Placeholder para módulos ainda em desenvolvimento.
 */

export async function mount(container) {
  const pageName = document.querySelector('.nav-item--active')?.textContent?.trim() || 'Módulo';
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:20px;color:hsl(210,12%,50%);">
      <div style="
        width:72px;height:72px;border-radius:18px;
        background:hsl(228,18%,14%);
        border:1px solid hsla(215,20%,22%,0.8);
        display:flex;align-items:center;justify-content:center;
        font-size:28px;
      ">🚧</div>
      <div>
        <div style="font-size:17px;font-weight:600;color:hsl(210,18%,80%);text-align:center;">${pageName}</div>
        <div style="font-size:12px;margin-top:6px;text-align:center;">Este módulo está em desenvolvimento</div>
      </div>
      <div style="
        background:hsl(228,18%,13%);border:1px solid hsla(215,20%,20%,0.6);
        border-radius:8px;padding:10px 18px;font-size:11px;
        font-family:'JetBrains Mono',monospace;color:hsl(195,100%,60%);
      ">Disponível no Passo 4+</div>
    </div>
  `;
}

export function unmount() {}
