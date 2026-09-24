type SoundEffect = "step" | "dialogue" | "warp";

/**
 * Prototype audio layer.
 *
 * The source map references MUS_PALLET / mus_pallet.mid. We intentionally do
 * not ship that copyrighted source recording here; this manager provides a
 * small synthesized placeholder with the same lifecycle contract so the game
 * can be replaced by a licensed or recreated track later.
 */
export class AudioManager {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private muted = false;
  private started = false;

  unlock(): void {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      this.context = new AudioContextConstructor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.18;
      this.masterGain.connect(this.context.destination);
      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.masterGain);
    }

    if (this.context.state === "suspended") void this.context.resume();
    if (!this.started) this.startMusicLoop();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 0.18;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  play(effect: SoundEffect): void {
    if (!this.context || !this.masterGain || this.muted) return;
    const frequencies: Record<SoundEffect, number> = {
      step: 180,
      dialogue: 520,
      warp: 260,
    };
    const duration = effect === "warp" ? 0.22 : 0.07;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = effect === "dialogue" ? "square" : "triangle";
    oscillator.frequency.setValueAtTime(frequencies[effect], now);
    if (effect === "warp") oscillator.frequency.exponentialRampToValueAtTime(680, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(effect === "step" ? 0.08 : 0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  destroy(): void {
    if (this.musicTimer !== undefined) window.clearInterval(this.musicTimer);
    this.musicTimer = undefined;
    this.started = false;
    void this.context?.close();
    this.context = undefined;
  }

  private startMusicLoop(): void {
    if (!this.context || !this.musicGain || this.started) return;
    this.started = true;
    this.musicStep = 0;
    this.scheduleMusicNote();
    this.musicTimer = window.setInterval(() => this.scheduleMusicNote(), 280);
  }

  private scheduleMusicNote(): void {
    if (!this.context || !this.musicGain || this.muted) return;
    const melody = [262, 330, 392, 330, 294, 349, 440, 349, 262, 330, 392, 523, 440, 392, 330, 294];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = melody[this.musicStep % melody.length];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain);
    gain.connect(this.musicGain);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
    this.musicStep += 1;
  }
}
