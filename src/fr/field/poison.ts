// field_poison.c Task_TryFieldPoisonWhiteOut. Poison is cleared only after the
// fainted-mon message is queued, preserving the per-Pokémon task sequence.
import * as C from "../generated/constants";
import type { Game } from "../game";
import { tasks } from "../gba/tasks";
import { stringVars } from "../gba/charmap";
import { rom } from "../rom";
import { save, SV, varSet } from "../save";
import { nickname } from "../pokemon/pokemon";
import { AdjustFriendship } from "../pokemon/mon_extra";
import type { Mon } from "../pokemon/mon";

export function tryFieldPoisonWhiteOut(game: Game): void {
  game.overworld.script.stop();
  let slot = 0, waiting = false;
  const task = tasks.create(() => {
    if (waiting) {
      if (!game.overworld.messageBox.isHidden()) return;
      waiting = false;
      return;
    }
    for (; slot < save.party.length; slot++) {
      const mon = save.party[slot];
      if (!mon.species || mon.isEgg || mon.hp || !(mon.status & 0x88)) continue;
      AdjustFriendship(mon as Mon, C.FRIENDSHIP_EVENT_FAINT_OUTSIDE_BATTLE);
      mon.status = 0;
      stringVars.var1 = nickname(mon);
      game.overworld.messageBox.show(rom.text("gText_PkmnFainted3"));
      waiting = true;
      return;
    }
    varSet(SV.RESULT, save.party.some(mon => mon.species && !mon.isEgg && mon.hp > 0) ? 0 : 1);
    tasks.destroy(task);
    game.overworld.script.enable();
  }, 80);
}
