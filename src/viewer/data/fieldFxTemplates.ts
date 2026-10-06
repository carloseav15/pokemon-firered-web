import { DATA_ROOT } from "../../fr/rom";

export const M12_TEMPLATE_NAMES = ["TallGrass", "GroundImpactDust", "Ripple"] as const;
export type M12TemplateName = typeof M12_TEMPLATE_NAMES[number];
export type ViewerAnimCmd = readonly ["F", number, number, 0 | 1, 0 | 1] | readonly ["J", number] | readonly ["E"];
export type EffectFrame = Readonly<{ image: HTMLImageElement; url: string; sourceX: number; sourceY: number; width: number; height: number }>;
export type EffectTemplate = Readonly<{ name: M12TemplateName; frames: readonly EffectFrame[]; anims: readonly (readonly ViewerAnimCmd[])[]; callback: string; size: readonly [number, number] }>;

const templates = new Map<M12TemplateName, Promise<EffectTemplate>>();
const images = new Map<string, Promise<HTMLImageElement>>();
let manifest: Promise<Record<string, unknown>> | null = null;
function fail(name: string, reason: string): never { throw new Error(`Viewer fieldfx ${name}: ${reason}`); }
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(name, "expected object");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max; }

/** Reject commands outside F/E/J, missing frames, bad targets and control-only cycles. */
export function validateEffectAnimation(raw: unknown, frameCount: number, name: string): readonly ViewerAnimCmd[] {
  if (!Array.isArray(raw) || !raw.length) fail(name, "empty animation");
  const result: ViewerAnimCmd[] = raw.map((c, i) => {
    if (!Array.isArray(c)) fail(name, `command ${i} is not a tuple`);
    if (c[0] === "F" && c.length === 5 && integer(c[1], 0, frameCount - 1) && integer(c[2], 1, 63) && integer(c[3], 0, 1) && integer(c[4], 0, 1)) return Object.freeze(["F", c[1], c[2], c[3], c[4]]) as ViewerAnimCmd;
    if (c[0] === "E" && c.length === 1) return Object.freeze(["E"]);
    if (c[0] === "J" && c.length === 2 && integer(c[1], 0, raw.length - 1)) return Object.freeze(["J", c[1]]);
    return fail(name, `unsupported or invalid command ${i}: ${JSON.stringify(c)}`);
  });
  for (let i = 0; i < result.length; i++) {
    let pc = i;
    const seen = new Set<number>();
    while (result[pc]?.[0] === "J") {
      if (seen.has(pc)) fail(name, `control-only loop at command ${i}`);
      seen.add(pc); pc = (result[pc] as readonly ["J", number])[1];
    }
    if (result[i][0] === "F" && i === result.length - 1) fail(name, "animation falls off end without E/J");
  }
  return Object.freeze(result);
}

function loadManifest(): Promise<Record<string, unknown>> {
  if (!manifest) manifest = fetch(`${DATA_ROOT}/fieldfx.json`).then(async r => {
    if (!r.ok) fail("manifest", `HTTP ${r.status}`);
    return object(object(await r.json(), "manifest").templates, "templates");
  }).catch(error => { manifest = null; throw error; });
  return manifest;
}
function loadImage(url: string): Promise<HTMLImageElement> {
  let promise = images.get(url);
  if (!promise) {
    promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error(`Viewer fieldfx empty image ${url}`));
      image.onerror = () => reject(new Error(`Viewer fieldfx image failed ${url}`));
      image.src = url;
    }).catch(error => { images.delete(url); throw error; });
    images.set(url, promise);
  }
  return promise;
}

/** Cached including in-flight loads; failed loads are retryable. M12 only. */
export function loadEffectTemplate(name: M12TemplateName): Promise<EffectTemplate> {
  if (!(M12_TEMPLATE_NAMES as readonly string[]).includes(name)) return Promise.reject(new Error(`Viewer fieldfx unsupported template ${name}`));
  let promise = templates.get(name);
  if (!promise) {
    promise = loadManifest().then(async all => {
      const t = object(all[name], name);
      if (!Array.isArray(t.frames) || !t.frames.length || !Array.isArray(t.anims) || !t.anims.length || typeof t.callback !== "string") fail(name, "invalid frames/anims/callback");
      const frames = await Promise.all(t.frames.map(async (f: unknown, i: number) => {
        if (!Array.isArray(f) || f.length !== 4 || typeof f[0] !== "string" || !/^fieldfx\/[a-z0-9_]+\.png$/i.test(f[0]) || !integer(f[1], 0, 65535) || !integer(f[2], 1, 64) || !integer(f[3], 1, 64)) fail(name, `invalid frame ${i}`);
        const url = `${DATA_ROOT}/${f[0]}`;
        const image = await loadImage(url);
        const columns = image.naturalWidth / f[2], rows = image.naturalHeight / f[3];
        if (!Number.isInteger(columns) || !Number.isInteger(rows) || f[1] >= columns * rows) fail(name, `image bounds/packing for frame ${i}`);
        return Object.freeze({ image, url, sourceX: (f[1] % columns) * f[2], sourceY: Math.floor(f[1] / columns) * f[3], width: f[2], height: f[3] });
      }));
      const size = t.size;
      if (!Array.isArray(size) || size.length !== 2 || !integer(size[0], 1, 64) || !integer(size[1], 1, 64) || frames.some(f => f.width !== size[0] || f.height !== size[1])) fail(name, "size does not match frame dimensions");
      const anims = t.anims.map((a, i) => validateEffectAnimation(a, frames.length, `${name}/anim${i}`));
      return Object.freeze({ name, frames: Object.freeze(frames), anims: Object.freeze(anims), callback: t.callback, size: Object.freeze([size[0], size[1]]) as readonly [number, number] });
    }).catch(error => { templates.delete(name); throw error; });
    templates.set(name, promise);
  }
  return promise;
}
export async function loadM12Templates(): Promise<ReadonlyMap<M12TemplateName, EffectTemplate>> {
  const loaded = await Promise.all(M12_TEMPLATE_NAMES.map(loadEffectTemplate));
  return new Map(loaded.map(t => [t.name, t]));
}
