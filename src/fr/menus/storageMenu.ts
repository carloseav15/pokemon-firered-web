// Logic adapter for PC deposit/withdraw/release/box naming. Original storage
// sprite layout, moving groups, wallpapers and item mode are still pending.
import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { openHardwareChoice } from "./hardwareChoice";
import { depositMon, getBoxName, releaseMon, withdrawMon, type StorageResult } from "../pokemon/storage";
import { decode } from "../gba/charmap";
import { DoNamingScreen } from "../namingScreen";
import { save } from "../save";
import * as C from "../generated/constants";

export function openStorageMenu(game: Game): void {
  game.overworld.script.stop();
  const scene = new HwScene(); scene.enter(); game.scene = scene;
  game.setCallbacks(null, () => scene.update());
  const close = (): void => {
    scene.leave(); game.scene = null;
    game.setCallbacks(() => game.overworld.cb1(), () => game.overworld.cb2());
    game.overworld.script.enable();
  };
  const result = (value: StorageResult, next: () => void): void => {
    if (value === "ok") { next(); return; }
    const labels: Record<Exclude<StorageResult, "ok">, string> = {
      invalid: "No POKéMON selected.", partyFull: "Your party is full.", boxFull: "That BOX is full.",
      lastUsable: "That's your last POKéMON!", mail: "Please remove the MAIL.", egg: "You can't release an EGG.", neededMove: "It came back!",
    };
    openHardwareChoice(labels[value], [{label: "OK", value: 0}], false, next);
  };
  const chooseBox = (done: (box: number | null) => void): void => openHardwareChoice("Choose a BOX.", save.boxes.map((box, i) => ({
    value: i, label: `${decode(getBoxName(i))}  ${box.filter(mon => !!mon?.species).length}/30`,
  })), true, done);
  const chooseStored = (release: boolean): void => chooseBox(box => {
    if (box === null) { main(); return; }
    save.currentBox = box;
    const choices = save.boxes[box].flatMap((mon, slot) => mon?.species ? [{value: slot, label: `${decode(mon.nickname)}  Lv${mon.level}`}] : []);
    openHardwareChoice(decode(getBoxName(box)), choices, true, slot => {
      if (slot === null) { main(); return; }
      if (!release) { result(withdrawMon(box, slot), main); return; }
      // Source defaults to NO on release confirmation.
      openHardwareChoice("Release this POKéMON?", [{label: "NO", value: 0}, {label: "YES", value: 1}], true, answer => {
        if (answer === 1) result(releaseMon({box, slot}), main); else main();
      });
    });
  });
  const main = (): void => openHardwareChoice("POKéMON STORAGE", [
    {label: "WITHDRAW", value: 0}, {label: "DEPOSIT", value: 1}, {label: "RELEASE", value: 2}, {label: "NAME BOX", value: 3},
  ], true, choice => {
    if (choice === null) { close(); return; }
    if (choice === 0 || choice === 2) { chooseStored(choice === 2); return; }
    if (choice === 1) {
      openHardwareChoice("Deposit which POKéMON?", save.party.map((mon, slot) => ({label: decode(mon.nickname), value: slot})), true, slot => {
        if (slot === null) { main(); return; }
        chooseBox(box => { if (box === null) main(); else result(depositMon(slot, box), main); });
      });
    } else chooseBox(box => {
      if (box === null) { main(); return; }
      const name = Array.from(getBoxName(box));
      DoNamingScreen(C.NAMING_SCREEN_BOX, name, 0, 0, 0, () => {
        save.boxNames ??= Array.from({length: save.boxes.length}, (_, i) => Array.from(getBoxName(i)));
        save.boxNames[box] = name;
        main();
      });
    });
  });
  main();
}
