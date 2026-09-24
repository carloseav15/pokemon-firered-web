import Phaser from "phaser";
import { type PlayerGender } from "../game/GameState";
import { hasFireRedSave, launchFireRed, type LaunchOptions } from "../fr/boot";
import { TextProcessor } from "../ui/TextProcessor";
import { GameClock } from "../engine/GameClock";

type IntroMode = "title" | "titleTransition" | "menu" | "controls" | "pikachu" | "oak" | "gender" | "playerName" | "playerConfirm" | "rivalPrompt" | "rivalName" | "rivalConfirm" | "letsGo";

// Three source pages from ControlsGuide_LoadPage1 / sControlsGuide_Pages2And3_Strings.
const controlsPages = [
  ["The various buttons will be explained in the order of their importance."],
  ["+Control Pad\nMoves the main character. Also used to choose various data headings.", "A Button\nUsed to confirm a choice, check things, chat, and scroll text.", "B Button\nUsed to exit, cancel a choice, and cancel a mode."],
  ["START\nPress this button to open the MENU.", "SELECT\nUsed to shift items and to use a registered item.", "L / R\nIf you need help playing the game, or on how to do things, press the L or R Button."],
];

const pikachuPages = [
  "In the world which you are about to enter, you will embark on a grand adventure with you as the hero.\n\nSpeak to people and check things wherever you go, be it towns, roads, or caves. Gather information and hints from every source.",
  "New paths will open to you by helping people in need, overcoming challenges, and solving mysteries.\n\nAt times, you will be challenged by others and attacked by wild creatures. Be brave and keep pushing on.",
  "Through your adventure, we hope that you will interact with all sorts of people and achieve personal growth. That is our biggest objective.\n\nPress the A Button, and let your adventure begin!",
];

// The source text printer waits at \p, while Task_OakSpeech_* automatically
// advances between messages after printing and the Nidoran♀ reveal/return.
const oakBeats: Array<{ text: string; waitForButton: boolean; nidoran?: boolean; delayFrames?: number }> = [
  { text: "Hello, there! Glad to meet you!", waitForButton: true },
  { text: "Welcome to the world of POKéMON!", waitForButton: true },
  { text: "My name is OAK.", waitForButton: true },
  { text: "People affectionately refer to me as the POKéMON PROFESSOR.", waitForButton: false },
  { text: "This world…", waitForButton: false, delayFrames: 30 },
  { text: "…is inhabited far and wide by creatures called POKéMON.", waitForButton: true, nidoran: true },
  { text: "For some people, POKéMON are pets. Others use them for battling.", waitForButton: true, nidoran: true },
  { text: "As for myself…", waitForButton: true, nidoran: true },
  { text: "I study POKéMON as a profession.", waitForButton: false, nidoran: true, delayFrames: 64 },
  { text: "But first, tell me a little about yourself.", waitForButton: false, delayFrames: 48 },
];

export class IntroScene extends Phaser.Scene {
  private mode: IntroMode = "title";
  private processor = new TextProcessor(4, 31);
  private pages: string[] = [];
  private pageIndex = 0;
  private character = 0;
  private elapsed = 0;
  private text?: Phaser.GameObjects.Text;
  private selection = 0;
  private playerGender: PlayerGender = "boy";
  private playerName = "RED";
  private rivalName = "GREEN";
  private nameBuffer = "";
  private guidePage = 0;
  private oakBeat = 0;
  private oakAdvanceTimer?: Phaser.Time.TimerEvent;

  constructor() { super("IntroScene"); }

  preload(): void {
    const root = "/assets/firered/startup";
    const composed = "/assets/firered/composed_intro";
    this.load.image("fireRedTitleLogo", `${composed}/title_screen/firered/game_title_logo.png`);
    this.load.image("fireRedTitleCharizard", `${composed}/title_screen/firered/box_art_mon.png`);
    this.load.image("oakPortrait", `${root}/oak_speech/oak/pic.png`);
    this.load.image("nidoranFIntro", `${root}/pokemon/nidoran_f/front.png`);
    this.load.image("redPortrait", `${root}/oak_speech/red/pic.png`);
    this.load.image("leafPortrait", `${root}/oak_speech/leaf/pic.png`);
    this.load.image("rivalPortrait", `${root}/oak_speech/rival/pic.png`);
  }

  create(): void {
    this.input.keyboard?.on("keydown-ENTER", () => this.advance());
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.keyboard?.on("keydown-A", () => {
      if (this.mode !== "playerName" && this.mode !== "rivalName") this.advance();
    });
    this.input.keyboard?.on("keydown-B", () => this.back());
    this.input.keyboard?.on("keydown-ESC", () => this.back());
    this.input.keyboard?.on("keydown-UP", () => this.moveSelection(-1));
    this.input.keyboard?.on("keydown-DOWN", () => this.moveSelection(1));
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => this.captureNameKey(event));
    this.showTitle();
  }

  update(_time: number, delta: number): void {
    if (!this.text) return;
    const page = this.pages[this.pageIndex] ?? "";
    if (this.character >= page.length) {
      if (this.mode === "oak" && !oakBeats[this.oakBeat]?.waitForButton && !this.oakAdvanceTimer) {
        const delay = oakBeats[this.oakBeat]?.delayFrames ?? 1;
        this.oakAdvanceTimer = this.time.delayedCall(delay * GameClock.FRAME_MS, () => {
          this.oakAdvanceTimer = undefined;
          this.showOakBeat(this.oakBeat + 1);
        });
      }
      return;
    }
    this.elapsed += delta;
    if (this.elapsed < 20) return;
    this.elapsed = 0;
    this.character = Math.min(page.length, this.character + 1);
    this.text.setText(page.slice(0, this.character));
  }

  private showTitle(): void {
    this.mode = "title";
    this.clearScreen("#000000");
    const charizard = this.add.image(120, 80, "fireRedTitleCharizard").setOrigin(0.5).setAlpha(0);
    const logo = this.add.image(120, 80, "fireRedTitleLogo").setOrigin(0.5).setAlpha(0);
    const copyright = this.add.text(13, 132, "©2004 GAME FREAK inc.", { color: "#ffffff", fontFamily: "monospace", fontSize: "5px" }).setAlpha(0);
    const prompt = this.add.text(120, 147, "PRESS START", { color: "#ffffff", fontFamily: "monospace", fontSize: "7px" }).setOrigin(0.5).setAlpha(0);
    // title_screen.c: flash sprite -> fade in -> run. The source layers are
    // preserved; Phaser reproduces the visible fade/window transition.
    this.tweens.add({ targets: charizard, alpha: 1, duration: 620, delay: 120 });
    this.tweens.add({ targets: logo, alpha: 1, duration: 520, delay: 660 });
    this.tweens.add({ targets: [copyright, prompt], alpha: 1, duration: 280, delay: 1080 });
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 500, delay: 1400, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: charizard, x: 116, duration: 900, delay: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  private leaveTitle(): void {
    if (this.mode !== "title") return;
    // SetTitleScreenScene_Cry waits 90 video frames before entering main_menu.c.
    // The cry and register fades still need their own presentation port.
    this.mode = "titleTransition";
    this.tweens.killAll();
    this.cameras.main.fadeOut(280, 255, 255, 255);
    this.time.delayedCall(90 * GameClock.FRAME_MS, () => {
      this.cameras.main.resetFX();
      if (hasFireRedSave()) this.showMenu();
      else this.showControlsPage(0);
    });
  }

  private showMenu(): void {
    this.mode = "menu";
    this.selection = 0;
    this.clearScreen("#0c2856");
    this.add.image(120, 80, "fireRedTitleLogo").setOrigin(0.5);
    this.add.image(120, 80, "fireRedTitleCharizard").setOrigin(0.5);
    const saved = hasFireRedSave();
    this.add.rectangle(120, 125, 108, saved ? 42 : 24, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    const options = saved ? ["CONTINUE", "NEW GAME"] : ["NEW GAME"];
    options.forEach((option, index) => this.add.text(85, 113 + index * 14, option, { color: "#222222", fontFamily: "monospace", fontSize: "7px" }).setName(`menu-${index}`));
    this.drawCursor();
  }

  private showControlsPage(page: number): void {
    this.mode = "controls";
    this.guidePage = page;
    this.clearScreen("#162945");
    this.add.text(10, 8, "CONTROLS", { color: "#ffffff", fontFamily: "monospace", fontSize: "8px" });
    this.add.text(230, 8, page === 0 ? "A: NEXT" : "A: NEXT  B: BACK", { color: "#ffffff", fontFamily: "monospace", fontSize: "6px" }).setOrigin(1, 0);
    if (page === 0) {
      this.add.text(15, 62, controlsPages[0][0], { color: "#ffffff", fontFamily: "monospace", fontSize: "8px", wordWrap: { width: 210 }, lineSpacing: 3 });
    } else {
      controlsPages[page].forEach((entry, index) => this.add.text(17, 31 + index * 40, entry, { color: "#ffffff", fontFamily: "monospace", fontSize: "7px", wordWrap: { width: 205 }, lineSpacing: 1 }));
    }
  }

  private showPikachuPage(page: number): void {
    this.mode = "pikachu";
    this.guidePage = page;
    this.clearScreen("#f8f8f8");
    this.add.text(10, 8, "POKÉMON ADVENTURE", { color: "#382c2c", fontFamily: "monospace", fontSize: "8px" });
    this.add.text(230, 8, page === 0 ? "A: NEXT" : "A: NEXT  B: BACK", { color: "#382c2c", fontFamily: "monospace", fontSize: "6px" }).setOrigin(1, 0);
    this.add.text(15, 34, pikachuPages[page], { color: "#222222", fontFamily: "monospace", fontSize: "7px", wordWrap: { width: 210 }, lineSpacing: 2 });
  }

  private showOakBeat(index: number): void {
    if (index >= oakBeats.length) return this.showGender();
    this.mode = "oak";
    this.oakBeat = index;
    this.clearScreen("#f8f8f8");
    this.add.image(120, 102, "oakPortrait").setOrigin(0.5, 1);
    if (oakBeats[index].nidoran) this.add.image(149, 97, "nidoranFIntro").setOrigin(0.5, 1);
    this.add.rectangle(120, 133, 232, 51, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    this.pages = this.processor.pages([oakBeats[index].text]);
    this.pageIndex = 0;
    this.character = 0;
    this.elapsed = 0;
    this.text = this.add.text(13, 112, "", { color: "#222222", fontFamily: "monospace", fontSize: "7px", lineSpacing: 1, wordWrap: { width: 212 } });
    if (oakBeats[index].waitForButton) this.add.text(218, 145, "▼", { color: "#382c2c", fontFamily: "monospace", fontSize: "7px" });
  }

  private startPages(mode: Extract<IntroMode, "rivalPrompt" | "letsGo">, lines: string[], portrait?: string): void {
    this.mode = mode;
    this.clearScreen("#f8f8f8");
    if (portrait) this.add.image(120, 80, portrait).setOrigin(0.5, 1);
    this.pages = this.processor.pages(lines, { playerName: this.playerName, rivalName: this.rivalName });
    this.pageIndex = 0;
    this.character = 0;
    this.elapsed = 0;
    this.text = this.add.text(13, 108, "", { color: "#222222", fontFamily: "monospace", fontSize: "7px", lineSpacing: 1, wordWrap: { width: 212 } });
    this.add.text(218, 145, "▼", { color: "#382c2c", fontFamily: "monospace", fontSize: "7px" });
  }

  private showGender(): void {
    this.mode = "gender";
    this.selection = 0;
    this.clearScreen("#f8f8f8");
    this.add.text(12, 111, "Now tell me. Are you a boy? Or are you a girl?", { color: "#222222", fontFamily: "monospace", fontSize: "7px", wordWrap: { width: 212 } });
    this.add.rectangle(181, 48, 70, 36, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    this.add.text(162, 38, "BOY", { color: "#222222", fontFamily: "monospace", fontSize: "7px" }).setName("gender-0");
    this.add.text(162, 55, "GIRL", { color: "#222222", fontFamily: "monospace", fontSize: "7px" }).setName("gender-1");
    this.drawCursor();
  }

  private showNameEntry(kind: "player" | "rival"): void {
    this.mode = kind === "player" ? "playerName" : "rivalName";
    this.nameBuffer = kind === "player" ? this.playerName : this.rivalName;
    this.clearScreen("#f8f8f8");
    const portrait = kind === "player" ? (this.playerGender === "boy" ? "redPortrait" : "leafPortrait") : "rivalPortrait";
    this.add.image(120, 96, portrait).setOrigin(0.5, 1);
    const question = kind === "player" ? "Let's begin with your name. What is it?" : "Your rival's name, what was it now?";
    this.add.text(12, 109, question, { color: "#222222", fontFamily: "monospace", fontSize: "7px", wordWrap: { width: 212 } });
    this.add.rectangle(120, 46, 110, 18, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    this.add.text(120, 43, this.nameBuffer || "_", { color: "#222222", fontFamily: "monospace", fontSize: "8px" }).setName("name-value").setOrigin(0.5);
    this.add.text(120, 66, "TYPE A-Z · ENTER CONFIRM", { color: "#56606e", fontFamily: "monospace", fontSize: "5px" }).setOrigin(0.5);
  }

  private showNameConfirm(kind: "player" | "rival"): void {
    this.mode = kind === "player" ? "playerConfirm" : "rivalConfirm";
    this.selection = 0;
    this.clearScreen("#f8f8f8");
    const name = kind === "player" ? this.playerName : this.rivalName;
    const portrait = kind === "player" ? (this.playerGender === "boy" ? "redPortrait" : "leafPortrait") : "rivalPortrait";
    this.add.image(120, 96, portrait).setOrigin(0.5, 1);
    this.add.text(12, 110, kind === "player" ? `Right… So your name is ${name}?` : `…Er, was it ${name}?`, { color: "#222222", fontFamily: "monospace", fontSize: "7px", wordWrap: { width: 212 } });
    this.add.rectangle(183, 52, 56, 36, 0xf8f8f8).setStrokeStyle(2, 0x382c2c);
    this.add.text(167, 42, "YES", { color: "#222222", fontFamily: "monospace", fontSize: "7px" }).setName("confirm-0");
    this.add.text(167, 59, "NO", { color: "#222222", fontFamily: "monospace", fontSize: "7px" }).setName("confirm-1");
    this.drawCursor();
  }

  private advance(): void {
    if (this.mode === "title") return this.leaveTitle();
    if (this.mode === "titleTransition") return;
    if (this.mode === "menu") {
      const saved = hasFireRedSave();
      if (saved && this.selection === 0) {
        this.handOff({ mode: "continue" });
        return;
      }
      return this.showControlsPage(0);
    }
    if (this.mode === "controls") return this.guidePage < 2 ? this.showControlsPage(this.guidePage + 1) : this.showPikachuPage(0);
    if (this.mode === "pikachu") return this.guidePage < 2 ? this.showPikachuPage(this.guidePage + 1) : this.showOakBeat(0);
    if (this.mode === "oak") {
      const page = this.pages[this.pageIndex] ?? "";
      if (this.character < page.length) {
        this.character = page.length;
        this.text?.setText(page);
      } else if (oakBeats[this.oakBeat]?.waitForButton) this.showOakBeat(this.oakBeat + 1);
      return;
    }
    if (this.mode === "gender") {
      this.playerGender = this.selection === 0 ? "boy" : "girl";
      return this.showNameEntry("player");
    }
    if (this.mode === "playerName" || this.mode === "rivalName") {
      if (!this.nameBuffer.trim()) return;
      if (this.mode === "playerName") this.playerName = this.nameBuffer;
      else this.rivalName = this.nameBuffer;
      return this.showNameConfirm(this.mode === "playerName" ? "player" : "rival");
    }
    if (this.mode === "playerConfirm" || this.mode === "rivalConfirm") {
      const player = this.mode === "playerConfirm";
      if (this.selection === 1) return this.showNameEntry(player ? "player" : "rival");
      return player ? this.showRivalPrompt() : this.startAdventure();
    }
    const page = this.pages[this.pageIndex] ?? "";
    if (this.character < page.length) {
      this.character = page.length;
      this.text?.setText(page);
      return;
    }
    this.pageIndex += 1;
    if (this.pageIndex < this.pages.length) {
      this.character = 0;
      this.text?.setText("");
      return;
    }
    if (this.mode === "rivalPrompt") return this.showNameEntry("rival");
    if (this.mode === "letsGo") return this.enterWorld();
  }

  private back(): void {
    if (this.mode === "menu") return this.showTitle();
    if (this.mode === "controls" && this.guidePage > 0) return this.showControlsPage(this.guidePage - 1);
    if (this.mode === "pikachu" && this.guidePage > 0) return this.showPikachuPage(this.guidePage - 1);
    if (this.mode === "playerConfirm") return this.showNameEntry("player");
    if (this.mode === "rivalConfirm") return this.showNameEntry("rival");
  }

  private showRivalPrompt(): void {
    this.startPages("rivalPrompt", ["This is my grandson. He's been your rival since you both were babies. …Erm, what was his name now?"], "rivalPortrait");
  }

  private startAdventure(): void {
    this.startPages("letsGo", ["That's right! I remember now! His name is {RIVAL}!", "{PLAYER}! Your very own POKéMON legend is about to unfold! A world of dreams and adventures with POKéMON awaits! Let's go!"], this.playerGender === "boy" ? "redPortrait" : "leafPortrait");
  }

  private enterWorld(): void {
    this.handOff({ mode: "new", playerName: this.playerName, gender: this.playerGender === "girl" ? 1 : 0, rivalName: this.rivalName });
  }

  /** Leave Phaser and hand control to the decomp-driven FireRed engine. */
  private handOff(options: LaunchOptions): void {
    this.game.destroy(true);
    void launchFireRed(options);
  }

  private moveSelection(delta: number): void {
    if (!["menu", "gender", "playerConfirm", "rivalConfirm"].includes(this.mode)) return;
    const count = this.mode === "menu" ? (hasFireRedSave() ? 2 : 1) : 2;
    this.selection = (this.selection + delta + count) % count;
    this.drawCursor();
  }

  private drawCursor(): void {
    this.children.getByName("cursor")?.destroy();
    const y = this.mode === "menu" ? 113 + this.selection * 14 : this.mode === "gender" ? 38 + this.selection * 17 : 42 + this.selection * 17;
    const x = this.mode === "menu" ? 73 : this.mode === "gender" ? 151 : 156;
    this.add.text(x, y, "▶", { color: "#222222", fontFamily: "monospace", fontSize: "6px" }).setName("cursor");
  }

  private captureNameKey(event: KeyboardEvent): void {
    if (this.mode !== "playerName" && this.mode !== "rivalName") return;
    if (event.key === "Backspace") this.nameBuffer = this.nameBuffer.slice(0, -1);
    else if (/^[a-z]$/i.test(event.key) && this.nameBuffer.length < 7) this.nameBuffer += event.key.toUpperCase();
    const label = this.children.getByName("name-value") as Phaser.GameObjects.Text | undefined;
    label?.setText(this.nameBuffer || "_");
  }

  private clearScreen(color: string): void {
    this.oakAdvanceTimer?.remove();
    this.oakAdvanceTimer = undefined;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor(color);
    this.text = undefined;
  }

}
