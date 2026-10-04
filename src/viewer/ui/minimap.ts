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
  const scaleX = mw / worldW;
  const scaleY = mh / worldH;

  // Dibujar silueta de mapas de Kanto en el minimapa
  mctx.fillStyle = "#18181b";
  mctx.fillRect(0, 0, mw, mh);
  mctx.fillStyle = "#065f46"; // Tierras / rutas
  for (const m of Object.values(index.maps)) {
    const rx = (m.x - minX) * scaleX;
    const ry = (m.y - minY) * scaleY;
    const rw = Math.max(1, m.width * scaleX);
    const rh = Math.max(1, m.height * scaleY);
    mctx.fillRect(rx, ry, rw, rh);
  }

  const playerDot = document.getElementById("minimap-player-dot");

  const updateRadar = () => {
    const zoom = getZoom();
    const worldPxW = worldW * TILE;
    const worldPxH = worldH * TILE;
    const vx = viewport.scrollLeft / zoom / worldPxW;
    const vy = viewport.scrollTop / zoom / worldPxH;
    const vw = viewport.clientWidth / zoom / worldPxW;
    const vh = viewport.clientHeight / zoom / worldPxH;

    minimapBox.style.left = `${Math.max(0, Math.min(mw, vx * mw))}px`;
    minimapBox.style.top = `${Math.max(0, Math.min(mh, vy * mh))}px`;
    minimapBox.style.width = `${Math.max(4, Math.min(mw, vw * mw))}px`;
    minimapBox.style.height = `${Math.max(4, Math.min(mh, vh * mh))}px`;

    if (playerDot) {
      const p = getExplorePos ? getExplorePos() : { active: false, x: 0, y: 0 };
      if (p.active) {
        playerDot.style.display = "block";
        const px = (p.x - minX) * scaleX;
        const py = (p.y - minY) * scaleY;
        playerDot.style.left = `${px}px`;
        playerDot.style.top = `${py}px`;
      } else {
        playerDot.style.display = "none";
      }
    }
  };

  viewport.addEventListener("scroll", updateRadar);
  updateRadar();

  const navigateMini = (e: MouseEvent) => {
    const zoom = getZoom();
    const rect = minimapCanvasWrap.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    viewport.scrollLeft = clickX * (worldW * TILE) * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = clickY * (worldH * TILE) * zoom - viewport.clientHeight / 2;
    onNavigate();
    updateRadar();
  };

  let miniDragging = false;
  minimapCanvasWrap.addEventListener("mousedown", (e) => {
    miniDragging = true;
    navigateMini(e);
  });
  window.addEventListener("mousemove", (e) => {
    if (miniDragging) navigateMini(e);
  });
  window.addEventListener("mouseup", () => {
    miniDragging = false;
  });

  return { updateRadar };
}
