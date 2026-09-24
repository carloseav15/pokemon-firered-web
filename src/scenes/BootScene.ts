import Phaser from "phaser";

type StartupBeat = "copyright" | "gameFreak" | "sceneOne" | "sceneTwo" | "sceneThree";

/**
 * Browser recreation of FireRed's pre-title presentation. The GBA BIOS is
 * intentionally excluded because it is hardware firmware, not FireRed code.
 */
export class BootScene extends Phaser.Scene {
  private beatIndex = 0;
  private readonly beats: StartupBeat[] = ["copyright", "gameFreak", "sceneOne", "sceneTwo", "sceneThree"];
  private advanceTimer?: Phaser.Time.TimerEvent;
  private finished = false;
  private sceneOneFrame = 0;
  private gengarFrame = 0;
  private sceneTwoLayers: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.TileSprite> = [];

  constructor() { super("BootScene"); }

  preload(): void {
    const root = "/assets/firered/startup";
    const composed = "/assets/firered/composed_intro";
    this.load.image("startupCopyright", `${root}/intro/copyright.png`);
    this.load.image("startupGameFreakWordmark", `${root}/intro/game_freak/game_freak.png`);
    this.load.image("startupGameFreakLogo", `${root}/intro/game_freak/logo.png`);
    this.load.image("startupStar", `${root}/intro/game_freak/star.png`);
    this.load.spritesheet("startupPresents", `${root}/intro/game_freak/presents.png`, { frameWidth: 32, frameHeight: 8 });
    this.load.spritesheet("startupSmallSparkles", `${root}/intro/game_freak/sparkles_small.png`, { frameWidth: 8, frameHeight: 8 });
    this.load.spritesheet("startupBigSparkles", `${root}/intro/game_freak/sparkles_big.png`, { frameWidth: 32, frameHeight: 32 });
    this.load.image("startupGameFreakLayer", `${composed}/intro/game_freak/bg.png`);
    this.load.image("startupSceneOneBgMap", `${composed}/intro/scene_1/bg_map.png`);
    this.load.image("startupSceneOneGrassMap", `${composed}/intro/scene_1/grass_map.png`);
    this.load.image("startupSceneTwoBgMap", `${composed}/intro/scene_2/bg_map.png`);
    this.load.image("startupSceneTwoPlantsMap", `${composed}/intro/scene_2/plants_map.png`);
    this.load.image("startupSceneTwoGengarClose", `${composed}/intro/scene_2/gengar_close.png`);
    this.load.image("startupSceneTwoNidorinoClose", `${composed}/intro/scene_2/nidorino_close.png`);
    this.load.image("startupSceneTwoGengar", `${root}/intro/scene_2/gengar.png`);
    this.load.image("startupSceneTwoNidorino", `${root}/intro/scene_2/nidorino.png`);
    this.load.image("startupSceneThreeBgMap", `${composed}/intro/scene_3/bg_map.png`);
    this.load.image("startupSceneThreeGengarMap", `${composed}/intro/scene_3/gengar_anim_map.png`);
    this.load.spritesheet("startupSceneThreeNidorino", `${root}/intro/scene_3/nidorino.png`, { frameWidth: 64, frameHeight: 64 });
  }

  create(): void {
    // intro.c accepts A, START, and SELECT. Enter/space are the browser's
    // keyboard equivalents for START/SELECT; A remains available as A.
    ["keydown-A", "keydown-ENTER", "keydown-SPACE"].forEach((event) =>
      this.input.keyboard?.on(event, () => this.finish()),
    );
    this.anims.create({ key: "startup-small-sparkle", frames: this.anims.generateFrameNumbers("startupSmallSparkles", { start: 0, end: 3 }), frameRate: 15, repeat: 0 });
    this.anims.create({ key: "startup-big-sparkle", frames: this.anims.generateFrameNumbers("startupBigSparkles", { start: 0, end: 3 }), frameRate: 7.5, repeat: 0 });
    this.showBeat();
  }

  private showBeat(): void {
    if (this.finished) return;
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.children.removeAll(true);
    this.cameras.main.resetFX();
    this.cameras.main.setBackgroundColor("#000000");
    const beat = this.beats[this.beatIndex];
    if (!beat) return this.finish();
    if (beat === "copyright") this.drawCopyright();
    if (beat === "gameFreak") this.drawGameFreak();
    if (beat === "sceneOne") this.drawSceneOne();
    if (beat === "sceneTwo") this.drawSceneTwo();
    if (beat === "sceneThree") this.drawSceneThree();
    // Timings are derived from the callback phases in src/intro.c at 60 Hz,
    // rather than a single arbitrary delay per screen.
    // Scene 1 ends after its source task's 30-frame window; Scene 2 uses the
    // original two 60-frame pans. The browser runs this sequence at 60 Hz.
    const duration = beat === "copyright" ? 1250 : beat === "gameFreak" ? 6900 : beat === "sceneOne" ? 650 : beat === "sceneTwo" ? 2150 : 6900;
    this.advanceTimer = this.time.delayedCall(duration, () => { this.beatIndex += 1; this.showBeat(); });
  }

  private drawCopyright(): void { this.add.image(120, 76, "startupCopyright").setOrigin(0.5); }

  private drawGameFreak(): void {
    this.add.image(120, 80, "startupGameFreakLayer").setOrigin(0.5);
    const logo = this.add.image(120, 70, "startupGameFreakLogo").setOrigin(0.5).setAlpha(0);
    const wordmark = this.add.image(120, 80, "startupGameFreakWordmark").setOrigin(0.5).setAlpha(0);
    const star = this.add.image(248, 55, "startupStar").setOrigin(0.5).setAlpha(0);
    // IntroCB_GF_OpenWindow -> Star -> RevealName -> RevealLogo.
    const topCurtain = this.add.rectangle(120, 24, 240, 48, 0x000000);
    const bottomCurtain = this.add.rectangle(120, 136, 240, 48, 0x000000);
    this.tweens.add({ targets: [topCurtain, bottomCurtain], y: (target: Phaser.GameObjects.Rectangle) => target === topCurtain ? -24 : 184, duration: 100, ease: "Linear" });
    // SpriteCB_Star starts off the right edge and travels left/down.
    this.tweens.add({ targets: star, alpha: 1, duration: 30, delay: 100 });
    this.tweens.add({ targets: star, x: -8, y: 96, duration: 700, delay: 100, ease: "Linear" });
    this.tweens.add({ targets: wordmark, alpha: 1, duration: 550, delay: 2700 });
    this.tweens.add({ targets: logo, alpha: 1, duration: 270, delay: 4250 });
    const presents = [0, 1].map((frame) => this.add.sprite(104 + frame * 32, 108, "startupPresents", frame).setOrigin(0.5).setAlpha(0));
    this.tweens.add({ targets: [logo, wordmark, star, ...presents], alpha: 0, duration: 330, delay: 6220 });
    const sparklePoints = [[72, 80], [136, 74], [168, 80], [120, 80], [104, 86], [88, 74], [184, 74], [56, 86], [152, 86]] as const;
    let sparkleIndex = 0;
    this.time.addEvent({ delay: 116, startAt: 600, repeat: 17, callback: () => {
      const [x, y] = sparklePoints[sparkleIndex++ % sparklePoints.length];
      this.add.sprite(x, y, "startupSmallSparkles").play("startup-small-sparkle");
    } });
    let bigSparkleIndex = 0;
    this.time.addEvent({ delay: 166, startAt: 2100, repeat: 8, callback: () => {
      const [x, y] = sparklePoints[(bigSparkleIndex++ * 4) % sparklePoints.length];
      this.add.sprite(x, y, "startupBigSparkles").play("startup-big-sparkle");
    } });
    this.time.delayedCall(4250, () => presents.forEach((child) => this.tweens.add({ targets: child, alpha: 1, duration: 270 })));
  }

  private drawSceneOne(): void {
    this.sceneOneFrame = 0;
    const bg = this.add.tileSprite(0, 0, 240, 160, "startupSceneOneBgMap").setOrigin(0);
    const grass = this.add.tileSprite(0, 0, 240, 160, "startupSceneOneGrassMap").setOrigin(0);
    this.cameras.main.fadeFrom(180, 255, 255, 255);
    // Scene1_Task_AnimateGrass changes to the next 128px map section every
    // six GBA frames. Scene1_Task_BgZoom starts after 20 frames and advances
    // its background every four frames; the scene exits at frame 30.
    this.time.addEvent({ delay: 100, repeat: 4, callback: () => { this.sceneOneFrame = (this.sceneOneFrame + 1) % 3; grass.tilePositionY = this.sceneOneFrame * 128; } });
    this.time.delayedCall(333, () => { bg.tilePositionY = 128; });
    this.time.delayedCall(400, () => { bg.tilePositionY = 256; });
    this.time.delayedCall(470, () => this.cameras.main.fade(180, 255, 255, 255));
  }

  private drawSceneTwo(): void {
    const forest = this.add.tileSprite(0, 0, 240, 160, "startupSceneTwoBgMap").setOrigin(0);
    const plants = this.add.tileSprite(0, 0, 240, 160, "startupSceneTwoPlantsMap").setOrigin(0);
    const nidorino = this.add.image(168, 80, "startupSceneTwoNidorino").setOrigin(0.5);
    const gengar = this.add.image(72, 80, "startupSceneTwoGengar").setOrigin(0.5);
    this.sceneTwoLayers = [plants, nidorino, gengar];
    // Scene2_Task_PanForest scrolls for 60 frames (52px background and 64px
    // foreground). Then the source hides the wide shot and pans the two close
    // BG layers for another 60 frames.
    this.tweens.add({ targets: forest, tilePositionX: -52.5, duration: 1000, ease: "Linear" });
    this.tweens.add({ targets: plants, tilePositionX: 63.75, duration: 1000, ease: "Linear" });
    this.time.delayedCall(1000, () => {
      forest.setVisible(false);
      this.sceneTwoLayers.forEach((layer) => layer.setVisible(false));
      const closeBg = this.add.tileSprite(0, 0, 240, 160, "startupSceneTwoBgMap").setOrigin(0);
      closeBg.tilePositionY = 256;
      const closeGengar = this.add.image(120, 80, "startupSceneTwoGengarClose").setOrigin(0.5);
      const closeNidorino = this.add.image(120, 80, "startupSceneTwoNidorinoClose").setOrigin(0.5);
      this.tweens.add({ targets: closeGengar, y: 72.5, duration: 1000, ease: "Linear" });
      this.tweens.add({ targets: closeNidorino, y: 88.5, duration: 1000, ease: "Linear" });
    });
  }

  private drawSceneThree(): void {
    const forest = this.add.tileSprite(0, 0, 240, 160, "startupSceneThreeBgMap").setOrigin(0);
    const gengarLayer = this.add.tileSprite(0, 0, 240, 160, "startupSceneThreeGengarMap").setOrigin(0);
    gengarLayer.tilePositionY = 496;
    const nidorino = this.add.sprite(0, 100, "startupSceneThreeNidorino", 0).setOrigin(0.5);
    // Port the source entrance, cry, recoil, counterattack, and final zoom as
    // timed scene states while keeping all actions on FireRed's 60Hz frame.
    this.tweens.add({ targets: nidorino, x: 180, duration: 850, ease: "Quad.easeOut" });
    this.time.addEvent({ delay: 500, loop: true, callback: () => { this.gengarFrame = 1 - this.gengarFrame; gengarLayer.tilePositionY = this.gengarFrame ? 112 : 496; } });
    this.tweens.add({ targets: forest, tilePositionX: 128, duration: 680, ease: "Linear" });
    this.time.delayedCall(1450, () => nidorino.setFrame(2));
    this.time.delayedCall(1600, () => nidorino.setFrame(1));
    this.time.delayedCall(2400, () => { nidorino.setFrame(0); });
    this.time.delayedCall(2900, () => {
      gengarLayer.tilePositionY = 112;
      nidorino.setFrame(2);
      this.tweens.add({ targets: gengarLayer, tilePositionX: gengarLayer.tilePositionX + 24, tilePositionY: gengarLayer.tilePositionY + 16, duration: 250, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
      this.tweens.add({ targets: nidorino, x: 168, y: 95, duration: 250, yoyo: true, repeat: 1, ease: "Quad.easeOut" });
    });
    this.time.delayedCall(4100, () => {
      nidorino.setFrame(3);
      this.tweens.add({ targets: nidorino, x: 158, y: 92, duration: 150, yoyo: true, repeat: 3, ease: "Sine.easeOut" });
    });
    this.time.delayedCall(5450, () => {
      this.tweens.add({ targets: nidorino, scale: 1.35, duration: 900, ease: "Quad.easeIn" });
      this.tweens.add({ targets: this.cameras.main, zoom: 1.35, duration: 900, ease: "Quad.easeIn" });
      this.cameras.main.fadeOut(700, 0, 0, 0);
    });
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.advanceTimer?.remove(false);
    this.tweens.killAll();
    this.scene.start("IntroScene");
  }
}
