import { viewerClock } from "../clock";
import type { ViewerFieldEffects } from "../fieldEffects";
import { TILE } from "../constants";

export function spawnFieldFx(
  content: HTMLElement,
  xPx: number,
  yPx: number,
  type: "grass" | "dust" | "ripple" | "sand" | "tire",
  onDispose?: () => void
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const fx = document.createElement("div");
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; unsubscribe?.(); for (const timer of timers) { clearTimeout(timer); clearInterval(timer); } fx.remove(); onDispose?.(); };
  fx.className = "field-fx";
  fx.style.left = `${xPx}px`;

  if (type === "grass") {
    fx.style.top = `${yPx + 2}px`;
    fx.style.width = "16px";
    fx.style.height = "16px";
    fx.style.backgroundImage = "url(/fr/fieldfx/tallgrass__ette1.png)";
    fx.style.backgroundPosition = "0px 0px";
    content.appendChild(fx);

  } else if (type === "dust") {
    fx.style.top = `${yPx + 8}px`;
    fx.style.width = "16px";
    fx.style.height = "8px";
    fx.style.backgroundImage = "url(/fr/fieldfx/groundimpactdust__ette0.png)";
    fx.style.backgroundPosition = "0px 0px";
    content.appendChild(fx);

  } else if (type === "ripple") {
    fx.style.top = `${yPx + 4}px`;
    fx.style.width = "16px";
    fx.style.height = "16px";
    fx.style.backgroundImage = "url(/fr/fieldfx/ripple__ette1.png)";
    fx.style.backgroundPosition = "0px 0px";
    content.appendChild(fx);

  } else if (type === "sand") {
    fx.style.top = `${yPx + 8}px`;
    fx.style.width = "16px";
    fx.style.height = "8px";
    fx.style.backgroundImage = "url(/fr/fieldfx/sandfootprints__ette0.png)";
    fx.style.backgroundPosition = "0px 0px";
    fx.style.opacity = "0.7";
    content.appendChild(fx);
    timers.push(setTimeout(() => {
      fx.style.transition = "opacity 0.6s ease-out";
      fx.style.opacity = "0";
      timers.push(setTimeout(dispose, 600));
    }, 1200));
  } else if (type === "tire") {
    fx.style.top = `${yPx + 8}px`;
    fx.style.width = "16px";
    fx.style.height = "8px";
    fx.style.backgroundImage = "url(/fr/fieldfx/biketiretracks__ette0.png)";
    fx.style.backgroundPosition = "0px 0px";
    fx.style.opacity = "0.7";
    content.appendChild(fx);
    timers.push(setTimeout(() => {
      fx.style.transition = "opacity 0.6s ease-out";
      fx.style.opacity = "0";
      timers.push(setTimeout(dispose, 600));
    }, 1200));
  }
  if (type === "grass" || type === "dust" || type === "ripple") {
    const start = viewerClock.elapsedMs;
    const delay = type === "grass" ? 50 : type === "dust" ? 60 : 70;
    const count = type === "dust" ? 3 : 5;
    const height = type === "dust" ? 8 : 16;
    unsubscribe = viewerClock.subscribe(frame => {
      const f = Math.floor((frame.elapsedMs - start) / delay);
      if (f >= count) dispose();
      else fx.style.backgroundPosition = `0px -${f * height}px`;
    });
  }
  return dispose;
}

/** Temporary M12 consumer, preserving the old presentation until Muse replaces it. */
export function installFieldFxRenderer(effects: ViewerFieldEffects, content: HTMLElement, minX: number, minY: number): () => void {
  const active = new Map<number, () => void>();
  const clear = () => { for (const dispose of active.values()) dispose(); active.clear(); };
  const unsubscribe = effects.subscribe(event => {
    if (event.type === "clear") { clear(); return; }
    if (event.type === "release") { active.get(event.id)?.(); active.delete(event.id); return; }
    const type = event.template.name === "TallGrass" ? "grass" : event.template.name === "Ripple" ? "ripple" : "dust";
    // Legacy spawn adds its own offset. Use the canonical world top-left from the event.
    const legacyOffset = type === "grass" ? 2 : type === "ripple" ? 4 : 8;
    const dispose = spawnFieldFx(content, event.position.xPx - minX * TILE, event.position.yPx - minY * TILE - legacyOffset, type, () => active.delete(event.id));
    const node = content.lastElementChild as HTMLElement;
    node.dataset.effectId = String(event.id);
    node.dataset.effectGeneration = String(event.generation);
    node.style.zIndex = String(event.priority.domZIndex);
    active.set(event.id, dispose);
  });
  return () => { unsubscribe(); clear(); };
}
