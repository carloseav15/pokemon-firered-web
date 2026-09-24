export type AudioChannel = "music" | "effects" | "fanfares" | "cries";

export interface AudioBus {
  unlock(): void;
  play(channel: AudioChannel, id: string): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  destroy(): void;
}
