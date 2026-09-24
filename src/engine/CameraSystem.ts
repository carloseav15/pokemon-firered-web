import type { GridPoint } from "./types";

export type CameraBounds = { width: number; height: number; tileSize: number };

export class CameraSystem {
  private bounds: CameraBounds = { width: 0, height: 0, tileSize: 16 };
  private target: GridPoint = { x: 0, y: 0 };

  setBounds(width: number, height: number, tileSize = 16): void {
    this.bounds = { width, height, tileSize };
  }

  follow(target: GridPoint): void {
    this.target = { ...target };
  }

  position(): { x: number; y: number } {
    return { x: this.target.x * this.bounds.tileSize, y: this.target.y * this.bounds.tileSize };
  }

  get mapPixelSize(): { width: number; height: number } {
    return { width: this.bounds.width * this.bounds.tileSize, height: this.bounds.height * this.bounds.tileSize };
  }
}
