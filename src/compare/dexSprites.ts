// Sprites de otras fuentes para la ficha del dex (public/sprites/, generado por tools/viewer/sprite_sources.py):
// PMD Red, pokeemerald-expansion, Platinum y HeartGold. Los elementos de PMD se componen en un canvas con las
// animaciones y direcciones del C; el resto son imágenes o hojas de dos fotogramas.

type Item = {
  label: string;
  url?: string;
  w?: number;
  h?: number;
  n?: number;
  axis?: "x" | "y";
  fw?: number;
  fh?: number;
  kind?: "pmd" | "frames" | "portraits";
  cols?: number;
  cell?: number | [number, number];
  emotions?: string[];
  anims?: number | { name: string; seq: number[][] }[];
  shiny?: string;
  data?: string;
  atlas?: string;
};
export type SpriteIndex = { names?: Record<string, string>; sources: Record<string, { label: string; repo: string; commit: string; species: number }>; species: Record<string, Record<string, Item[]>> };
type PmdAnim = { id: number; seq: number[][][]; dirs: number[] };
type PmdData = { atlas: string; cw: number; ch: number; cols: number; cells: number; pad: number; anims: PmdAnim[] };

const SOURCE_ORDER = ["pmd-red", "pmd-sky", "emerald-expansion", "crystal", "platinum", "heartgold"];
const TICK_MS = 1000 / 60;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let indexPromise: Promise<SpriteIndex | null> | null = null;
export function loadSpriteIndex(): Promise<SpriteIndex | null> {
  indexPromise ??= fetch("/sprites/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<SpriteIndex>) : null))
    .catch(() => null);
  return indexPromise;
}

function itemHtml(it: Item): string {
  if (it.kind === "portraits") {
    const k = 2;
    const cell = it.cell as number;
    const cols = it.cols!;
    const cells = it.emotions!.map((e, i) => {
      const x = (i % cols) * cell * k;
      const y = Math.floor(i / cols) * cell * k;
      return `<figure class="pt"><div style="width:${cell * k}px;height:${cell * k}px;background:url(${it.url}) -${x}px -${y}px/${it.w! * k}px ${it.h! * k}px"></div><figcaption>${esc(e)}</figcaption></figure>`;
    });
    return `<div class="portraits"><div class="none">${esc(it.label)}</div><div class="pgrid">${cells.join("")}</div></div>`;
  }
  if (it.kind === "frames") {
    const k = Math.max(1, Math.round(120 / Math.max(it.fw!, it.fh!)));
    const anims = (it.anims as { name: string; seq: number[][] }[]) ?? [];
    const opts = [`<option value="-1">Fotograma 0</option>`, ...anims.map((a, i) => `<option value="${i}" ${i === 0 ? "selected" : ""}>${esc(a.name)}</option>`)].join("");
    return `<div class="sprite frames" data-item="${esc(JSON.stringify(it))}" data-k="${k}"><canvas width="${it.fw! * k}" height="${it.fh! * k}"></canvas>${esc(it.label)}<br /><select>${opts}</select>${it.shiny ? ` <label><input type="checkbox" /> variocolor</label>` : ""}</div>`;
  }
  if (it.kind === "pmd") {
    return `<div class="pmd" data-json="${esc(it.data!)}"><div class="none">${esc(it.label)}: cargando…</div></div>`;
  }
  const w = it.w!;
  const h = it.h!;
  if (it.n && it.n > 1) {
    const fw = it.fw!;
    const fh = it.fh!;
    const k = Math.max(1, Math.round(120 / Math.max(fw, fh)));
    const end = it.axis === "y" ? `0 ${-fh * k}px` : `${-fw * k}px 0`;
    return `<div class="sprite"><div class="sheet" style="--w:${fw * k}px;--h:${fh * k}px;--bw:${w * k}px;--bh:${h * k}px;--end:${end};background-image:url(${it.url})"></div>${esc(it.label)}</div>`;
  }
  const big = Math.max(w, h) > 200;
  const k = big ? 1 : Math.max(1, Math.round(120 / Math.max(w, h)));
  return `<div class="sprite"><img src="${it.url}" loading="lazy" alt="" style="width:${w * k}px;height:${h * k}px" />${esc(it.label)}</div>`;
}

/** HTML de la sección «Otros juegos» para una especie nacional, o null si no hay datos de ninguna fuente. */
export function otherSourcesHtml(index: SpriteIndex | null, national: number): string {
  if (!index) {
    return `<p class="none">Sprites de otros juegos no generados: <code>npm run refs:fetch -- pmd-red pokeemerald-expansion pokeplatinum pokeheartgold &amp;&amp; npm run sprites:sources</code>.</p>`;
  }
  const per = index.species[String(national)];
  if (!per) return `<p class="none">Ninguna de las fuentes tiene sprites de esta especie.</p>`;
  const blocks = SOURCE_ORDER.filter((s) => per[s]?.length).map((s) => {
    const meta = index.sources[s];
    const items = per[s]!;
    const pmd = items.filter((i) => i.kind === "pmd" || i.kind === "portraits");
    const rest = items.filter((i) => i.kind !== "pmd" && i.kind !== "portraits");
    return `<details class="src" open><summary><b>${esc(meta?.label ?? s)}</b> <span class="none">· ${items.length} elementos · ${esc(meta?.repo ?? "")}@${esc((meta?.commit ?? "").slice(0, 8))}</span></summary>
      ${pmd.map(itemHtml).join("")}
      ${rest.length ? `<div class="sprites">${rest.map(itemHtml).join("")}</div>` : ""}</details>`;
  });
  return blocks.join("");
}

// ---- Reproductor de PMD ----

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const loadImage = (url: string) => {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`no se pudo cargar ${url}`));
      im.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
};

const DIR_NAMES = ["1", "2", "3", "4", "5", "6", "7", "8"];
let generation = 0;

async function mountPmd(host: HTMLElement, gen: number): Promise<void> {
  const data: PmdData = await (await fetch(host.dataset.json!)).json();
  const atlas = await loadImage(data.atlas);
  if (gen !== generation) return;
  const pad = data.pad;
  const scale = Math.max(1, Math.min(3, Math.floor(200 / Math.max(data.cw + pad * 2, data.ch + pad * 2))));
  const W = (data.cw + pad * 2) * scale;
  const H = (data.ch + pad * 2) * scale;
  const totalTicks = (a: PmdAnim, dir: number) => a.seq[a.dirs[dir]!]!.reduce((t, f) => t + f[1]!, 0);
  const opts = data.anims
    .map((a, i) => `<option value="${i}">Animación ${a.id} · ${Math.round(totalTicks(a, 0) * TICK_MS)} ms</option>`)
    .join("");
  host.innerHTML = `
    <div class="pmd-bar">
      <label>Animación <select class="pmd-anim">${opts}</select></label>
      <button class="pmd-play" type="button">Pausa</button>
      <label><input type="checkbox" class="pmd-sheet" /> Hoja de poses (${data.cells})</label>
      <span class="none">Direcciones en el orden del juego (1 = de frente). Frames en ticks de 1/60 s.</span>
    </div>
    <div class="pmd-dirs">${DIR_NAMES.map((n, d) => `<div class="sprite"><canvas width="${W}" height="${H}" data-dir="${d}"></canvas>Dir ${n}</div>`).join("")}</div>
    <div class="pmd-atlas" hidden><img src="${data.atlas}" alt="" style="width:${atlas.width}px" /></div>`;
  const canvases = [...host.querySelectorAll<HTMLCanvasElement>("canvas")];
  const sel = host.querySelector<HTMLSelectElement>(".pmd-anim")!;
  const playBtn = host.querySelector<HTMLButtonElement>(".pmd-play")!;
  const atlasBox = host.querySelector<HTMLElement>(".pmd-atlas")!;
  host.querySelector<HTMLInputElement>(".pmd-sheet")!.addEventListener("change", (e) => {
    atlasBox.hidden = !(e.target as HTMLInputElement).checked;
  });
  let playing = true;
  let t0 = performance.now();
  let frozen = 0;
  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "Pausa" : "Reproducir";
    if (playing) t0 = performance.now() - frozen;
    else frozen = performance.now() - t0;
  });
  sel.addEventListener("change", () => {
    t0 = performance.now();
    frozen = 0;
  });
  const draw = (now: number) => {
    if (gen !== generation || !host.isConnected) return;
    const a = data.anims[Number(sel.value)]!;
    const elapsed = playing ? now - t0 : frozen;
    canvases.forEach((cv, d) => {
      const seq = a.seq[a.dirs[d]!]!;
      const total = seq.reduce((t, f) => t + f[1]!, 0) * TICK_MS || 1;
      let t = elapsed % total;
      let fr = seq[0]!;
      for (const f of seq) {
        const dur = f[1]! * TICK_MS;
        if (t < dur) {
          fr = f;
          break;
        }
        t -= dur;
      }
      const ctx = cv.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      const c = fr[0]!;
      ctx.drawImage(atlas, (c % data.cols) * data.cw, Math.floor(c / data.cols) * data.ch, data.cw, data.ch, (pad + fr[2]!) * scale, (pad + fr[3]!) * scale, data.cw * scale, data.ch * scale);
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

/** Hoja de fotogramas de Crystal (front.png apilado) con anim.asm / anim_idle.asm. */
async function mountFrames(host: HTMLElement, gen: number): Promise<void> {
  const it: Item = JSON.parse(host.dataset.item!);
  const k = Number(host.dataset.k);
  const cv = host.querySelector("canvas")!;
  const sel = host.querySelector("select")!;
  const chk = host.querySelector<HTMLInputElement>("input[type=checkbox]");
  const imgs = [await loadImage(it.url!), it.shiny ? await loadImage(it.shiny) : null];
  if (gen !== generation) return;
  const anims = (it.anims as { name: string; seq: number[][] }[]) ?? [];
  const fw = it.fw!;
  const fh = it.fh!;
  let t0 = performance.now();
  sel.addEventListener("change", () => (t0 = performance.now()));
  const draw = (now: number) => {
    if (gen !== generation || !host.isConnected) return;
    const img = (chk?.checked ? imgs[1] : imgs[0]) ?? imgs[0]!;
    const a = Number(sel.value);
    let frame = 0;
    if (a >= 0 && anims[a]) {
      const seq = anims[a]!.seq;
      const total = seq.reduce((t, f) => t + f[1]!, 0) * TICK_MS || 1;
      let t = (now - t0) % total;
      for (const f of seq) {
        const dur = f[1]! * TICK_MS;
        if (t < dur) {
          frame = f[0]!;
          break;
        }
        t -= dur;
      }
    }
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, frame * fh, fw, fh, 0, 0, fw * k, fh * k);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

/** Primera imagen representativa de una especie para la lista (fuentes sin datos de juego). */
export function thumbOf(index: SpriteIndex, national: number): { url: string; n: number; axis: string } | null {
  const per = index.species[String(national)];
  if (!per) return null;
  for (const src of ["emerald-expansion", "platinum", "heartgold", "crystal"]) {
    const it = per[src]?.find((i) => /^Frente/.test(i.label) && !/variocolor|hembra|GBA/.test(i.label)) ?? per[src]?.find((i) => /^Frente/.test(i.label));
    if (it?.url) return { url: it.url, n: it.n ?? 1, axis: it.axis ?? "" };
  }
  return null;
}

/** Monta los reproductores de PMD dentro de `root` (cancela los del contenido anterior). */
export function activateSpriteSections(root: HTMLElement): void {
  generation++;
  const gen = generation;
  root.querySelectorAll<HTMLElement>(".frames").forEach((h) => {
    mountFrames(h, gen).catch((e) => {
      h.innerHTML = `<p class="none">Error: ${esc(String(e))}</p>`;
    });
  });
  root.querySelectorAll<HTMLElement>(".pmd").forEach((h) => {
    mountPmd(h, gen).catch((e) => {
      h.innerHTML = `<p class="none">Error: ${esc(String(e))}</p>`;
    });
  });
}
