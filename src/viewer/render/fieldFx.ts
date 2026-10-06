import { viewerClock } from "../clock";
import type { ViewerFieldEffects } from "../fieldEffects";
import { EffectPresenter } from "./effectPresenter";

export function spawnFieldFx(
  content: HTMLElement,
  xPx: number,
  yPx: number,
  type: "grass" | "dust" | "ripple" | "sand" | "tire",
  onDispose?: () => void
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const fx = document.createElement("div");
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; for (const timer of timers) { clearTimeout(timer); clearInterval(timer); } fx.remove(); onDispose?.(); };
  fx.className = "field-fx";
  fx.style.left = `${xPx}px`;

  // M12: grass/dust/ripple present through EffectPresenter from templates;
  // this legacy path stays for sand/tire only (M13).
  if (type === "sand") {
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
  return dispose;
}

/** M12 presenter: template frames, sizes, order, durations and flips driven by viewerClock. */
export function installFieldFxRenderer(effects: ViewerFieldEffects, content: HTMLElement, minX: number, minY: number): () => void {
  const active = new Map<number, EffectPresenter>();
  const remove = (id: number) => { active.get(id)?.dispose(); active.delete(id); };
  const unsubClock = viewerClock.subscribe(() => { for (const p of [...active.values()]) p.tick(); });
  const unsubscribe = effects.subscribe(event => {
    if (event.type === "clear") { for (const id of [...active.keys()]) remove(id); return; }
    if (event.type === "release") { active.get(event.id)?.release(); active.delete(event.id); return; }
    const presenter = new EffectPresenter(event, content, minX, minY, () => active.delete(event.id));
    if (presenter.lastError) return;
    active.set(event.id, presenter);
  });
  return () => { unsubscribe(); unsubClock(); for (const id of [...active.keys()]) remove(id); };
}
