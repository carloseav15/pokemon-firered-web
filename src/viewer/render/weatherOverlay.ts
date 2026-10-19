/**
 * Weather & Darkness canvas overlay for the exploration viewer.
 * Simulates GBA weather particles (field_weather_effects.c) and cave darkness (flash / requiresFlash).
 */

import * as C from "../../games/firered/generated/constants";
import { flagGet } from "@game/save";
import { TILE } from "../constants";

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
}

interface FogParticle {
  x: number;
  y: number;
  radius: number;
  speedX: number;
  opacity: number;
}

export class WeatherOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentWeather = 0;
  private requiresFlash = false;
  private rainDrops: RainDrop[] = [];
  private fogParticles: FogParticle[] = [];
  private thunderTimer = 0;
  private thunderActive = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "viewer-weather-overlay";
    this.canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40;image-rendering:pixelated;";
    this.ctx = this.canvas.getContext("2d")!;
    parent.appendChild(this.canvas);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.initParticles();
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private initParticles(): void {
    this.rainDrops = Array.from({ length: 36 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      length: 12 + Math.random() * 8,
      speed: 12 + Math.random() * 6,
    }));

    this.fogParticles = Array.from({ length: 16 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: 90 + Math.random() * 60,
      speedX: 0.4 + Math.random() * 0.4,
      opacity: 0.12 + Math.random() * 0.1,
    }));
  }

  setWeather(weather: number): void {
    if (this.currentWeather !== weather) {
      this.currentWeather = weather;
      this.thunderActive = false;
      this.thunderTimer = 0;
    }
  }

  setRequiresFlash(requires: boolean): void {
    this.requiresFlash = requires;
  }

  update(playerScreenX: number, playerScreenY: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const isRain = this.currentWeather === C.WEATHER_RAIN || this.currentWeather === C.WEATHER_RAIN_THUNDERSTORM || this.currentWeather === C.WEATHER_DOWNPOUR;
    const isThunder = this.currentWeather === C.WEATHER_RAIN_THUNDERSTORM;
    const isFog = this.currentWeather === C.WEATHER_FOG_HORIZONTAL || this.currentWeather === C.WEATHER_FOG_DIAGONAL;
    const isAsh = this.currentWeather === C.WEATHER_VOLCANIC_ASH;
    const isSand = this.currentWeather === C.WEATHER_SANDSTORM;
    const darkCave = this.requiresFlash && !flagGet(C.FLAG_SYS_FLASH_ACTIVE);

    const active = isRain || isFog || isAsh || isSand || darkCave;
    if (!active) {
      if (this.canvas.style.display !== "none") {
        this.ctx.clearRect(0, 0, w, h);
        this.canvas.style.display = "none";
      }
      return;
    }

    if (this.canvas.style.display === "none") {
      this.canvas.style.display = "block";
    }

    this.ctx.clearRect(0, 0, w, h);

    // 1. Cave darkness (requiresFlash without Flash active)
    if (darkCave) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(10, 10, 15, 0.95)";
      this.ctx.fillRect(0, 0, w, h);

      // Cut illuminated circle around the player avatar
      this.ctx.globalCompositeOperation = "destination-out";
      const rad = TILE * 2.5;
      const grad = this.ctx.createRadialGradient(playerScreenX, playerScreenY, rad * 0.4, playerScreenX, playerScreenY, rad);
      grad.addColorStop(0, "rgba(0, 0, 0, 1)");
      grad.addColorStop(0.8, "rgba(0, 0, 0, 0.85)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(playerScreenX, playerScreenY, rad, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    // 2. Rain & Thunderstorm
    if (isRain) {
      this.ctx.save();
      // Occasional lightning flash
      if (isThunder) {
        if (!this.thunderActive && Math.random() < 0.003) {
          this.thunderActive = true;
          this.thunderTimer = 2; // 2 frames of flash
        }
        if (this.thunderActive) {
          this.ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
          this.ctx.fillRect(0, 0, w, h);
          if (--this.thunderTimer <= 0) this.thunderActive = false;
        }
      }

      this.ctx.strokeStyle = "rgba(180, 210, 255, 0.55)";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      for (const drop of this.rainDrops) {
        this.ctx.moveTo(drop.x, drop.y);
        this.ctx.lineTo(drop.x - 4, drop.y + drop.length);

        drop.x -= 3;
        drop.y += drop.speed;
        if (drop.y > h || drop.x < 0) {
          drop.x = Math.random() * (w + 100);
          drop.y = -20;
        }
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Fog (Tower / Routes)
    if (isFog) {
      this.ctx.save();
      for (const p of this.fogParticles) {
        const grad = this.ctx.createRadialGradient(p.x, p.y, p.radius * 0.1, p.x, p.y, p.radius);
        grad.addColorStop(0, `rgba(235, 240, 250, ${p.opacity})`);
        grad.addColorStop(1, "rgba(235, 240, 250, 0)");
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        this.ctx.fill();

        p.x += p.speedX;
        if (p.x - p.radius > w) p.x = -p.radius;
      }
      this.ctx.restore();
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
