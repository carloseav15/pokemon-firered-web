import { viewerClock, type ViewerClock } from "../clock";
import type { ViewerFieldEffects } from "../fieldEffects";
import { EffectPresenter } from "./effectPresenter";

/** Ground effect presenter: template frames, sizes, order, durations and flips driven by viewerClock. */
export function installFieldFxRenderer(effects: ViewerFieldEffects, content: HTMLElement, minX: number, minY: number, clock: ViewerClock = viewerClock): () => void {
  const active = new Map<number, EffectPresenter>();
  const remove = (id: number) => { active.get(id)?.dispose(); active.delete(id); };
  const unsubClock = clock.subscribe(() => { for (const p of [...active.values()]) p.tick(); });
  const unsubscribe = effects.subscribe(event => {
    if (event.type === "clear") { for (const id of [...active.keys()]) remove(id); return; }
    if (event.type === "release") { active.get(event.id)?.release(); return; }
    const presenter = new EffectPresenter(event, content, minX, minY, () => active.delete(event.id));
    if (presenter.lastError) return;
    active.set(event.id, presenter);
  });
  return () => { unsubscribe(); unsubClock(); for (const id of [...active.keys()]) remove(id); };
}
