// Pokemon Storage System adapter: WITHDRAW / DEPOSIT / MOVE MON (grab, place,
// shift) / MOVE ITEMS (give, take) / WALLPAPER / NAME BOX. Rules reuse the
// pokemon_storage_system_data.c ports; the sprite grid, cursor animations and
// wallpaper backdrops remain pending (boxes list counts and wallpaper names).
import type { Game } from "../game";
import { HwScene } from "../hw/runtime";
import { openHardwareChoice } from "./hardwareChoice";
import {
  depositMon, getBoxName, getBoxWallpaper, giveHeldItem, moveMon, releaseMon,
  setBoxWallpaper, WALLPAPER_NAMES, withdrawMon,
  type StorageLocation, type StorageResult,
} from "../pokemon/storage";
import { addBagItem, itemName } from "../pokemon/items";
import { isMailItem } from "../pokemon/mail";
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
  const say = (label: string, next: () => void): void =>
    openHardwareChoice(label, [{ label: "OK", value: 0 }], false, next);
  const result = (value: StorageResult, next: () => void): void => {
    if (value === "ok") { next(); return; }
    const labels: Record<Exclude<StorageResult, "ok">, string> = {
      invalid: "No POKéMON selected.", partyFull: "Your party is full.", boxFull: "That BOX is full.",
      lastUsable: "That's your last POKéMON!", mail: "Please remove the MAIL.", egg: "You can't release an EGG.",
      neededMove: "It came back!", bagFull: "Your BAG is full.",
    };
    say(labels[value], next);
  };
  const boxLabel = (box: number): string =>
    `${decode(getBoxName(box))} ${save.boxes[box].filter((mon) => !!mon?.species).length}/30 ${WALLPAPER_NAMES[getBoxWallpaper(box)]}`;
  const monLabel = (box: number, slot: number): string => {
    const mon = box === -1 ? save.party[slot] : save.boxes[box]?.[slot];
    const head = `#${slot + 1}`;
    if (!mon?.species) return `${head} ---`;
    return `${head} ${decode(mon.nickname)} Lv${mon.level}`;
  };
  const chooseBox = (done: (box: number | null) => void): void => openHardwareChoice("Choose a BOX.",
    save.boxes.map((_, i) => ({ value: i, label: boxLabel(i) })), true, done);
  const choosePartyMon = (title: string, filter: (slot: number) => boolean, done: (slot: number | null) => void): void => {
    const slots = save.party.map((_, i) => i).filter(filter);
    if (!slots.length) { say("No POKéMON qualifies.", main); return; }
    openHardwareChoice(title, slots.map((i) => ({ value: i, label: monLabel(-1, i) })), true, done);
  };
  const chooseBoxSlot = (box: number, title: string, occupiedOnly: boolean, done: (slot: number | null) => void): void => {
    const slots = save.boxes[box].map((_, i) => i).filter((i) => !occupiedOnly || save.boxes[box][i]?.species);
    if (!slots.length) { say("The BOX is empty.", main); return; }
    save.currentBox = box;
    openHardwareChoice(title, slots.map((i) => ({ value: i, label: monLabel(box, i) })), true, done);
  };
  const chooseLocation = (title: string, occupiedOnly: boolean, done: (loc: StorageLocation | null) => void): void => {
    openHardwareChoice(title, [{ label: "PARTY", value: 0 }, { label: "BOX", value: 1 }], true, (area) => {
      if (area === null) { done(null); return; }
      if (area === 0) {
        choosePartyMon(title, () => true, (slot) => done(slot === null ? null : { box: -1, slot }));
        return;
      }
      chooseBox((box) => {
        if (box === null) { done(null); return; }
        chooseBoxSlot(box, title, occupiedOnly, (slot) => done(slot === null ? null : { box, slot }));
      });
    });
  };
  const chooseStored = (release: boolean): void => chooseBox((box) => {
    if (box === null) { main(); return; }
    chooseBoxSlot(box, decode(getBoxName(box)), true, (slot) => {
      if (slot === null) { main(); return; }
      if (!release) { result(withdrawMon(box, slot), main); return; }
      // Source defaults to NO on release confirmation.
      openHardwareChoice("Release this POKéMON?", [{ label: "NO", value: 0 }, { label: "YES", value: 1 }], true, (answer) => {
        if (answer === 1) result(releaseMon({ box, slot }), main); else main();
      });
    });
  });
  // MOVE MON grab/place/shift across party slots and box slots.
  const moveMonFlow = (): void => chooseLocation("Move which POKéMON?", true, (from) => {
    if (!from) { main(); return; }
    chooseLocation("Move it where?", false, (to) => {
      if (!to) { main(); return; }
      result(moveMon(from, to), main);
    });
  });
  // MOVE ITEMS: give held items to other mons, or take them to the BAG.
  // Mail is never picked up (Task_PrintCantStoreMail).
  const moveItemsFlow = (): void => chooseLocation("Whose ITEM?", true, (from) => {
    if (!from) { main(); return; }
    const holder = from.box === -1 ? save.party[from.slot] : save.boxes[from.box]?.[from.slot];
    if (!holder?.species || !holder.heldItem || isMailItem(holder.heldItem)) {
      say(holder?.heldItem ? "MAIL can't be moved here." : "It's not holding anything.", main);
      return;
    }
    openHardwareChoice("Do what with it?", [{ label: "GIVE TO", value: 0 }, { label: "TAKE TO BAG", value: 1 }], true, (action) => {
      if (action === null) { main(); return; }
      if (action === 1) {
        if (!addBagItem(holder.heldItem, 1)) { result("bagFull", main); return; }
        holder.heldItem = 0;
        holder.mailMessage = undefined;
        say("Placed in BAG.", main);
        return;
      }
      chooseLocation("Give it to whom?", true, (to) => {
        if (!to) { main(); return; }
        result(giveHeldItem(from, to), main);
      });
    });
  });
  const wallpaperFlow = (): void => chooseBox((box) => {
    if (box === null) { main(); return; }
    const current = getBoxWallpaper(box);
    openHardwareChoice("Pick a WALLPAPER.", WALLPAPER_NAMES.map((name, value) => ({
      label: `${value === current ? "*" : " "}${name}`, value,
    })), true, (wallpaper) => {
      if (wallpaper === null) { main(); return; }
      setBoxWallpaper(box, wallpaper);
      main();
    });
  });
  const main = (): void => openHardwareChoice("POKéMON STORAGE", [
    { label: "WITHDRAW", value: 0 }, { label: "DEPOSIT", value: 1 }, { label: "MOVE MON", value: 2 },
    { label: "MOVE ITEMS", value: 3 }, { label: "WALLPAPER", value: 4 }, { label: "NAME BOX", value: 5 },
  ], true, (choice) => {
    if (choice === null) { close(); return; }
    if (choice === 0) { chooseStored(false); return; }
    if (choice === 1) {
      openHardwareChoice("Deposit which POKéMON?", save.party.map((mon, value) => ({ label: decode(mon.nickname), value })), true, (slot) => {
        if (slot === null) { main(); return; }
        chooseBox((box) => { if (box === null) main(); else result(depositMon(slot, box), main); });
      });
      return;
    }
    if (choice === 2) { moveMonFlow(); return; }
    if (choice === 3) { moveItemsFlow(); return; }
    if (choice === 4) { wallpaperFlow(); return; }
    chooseBox((box) => {
      if (box === null) { main(); return; }
      const name = Array.from(getBoxName(box));
      DoNamingScreen(C.NAMING_SCREEN_BOX, name, 0, 0, 0, () => {
        save.boxNames ??= Array.from({ length: save.boxes.length }, (_, i) => Array.from(getBoxName(i)));
        save.boxNames[box] = name;
        main();
      });
    });
  });
  main();
}
