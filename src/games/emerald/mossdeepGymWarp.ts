// pokeemerald field_screen_effect.c: Mossdeep warp entry/exit and the shared
// warp/exit tasks on their Mossdeep callers. The async map-fetch boundary is
// supplied by the viewer; it preserves templates as overworld.c's load flag requires.
import type { Overworld } from '@core/field/overworld';
import type { WarpData } from '@game/save';
import { SaveObjectEvents } from '@game/loadSave';
import { tasks } from '@core/gba/tasks';
import { paletteFade } from '@core/gba/fade';
import { sound } from '@core/audio/sound';
import * as C from './generated/constants';

export type MossdeepWarpHost = (destination: WarpData, preserveTemplates: boolean) => Promise<void>;
const instances = new WeakMap<Overworld, MossdeepGymWarp>();
export function installMossdeepGymWarp(ow: Overworld, host: MossdeepWarpHost): MossdeepGymWarp {
  const warp = new MossdeepGymWarp(ow, host); instances.set(ow, warp); return warp;
}
export function mossdeepGymWarp(ow: Overworld): MossdeepGymWarp {
  const warp = instances.get(ow);
  if (!warp) throw Error('Emerald Mossdeep warp host is not installed');
  return warp;
}

export class MossdeepGymWarp {
  private sObjectEventLoadFlag = 0;
  private fieldCallback: (() => void) | null = null;
  constructor(private readonly ow: Overworld, private readonly loadMap: MossdeepWarpHost) {}

  /** overworld.c SetObjectEventLoadFlag: u8 state; only bit SKIP is read by map loading. */
  SetObjectEventLoadFlag(flag: number): void { this.sObjectEventLoadFlag = flag & 0xff; }
  get skipsObjectEventLoad(): boolean { return (this.sObjectEventLoadFlag & C.SKIP_OBJECT_EVENT_LOAD) !== 0; }

  DoMossdeepGymWarp(): void {
    // field_control_avatar.c calls this for any MB_MOSSDEEP_GYM_WARP tile: the Mossdeep gym and
    // Trick House Puzzle 7 (every map that uses it has WEATHER_NONE). The shared task's Mirage Tower
    // cleanup returns immediately outside Route 111 (its first map guard); no tower effect is
    // substituted or implemented by this integration.
    if (this.ow.header.id === 'MAP_ROUTE111' || this.ow.header.weather !== C.WEATHER_NONE) throw Error('Mossdeep warp outside its source caller maps');
    this.SetObjectEventLoadFlag(C.SKIP_OBJECT_EVENT_LOAD);
    this.ow.LockPlayerFieldControls();
    SaveObjectEvents(this.ow.sprites);
    this.ow.TryFadeOutOldMapMusic();
    this.ow.warpFadeOutScreen();
    sound.playSE(C.SE_WARP_IN);
    tasks.create(id => this.Task_WarpAndLoadMap(id), 10);
    this.fieldCallback = () => this.FieldCB_MossdeepGymWarpExit();
  }

  private Task_WarpAndLoadMap(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    switch (data[0]) {
      case 0:
        this.ow.objects.freezeAll(); this.ow.LockPlayerFieldControls(); data[0]++; break;
      case 1:
        if (!paletteFade.active) {
          if (data[1] === 0) data[1] = 1; // ClearMirageTowerPulseBlendEffect map guard, documented above.
          if (this.ow.BGMusicStopped()) data[0]++;
        }
        break;
      case 2: {
        const destination = { ...this.ow.warpDestination };
        tasks.destroy(taskId);
        this.ow.script.ScriptContext_Init();
        this.ow.game.setCallbacks(null, null);
        // GBA reads map data synchronously; fetch and viewer relocation replace
        // that boundary. Source exit starts only after templates/objects are ready.
        void this.loadMap(destination, this.skipsObjectEventLoad).then(() => {
          const callback = this.fieldCallback; this.fieldCallback = null; callback?.();
        }).catch(error => { console.error('Emerald Mossdeep warp map load failed', error); });
        break;
      }
    }
  }

  private FieldCB_MossdeepGymWarpExit(): void {
    this.ow.playSpecialMapMusic();
    this.ow.WarpFadeInScreen();
    sound.playSE(C.SE_WARP_OUT);
    tasks.create(id => this.Task_ExitNonDoor(id), 10);
    this.ow.LockPlayerFieldControls();
    this.SetObjectEventLoadFlag((~C.SKIP_OBJECT_EVENT_LOAD) & 0xf);
  }

  private Task_ExitNonDoor(taskId: number): void {
    const data = tasks.tasks[taskId].data;
    if (data[0] === 0) {
      this.ow.objects.freezeAll(); this.ow.LockPlayerFieldControls(); data[0]++;
    // This source map has WEATHER_NONE: FadeInScreenWithWeather's default
    // branch finishes when its palette fade does. The viewer's overlay fade is
    // that boundary; the shared weather-change predicate is not a fade predicate.
    } else if (!paletteFade.active) {
      this.ow.objects.unfreezeAll(); this.ow.UnlockPlayerFieldControls(); tasks.destroy(taskId);
    }
  }
}
