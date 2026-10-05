import { TILE } from "../constants";
import type { KantoIndex } from "../types";

export type MinimapController = {
  updateRadar: () => void;
};

export function setupMinimap(
  index: KantoIndex,
  minX: number,
  minY: number,
  viewport: HTMLElement,
  getZoom: () => number,
  onNavigate: () => void,
  getExplorePos?: () => { active: boolean; x: number; y: number }
): MinimapController | null {
  const minimapCanvas = document.getElementById("minimap-canvas") as HTMLCanvasElement | null;
  const minimapBox = document.getElementById("minimap-viewbox");
  const minimapCanvasWrap = document.getElementById("minimap-canvas-wrap");
  if (!minimapCanvas || !minimapBox || !minimapCanvasWrap || !index) return null;

  const mctx = minimapCanvas.getContext("2d")!;
  const mw = minimapCanvas.width;
  const mh = minimapCanvas.height;
  const worldW = index.world.width;
  const worldH = index.world.height;

  // Área navegable con teclado: foco y nombre accesible.
  minimapCanvasWrap.tabIndex = 0;
  minimapCanvasWrap.setAttribute("role", "group");
  minimapCanvasWrap.setAttribute(
    "aria-label",
    "Minimapa: usa las flechas del teclado para desplazar la cámara"
  );

  // Paso estable de teclado, expresado en casillas del mundo.
  const KEY_STEP_TILES = 8;

  // Escala uniforme del mundo dentro del canvas, con márgenes centrados.
  // Una sola transformación para dibujo, viewbox, jugador y navegación.
  const view = () => {
    const scale = Math.min(mw / worldW, mh / worldH);
    return {
      scale,
      offX: (mw - worldW * scale) / 2,
      offY: (mh - worldH * scale) / 2,
    };
  };
  const toMini = (wx: number, wy: number) => {
    const v = view();
    return { x: v.offX + (wx - minX) * v.scale, y: v.offY + (wy - minY) * v.scale };
  };

  // Dibujar silueta de mapas de Kanto en el minimapa
  const drawMaps = () => {
    const v = view();
    mctx.fillStyle = "#18181b";
    mctx.fillRect(0, 0, mw, mh);
    mctx.fillStyle = "#065f46"; // Tierras / rutas
    for (const m of Object.values(index.maps)) {
      const p = toMini(m.x, m.y);
      const rw = Math.max(1, m.width * v.scale);
      const rh = Math.max(1, m.height * v.scale);
      mctx.fillRect(p.x, p.y, rw, rh);
    }
  };
  drawMaps();

  const playerDot = document.getElementById("minimap-player-dot");

  const updateRadar = () => {
    // R3: los indicadores son hermanos del canvas posicionados respecto al wrap,
    // así que van en píxeles CSS, no en píxeles del buffer interno.
    const rect = minimapCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const kx = rect.width / mw;
    const ky = rect.height / mh;
    const v0 = view();
    const zoom = getZoom();
    const worldPxW = worldW * TILE;
    const worldPxH = worldH * TILE;
    // Esquinas del viewport visible, en coordenadas de mundo (metatiles).
    const x0 = minX + viewport.scrollLeft / zoom / TILE;
    const y0 = minY + viewport.scrollTop / zoom / TILE;
    const x1 = minX + (viewport.scrollLeft + viewport.clientWidth) / zoom / TILE;
    const y1 = minY + (viewport.scrollTop + viewport.clientHeight) / zoom / TILE;
    const a = toMini(x0, y0);
    const b = toMini(x1, y1);

    // Recortar el viewbox al rectángulo útil del mundo, no a todo el canvas con márgenes.
    const ux = v0.offX * kx;
    const uy = v0.offY * ky;
    const uw = worldW * v0.scale * kx;
    const uh = worldH * v0.scale * ky;
    const bw = Math.max(4, Math.min(uw, (b.x - a.x) * kx));
    const bh = Math.max(4, Math.min(uh, (b.y - a.y) * ky));
    minimapBox.style.left = `${Math.max(ux, Math.min(ux + uw - bw, a.x * kx))}px`;
    minimapBox.style.top = `${Math.max(uy, Math.min(uy + uh - bh, a.y * ky))}px`;
    minimapBox.style.width = `${bw}px`;
    minimapBox.style.height = `${bh}px`;

    if (playerDot) {
      const p = getExplorePos ? getExplorePos() : { active: false, x: 0, y: 0 };
      if (p.active) {
        playerDot.style.display = "block";
        const px = toMini(p.x, p.y);
        playerDot.style.left = `${px.x * kx}px`;
        playerDot.style.top = `${px.y * ky}px`;
      } else {
        playerDot.style.display = "none";
      }
    }
  };

  viewport.addEventListener("scroll", updateRadar);
  updateRadar();

  // Seguir cambios de tamaño del viewport (p. ej. colapso del panel) y del
  // propio minimapa (resize, reaparición tras ocultar el radar) sin tocar main.ts.
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      drawMaps();
      updateRadar();
    });
    ro.observe(viewport);
    ro.observe(minimapCanvasWrap);
  }

  // Teclado solo con foco dentro del minimapa: no capturar teclas fuera de él.
  minimapCanvasWrap.addEventListener("keydown", (e) => {
    const step = KEY_STEP_TILES * TILE * getZoom();
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    // Impedir scroll de página y que la tecla llegue al movimiento del protagonista.
    e.preventDefault();
    e.stopPropagation();
    viewport.scrollLeft += dx;
    viewport.scrollTop += dy;
    onNavigate();
    updateRadar();
  });

  const miniPoint = (clientX: number, clientY: number) => {
    const rect = minimapCanvas.getBoundingClientRect();
    // De píxeles CSS a píxeles del canvas (misma transformación para navegar).
    const mx = ((clientX - rect.left) / rect.width) * mw;
    const my = ((clientY - rect.top) / rect.height) * mh;
    const v = view();
    // Recortar al rectángulo útil del mundo.
    const cx = Math.max(v.offX, Math.min(v.offX + worldW * v.scale, mx));
    const cy = Math.max(v.offY, Math.min(v.offY + worldH * v.scale, my));
    return {
      wx: minX + (cx - v.offX) / v.scale,
      wy: minY + (cy - v.offY) / v.scale,
    };
  };

  const navigateMini = (clientX: number, clientY: number) => {
    const zoom = getZoom();
    const { wx, wy } = miniPoint(clientX, clientY);
    viewport.scrollLeft = (wx - minX) * TILE * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = (wy - minY) * TILE * zoom - viewport.clientHeight / 2;
    onNavigate();
    updateRadar();
  };

  let dragPointerId: number | null = null;
  const endDrag = () => {
    dragPointerId = null;
  };

  minimapCanvasWrap.style.touchAction = "none";
  minimapCanvasWrap.addEventListener("pointerdown", (e) => {
    // Solo puntero primario/botón principal; un segundo dedo no sustituye el arrastre.
    if (dragPointerId !== null) return;
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragPointerId = e.pointerId;
    try {
      minimapCanvasWrap.setPointerCapture(e.pointerId);
    } catch {
      // Sin captura: el arrastre sigue hasta pointerup/cancel en el wrap.
    }
    navigateMini(e.clientX, e.clientY);
  });
  minimapCanvasWrap.addEventListener("pointermove", (e) => {
    if (dragPointerId !== e.pointerId) return;
    navigateMini(e.clientX, e.clientY);
  });
  minimapCanvasWrap.addEventListener("pointerup", (e) => {
    if (dragPointerId !== e.pointerId) return;
    try {
      if (minimapCanvasWrap.hasPointerCapture(e.pointerId)) {
        minimapCanvasWrap.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Liberación no disponible; basta con terminar el arrastre.
    }
    endDrag();
  });
  minimapCanvasWrap.addEventListener("pointercancel", (e) => {
    if (dragPointerId !== e.pointerId) return;
    endDrag();
  });
  minimapCanvasWrap.addEventListener("lostpointercapture", (e) => {
    if (dragPointerId !== e.pointerId) return;
    endDrag();
  });

  return { updateRadar };
}
