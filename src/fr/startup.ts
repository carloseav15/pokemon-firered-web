// Startup coordinator. Copyright through the title use intro.c graphics,
// constants, callbacks and the GBA-style TS hardware layer; Oak and naming
// use oak_speech.c / naming_screen.c texts, options and flow.
import { launchFireRed, type LaunchOptions } from "./boot";
import { CB2_WaitFadeBeforeSetUpIntro, IntroCopyright } from "./introCopyright";
import { CB2_Intro, IntroGameFreak, StartIntroSequence } from "./introGameFreak";
import { IntroScene1 } from "./introScene1";
import { IntroScene2 } from "./introScene2";
import { IntroScene3 } from "./introScene3";
import { IntroTitle } from "./introTitle";
import { OakSpeech } from "./oakSpeech";
import { sound } from "./audio/sound";
import { loadTrig } from "./hw/trig";
import { CB2_InitMainMenu, MainMenu } from "./mainMenu";
import { ClearSaveScreen } from "./clearSaveScreen";
import { joy, ReadKeys } from "./gba/input";
import { rom } from "./rom";
import { InitMainCallbacks, SetVBlankCallback } from "./hw/runtime";
import { LoadOam, ProcessSpriteCopyRequests } from "./hw/sprite";
import { TransferPlttBuffer } from "./hw/palette";
import { ScanlineEffect_InitHBlankDmaTransfer } from "./hw/scanline";
import { SeedRngAndSetTrainerId } from "./random";

type Stage = "copyright" | "logo" | "grass" | "forest" | "scene3" |
  "title" | "menu" | "clearsave" | "oak";
const introStages: Stage[] = ["copyright", "logo", "grass", "forest", "scene3"];

class Startup {
  private ctx: CanvasRenderingContext2D;
  private stage: Stage = "copyright";
  private introIndex = 0;
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private active = true;
  private readonly copyright = new IntroCopyright();
  private readonly gameFreak = new IntroGameFreak();
  private readonly scene1 = new IntroScene1();
  private readonly scene2 = new IntroScene2();
  private readonly scene3 = new IntroScene3();
  private readonly titleScreen = new IntroTitle();
  private readonly oakSpeech = new OakSpeech();
  private oakLoaded = false;
  private oakPending = false;
  private readonly mainMenu = new MainMenu();
  private readonly clearSave = new ClearSaveScreen();
  /** rom.load() (fonts, strings) runs in the background while the intro plays. */
  private romReady = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
  }

  async start(): Promise<void> {
    await Promise.all([
      IntroCopyright.preload(),
      IntroGameFreak.preload(),
      IntroScene1.preload(),
      IntroScene2.preload(),
      IntroScene3.preload(),
      IntroTitle.preload(),
      MainMenu.preload(),
      ClearSaveScreen.preload(),
      loadTrig(),
    ]);
    void rom.load().then(() => { this.romReady = true; });
    void OakSpeech.preload().then(() => { this.oakLoaded = true; });
    InitMainCallbacks();
    joy.attach();
    (window as unknown as { frStartup: unknown }).frStartup = this; // debug hook
    (window as unknown as { frStartupStep: unknown }).frStartupStep = (frames: number, buttons = 0): void => {
      // Debug: advance whole frames with buttons held (independent of rAF throttling).
      joy.press(buttons);
      for (let i = 0; i < frames; i++) {
        this.elapsed = 1000 / 60;
        this.tick(this.last || 0);
      }
      joy.release(buttons);
    };
    this.copyright.begin();
    window.addEventListener("keydown", this.keydown);
    this.raf = requestAnimationFrame(this.tick);
    this.canvas.focus();
  }

  private set(stage: Stage): void {
    this.stage = stage;
  }

  /** Back to the copyright screen (soft reset, or the title screen's idle timeout). */
  private restartIntro(): void {
    this.introIndex = 0;
    this.set("copyright");
    this.copyright.begin();
  }

  private tick = (now: number): void => {
    if (!this.active) return;
    if (!this.last) this.last = now;
    this.elapsed += Math.max(0, Math.min(250, now - this.last));
    this.last = now;
    let steps = 0;
    while (this.elapsed >= 1000 / 60 && steps++ < 8) {
      this.elapsed -= 1000 / 60;
      ReadKeys();
      sound.frame(); // m4aSoundMain runs every frame
      if (this.stage === "copyright") this.copyright.update();
      if (this.stage === "logo") CB2_Intro(this.gameFreak);
      if (this.stage === "grass") this.scene1.update();
      if (this.stage === "forest") this.scene2.update();
      if (this.stage === "scene3") this.scene3.update();
      if (this.stage === "title" && !this.titleScreen.done) this.titleScreen.update();
      if (this.stage === "title" && this.titleScreen.done && this.titleScreen.exitTo === "copyright") {
        this.restartIntro();
      }
      if (this.stage === "title" && this.titleScreen.done && this.titleScreen.exitTo === "clearsave") {
        this.set("clearsave");
        // The title screen's VBlankCB stays installed until the save-clear screen's fade finishes.
        SetVBlankCallback(() => {
          LoadOam();
          ProcessSpriteCopyRequests();
          TransferPlttBuffer();
          ScanlineEffect_InitHBlankDmaTransfer();
        });
        this.clearSave.CB2_SaveClearScreen_Init();
      }
      if (this.stage === "clearsave") {
        this.clearSave.update();
        if (this.clearSave.done) this.restartIntro(); // DoSoftReset
      }
      if (this.stage === "title" && this.titleScreen.done && this.titleScreen.exitTo === "menu" && this.romReady) {
        // CB2_InitMainMenu (a NEW GAME-only menu starts the new game immediately).
        // main.c seeds the LCG and trainer-ID low half from Timer1 before loading the menu.
        SeedRngAndSetTrainerId(this.titleScreen.timer1Low);
        this.set("menu");
        CB2_InitMainMenu();
      }
      if (this.stage === "menu") {
        this.mainMenu.update();
        const result = this.mainMenu.result;
        if (result === "continue") {
          this.enterGame({ mode: "continue" });
          break;
        }
        if (result === "newgame") {
          this.set("oak");
          this.oakPending = true;
        } else if (result === "title") {
          this.set("title");
          this.titleScreen.begin();
        }
      }
      if (this.stage === "oak") {
        // StartNewGameScene once oak_speech data is loaded (black screen until then).
        if (this.oakPending) {
          if (!this.oakLoaded) break;
          this.oakPending = false;
          this.oakSpeech.StartNewGameScene();
        }
        this.oakSpeech.update();
        if (this.oakSpeech.done) {
          this.enterGame({ mode: "new", ...this.oakSpeech.result });
          break;
        }
      }
      if (this.introIndex < introStages.length &&
          (this.stage === "copyright" ? CB2_WaitFadeBeforeSetUpIntro(this.copyright) :
            this.stage === "logo" ? this.gameFreak.done :
              this.stage === "grass" ? this.scene1.done :
                this.stage === "forest" ? this.scene2.done :
                  this.stage === "scene3" ? this.scene3.done :
                    false)) {
        this.introIndex++;
        this.set(introStages[this.introIndex] ?? "title");
        if (this.stage === "logo") StartIntroSequence(this.gameFreak);
        if (this.stage === "grass") this.scene1.begin();
        if (this.stage === "forest") this.scene2.begin();
        if (this.stage === "scene3") this.scene3.begin();
        if (this.stage === "title") this.titleScreen.begin();
      }
    }
    if (steps >= 8) this.elapsed = 0;
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 240, 160);
    if (this.stage === "copyright") return this.copyright.render(ctx);
    if (this.stage === "logo") return this.gameFreak.render(ctx);
    if (this.stage === "grass") return this.scene1.render(ctx);
    if (this.stage === "forest") return this.scene2.render(ctx);
    if (this.stage === "scene3") return this.scene3.render(ctx);
    if (this.stage === "menu") return this.mainMenu.render(ctx);
    if (this.stage === "clearsave") return this.clearSave.render(ctx);
    if (this.stage === "title") return this.titleScreen.render(ctx);
    if (this.stage === "oak") return this.oakSpeech.render(ctx);
  }

  private keydown = (event: KeyboardEvent): void => {
    const key = event.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Tab"].includes(key)) event.preventDefault();
    if (this.introIndex < introStages.length) {
      if (["Enter", " ", "a", "A"].includes(key)) {
        this.introIndex = introStages.length;
        this.set("title");
        this.titleScreen.begin();
      }
      return;
    }
    // The main menu and the save-clear screen read the GBA keypad (joy) like the rest of the hardware layer.
    if (this.stage === "menu" || this.stage === "clearsave" || this.stage === "oak") return;
  };

  private enterGame(options: LaunchOptions): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.keydown);
    void launchFireRed(options);
  }
}

export async function launchStartup(container: HTMLElement = document.getElementById("game")!): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 160;
  canvas.className = "fr-screen";
  canvas.tabIndex = 0;
  container.replaceChildren(canvas);
  const status = document.createElement("div");
  status.className = "fr-status";
  status.textContent = "Loading startup graphics…";
  container.appendChild(status);
  try {
    await new Startup(canvas).start();
    status.remove();
  } catch (error) {
    status.textContent = String(error);
    throw error;
  }
}
