// special_field_anim.c: Sea Cottage teleporter tile animations (escalator tiles live in escalatorAnimation.ts).
// The source creates priority-0 tasks; the shared GBA task scheduler advances
// them once per frame, while FieldMap's onChange invalidates the Canvas map.
import { tasks } from "../gba/tasks";
import { MAPGRID_COLLISION_MASK } from "./fieldmap";
import { rom } from "../rom";
import type { Overworld } from "./overworld";

function playerCurrentCoords(ow: Overworld): { x: number; y: number } {
  // Despite its name, field_player_avatar.c returns currentCoords directly.
  const p = ow.player.object;
  return { x: p.currentCoords.x, y: p.currentCoords.y };
}

function setAndDraw(ow: Overworld, x: number, y: number, metatileName: string): void {
  ow.map.setMetatileIdAt(x, y, rom.c(metatileName) | MAPGRID_COLLISION_MASK);
}

const escalatorOwners = new Map<number, Overworld>();
/** Task_DrawTeleporterHousing: source data[0..3] is timer, state, X and Y. */
function Task_DrawTeleporterHousing(taskId: number): void {
  const ow = escalatorOwners.get(taskId);
  if (!ow) return;
  const data = tasks.data(taskId);
  const [timer, state, x, y] = data;
  if (timer === 0) {
    if ((state & 1) === 0) {
      setAndDraw(ow, x, y, "METATILE_SeaCottage_Teleporter_Light_Yellow");
      setAndDraw(ow, x, y + 2, "METATILE_SeaCottage_Teleporter_Door_HalfGlowing");
    } else {
      setAndDraw(ow, x, y, "METATILE_SeaCottage_Teleporter_Light_Red");
      setAndDraw(ow, x, y + 2, "METATILE_SeaCottage_Teleporter_Door_FullGlowing");
    }
  }
  data[0]++;
  if (data[0] !== 16) return;
  data[0] = 0;
  data[1]++;
  if (data[1] !== 13) return;
  setAndDraw(ow, x, y, "METATILE_SeaCottage_Teleporter_Light_Green");
  setAndDraw(ow, x, y + 2, "METATILE_SeaCottage_Teleporter_Door");
  escalatorOwners.delete(taskId);
  tasks.destroy(taskId);
}

/** Task_DrawTeleporterCable: timer/state/X/Y match special_field_anim.c. */
function Task_DrawTeleporterCable(taskId: number): void {
  const ow = escalatorOwners.get(taskId);
  if (!ow) return;
  const data = tasks.data(taskId);
  if (data[0] === 0) {
    if (data[1] !== 0) {
      setAndDraw(ow, data[2], data[3], "METATILE_SeaCottage_Teleporter_Cable_Top");
      setAndDraw(ow, data[2], data[3] + 1, "METATILE_SeaCottage_Teleporter_Cable_Bottom");
      if (data[1] === 4) {
        escalatorOwners.delete(taskId);
        tasks.destroy(taskId);
        return;
      }
      data[2]--;
    }
    setAndDraw(ow, data[2], data[3], "METATILE_SeaCottage_Teleporter_CableBall_Top");
    setAndDraw(ow, data[2], data[3] + 1, "METATILE_SeaCottage_Teleporter_CableBall_Bottom");
  }
  data[0]++;
  if (data[0] === 4) { data[0] = 0; data[1]++; }
}

/** AnimateTeleporterHousing (special_field_anim.c): 13 phases, 16 frames each. */
export function AnimateTeleporterHousing(ow: Overworld, teleporter: number): void {
  const p = playerCurrentCoords(ow);
  const taskId = tasks.create(Task_DrawTeleporterHousing, 0);
  escalatorOwners.set(taskId, ow);
  const data = tasks.data(taskId);
  data[2] = p.x + (teleporter === 0 ? 6 : -1);
  data[3] = p.y - 5;
}

/** AnimateTeleporterCable creates the four-step task at the source priority. */
export function AnimateTeleporterCable(ow: Overworld): void {
  const p = playerCurrentCoords(ow);
  const taskId = tasks.create(Task_DrawTeleporterCable, 0);
  escalatorOwners.set(taskId, ow);
  const data = tasks.data(taskId);
  data[2] = p.x + 4;
  data[3] = p.y - 5;
}
