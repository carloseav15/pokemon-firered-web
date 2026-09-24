export type PlayerGender = "boy" | "girl";
export type StarterSpecies = "BULBASAUR" | "CHARMANDER" | "SQUIRTLE";

export type PartyPokemon = {
  species: StarterSpecies;
  level: number;
  moves: string[];
  hp: number;
  maxHp: number;
};

export type SaveGame = {
  version: 1;
  playerName: string;
  playerGender: PlayerGender;
  rivalName: string;
  mapId: string;
  position: { x: number; y: number };
  flags: Record<string, boolean>;
  variables: Record<string, number | string>;
  party: PartyPokemon[];
  items: Record<string, number>;
  hasPokedex: boolean;
  playTimeSeconds: number;
};

const STORAGE_KEY = "pokemon-gba-web-lab.save.v1";

export function createNewSave(playerName: string, playerGender: PlayerGender, rivalName: string): SaveGame {
  return {
    version: 1,
    playerName,
    playerGender,
    rivalName,
    // NewGameInitData() calls WarpToPlayersRoom() in the FireRed source.
    mapId: "MAP_PALLET_TOWN_PLAYERS_HOUSE_2F",
    position: { x: 10, y: 2 },
    // EventScript_ResetAllMapFlags hides Oak until the Route 1 trigger.
    flags: {
      FLAG_HIDE_OAK_IN_HIS_LAB: true,
      FLAG_HIDE_OAK_IN_PALLET_TOWN: true,
    },
    variables: {
      VAR_MAP_SCENE_PALLET_TOWN_OAK: 0,
      VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB: 0,
      VAR_MAP_SCENE_PALLET_TOWN_PLAYERS_HOUSE_2F: 0,
    },
    party: [],
    items: { POTION: 1 },
    hasPokedex: false,
    playTimeSeconds: 0,
  };
}

export class SaveStore {
  static load(): SaveGame | undefined {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (!value) return undefined;
      const save = JSON.parse(value) as SaveGame;
      if (save.version !== 1 || !save.playerName || !save.mapId) return undefined;
      // Repair early web saves made before the source new-game hide flags
      // were applied. Do not alter progressed games or their cleared flags.
      if (save.party.length === 0 && Number(save.variables.VAR_MAP_SCENE_PALLET_TOWN_OAK ?? 0) === 0) {
        save.flags.FLAG_HIDE_OAK_IN_HIS_LAB ??= true;
        save.flags.FLAG_HIDE_OAK_IN_PALLET_TOWN ??= true;
      }
      if (save.party.length > 0) {
        save.flags.FLAG_HIDE_OAK_IN_HIS_LAB ??= false;
        save.flags.FLAG_HIDE_OAK_IN_PALLET_TOWN ??= true;
        // The old web prototype permanently hid the chosen ball. FireRed's
        // removeobject only removes it for the current map visit.
        for (const species of ["BULBASAUR", "SQUIRTLE", "CHARMANDER"])
          delete save.flags[`FLAG_HIDE_${species}_BALL`];
        if (Number(save.variables.VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB ?? 0) < 3)
          save.variables.VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB = 3;
      }
      return save;
    } catch {
      return undefined;
    }
  }

  static save(game: SaveGame): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }
}
