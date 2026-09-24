import type { SaveGame, StarterSpecies } from "../game/GameState";
import type { WorldEngine } from "./WorldEngine";

export const LAB_SCENE = "VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB";
export const TOWN_OAK_SCENE = "VAR_MAP_SCENE_PALLET_TOWN_OAK";

const starterData: Record<StarterSpecies, { number: number; rival: StarterSpecies; moves: string[] }> = {
  BULBASAUR: { number: 0, rival: "CHARMANDER", moves: ["TACKLE", "GROWL"] },
  SQUIRTLE: { number: 1, rival: "BULBASAUR", moves: ["TACKLE", "TAIL WHIP"] },
  CHARMANDER: { number: 2, rival: "SQUIRTLE", moves: ["SCRATCH", "GROWL"] },
};

export class PalletQuest {
  static labScene(engine: WorldEngine): number {
    return Number(engine.world.variables[LAB_SCENE] ?? 0);
  }

  static beginOakEscort(engine: WorldEngine): boolean {
    // A save taken after the trigger but before the warp can resume it.
    if (Number(engine.world.variables[TOWN_OAK_SCENE] ?? 0) === 1 && this.labScene(engine) === 1) return true;
    if (Number(engine.world.variables[TOWN_OAK_SCENE] ?? 0) !== 0) return false;
    engine.world.variables[TOWN_OAK_SCENE] = 1;
    engine.world.variables[LAB_SCENE] = 1;
    engine.clearFlag("FLAG_HIDE_OAK_IN_HIS_LAB");
    engine.setFlag("FLAG_HIDE_OAK_IN_PALLET_TOWN");
    return true;
  }

  static starterForScript(script?: string): StarterSpecies | undefined {
    if (script?.endsWith("EventScript_BulbasaurBall")) return "BULBASAUR";
    if (script?.endsWith("EventScript_SquirtleBall")) return "SQUIRTLE";
    if (script?.endsWith("EventScript_CharmanderBall")) return "CHARMANDER";
    return undefined;
  }

  static chooseStarter(engine: WorldEngine, save: SaveGame, starter: StarterSpecies): boolean {
    if (this.labScene(engine) !== 2 || save.party.length > 0) return false;
    const data = starterData[starter];
    // The source uses temporary variables before confirmation, then commits
    // VAR_STARTER_MON on acceptance. Keep only the persistent value in save.
    engine.world.variables.VAR_STARTER_MON = data.number;
    engine.world.variables[LAB_SCENE] = 3;
    engine.setFlag("FLAG_SYS_POKEMON_GET");
    engine.setFlag("FLAG_PALLET_LADY_NOT_BLOCKING_SIGN");
    // The source uses removeobject for both balls. That removal belongs to the
    // current map instance; it does not set their permanent hide flags.
    for (const object of engine.world.objects) {
      const ball = this.starterForScript(object.script);
      if (ball === starter || ball === data.rival) object.active = false;
    }
    save.party = [{ species: starter, level: 5, moves: [...data.moves], hp: 20, maxHp: 20 }];
    return true;
  }

  static rivalStarter(starter: StarterSpecies): StarterSpecies {
    return starterData[starter].rival;
  }
}
