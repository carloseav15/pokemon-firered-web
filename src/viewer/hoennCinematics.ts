import type { EntityManager, LiveEntity } from "./render/entities";
import type { ViewerAudioController } from "./audio/audioController";
import type { DialogManager } from "./ui/dialog";

export interface CinematicHost {
  content: HTMLElement;
  viewport: HTMLElement;
  audio: ViewerAudioController;
  dialog: DialogManager;
  entityManager: EntityManager;
  camera: { zoom: number };
  lockControls(locked: boolean): void;
  updateEntitiesView(): void;
}

/**
 * Screen shake animation replicating GBA special ShakeCamera / Task_ElevatorShake.
 */
export async function shakeScreen(
  target: HTMLElement,
  numShakes = 8,
  delayMs = 40,
  amplitude = 5,
): Promise<void> {
  const originalTransform = target.style.transform;
  for (let i = 0; i < numShakes; i++) {
    const dx = (i % 2 === 0 ? 1 : -1) * (amplitude - Math.floor(i / 3));
    const dy = (i % 3 === 0 ? 1 : -1) * Math.max(1, Math.floor(amplitude / 2));
    target.style.transform = `translate(${dx}px, ${dy}px)`;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  target.style.transform = originalTransform;
}

/**
 * Flash screen effect simulating weather lightning / divine awakening.
 */
export async function flashScreen(target: HTMLElement, color = "rgba(255, 255, 255, 0.7)", durationMs = 120): Promise<void> {
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.backgroundColor = color;
  overlay.style.zIndex = "999";
  overlay.style.pointerEvents = "none";
  overlay.style.transition = `opacity ${durationMs}ms ease-out`;
  target.appendChild(overlay);
  await new Promise((r) => setTimeout(r, 20));
  overlay.style.opacity = "0";
  await new Promise((r) => setTimeout(r, durationMs));
  overlay.remove();
}

/**
 * Sky Pillar Top: Rayquaza Awakening Scene (SkyPillar_Top_EventScript_AwakenRayquaza).
 * Rayquaza stirs, emits legendary roars with screen shaking tremors, and flies off into the ozone.
 */
export async function runSkyPillarRayquazaCinematic(host: CinematicHost): Promise<void> {
  host.lockControls(true);
  try {
    // 1. Initial tremor
    await shakeScreen(host.content, 6, 40, 3);
    await new Promise((r) => setTimeout(r, 300));

    // 2. Rayquaza stirs & first cry
    host.audio.playMonCry(384, 0, 120); // SPECIES_RAYQUAZA
    await shakeScreen(host.content, 10, 35, 6);
    await new Promise((r) => setTimeout(r, 400));

    // 3. Second roar with stronger earthquake & flash
    void flashScreen(host.viewport, "rgba(255, 255, 200, 0.6)", 200);
    host.audio.playMonCry(384, 0, 130);
    await shakeScreen(host.content, 14, 30, 8);
    await new Promise((r) => setTimeout(r, 300));

    // 4. Rayquaza flies off upwards
    const rayquaza = host.entityManager.entities.find(
      (e) => e.element.graphics?.includes("RAYQUAZA") || e.graphicsId === 207 || e.graphicsId === 41,
    );

    if (rayquaza && rayquaza.el) {
      const el = rayquaza.el;
      el.style.transition = "transform 1.4s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 1.2s ease-in";
      el.style.transform = "translateY(-240px) scale(1.1)";
      el.style.opacity = "0";
      await new Promise((r) => setTimeout(r, 1400));
      rayquaza.removed = true;
      rayquaza.el?.remove();
    }

    // 5. Message dialogue
    await host.dialog.show("Pilar Celeste", ["The legendary RAYQUAZA has awakened and rises into the sky!"]);
  } finally {
    host.lockControls(false);
  }
}

/**
 * Cave of Origin: Legend of Ancient Beasts & Cavern Tremor (CaveOfOrigin_EventScript_Shake).
 */
export async function runCaveOfOriginRumbleCinematic(host: CinematicHost): Promise<void> {
  host.lockControls(true);
  try {
    // Cavern earthquake rumble
    await shakeScreen(host.content, 12, 35, 5);
    // Kyogre and Groudon distant roaring cries
    host.audio.playMonCry(382, -30, 100); // SPECIES_KYOGRE
    await new Promise((r) => setTimeout(r, 400));
    await shakeScreen(host.content, 8, 30, 4);
    host.audio.playMonCry(383, 30, 100); // SPECIES_GROUDON
    await new Promise((r) => setTimeout(r, 500));

    await host.dialog.show("Cueva Origen", [
      "The earth and underground waters rumble with echoes of Groudon and Kyogre!",
    ]);
  } finally {
    host.lockControls(false);
  }
}

/**
 * Sootopolis City: Kyogre vs Groudon Clash Scene (SootopolisCity_Movement_KyogreAttack / GroudonAttack).
 */
export async function runSootopolisClashCinematic(host: CinematicHost): Promise<void> {
  host.lockControls(true);
  try {
    const groudon = host.entityManager.entities.find((e) => e.element.graphics?.includes("GROUDON"));
    const kyogre = host.entityManager.entities.find((e) => e.element.graphics?.includes("KYOGRE"));

    // 1. Kyogre surges forward
    if (kyogre?.el) {
      kyogre.el.style.transition = "transform 0.25s ease-out";
      kyogre.el.style.transform = "translate(16px, -8px)";
    }
    host.audio.playMonCry(382, -20, 110);
    await shakeScreen(host.content, 8, 30, 5);
    void flashScreen(host.viewport, "rgba(100, 150, 255, 0.5)", 150);

    // 2. Groudon roars and retaliates
    if (groudon?.el) {
      groudon.el.style.transition = "transform 0.25s ease-out";
      groudon.el.style.transform = "translate(-16px, 8px)";
    }
    await new Promise((r) => setTimeout(r, 300));
    host.audio.playMonCry(383, 20, 110);
    await shakeScreen(host.content, 10, 30, 6);
    void flashScreen(host.viewport, "rgba(255, 120, 50, 0.5)", 150);

    // Reset positions
    if (kyogre?.el) kyogre.el.style.transform = "";
    if (groudon?.el) groudon.el.style.transform = "";

    await host.dialog.show("Arrecife of Sootopolis", [
      "Groudon and Kyogre collide in a violent cataclysm of fire and flood!",
      "Only Rayquaza, the guardian of the skies, can calm their fury.",
    ]);
  } finally {
    host.lockControls(false);
  }
}
