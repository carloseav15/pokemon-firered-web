export class GameClock {
  // One GBA video frame is 280,896 cycles at 16,777,216 cycles per second.
  static readonly FRAME_MS = (280_896 / 16_777_216) * 1000;
  private remainder = 0;
  private frame = 0;

  advance(deltaMs: number): number {
    // Cap a suspended tab's catch-up work, as it cannot replay minutes of input.
    this.remainder += Math.max(0, Math.min(Number.isFinite(deltaMs) ? deltaMs : 0, 250));
    const frames = Math.floor(this.remainder / GameClock.FRAME_MS);
    this.remainder -= frames * GameClock.FRAME_MS;
    this.frame += frames;
    return frames;
  }

  get frameNumber(): number { return this.frame; }
  get elapsedMs(): number { return this.frame * GameClock.FRAME_MS; }

  reset(): void {
    this.remainder = 0;
    this.frame = 0;
  }
}
