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

interface AshParticle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
}

interface SandParticle {
  x: number;
  y: number;
  length: number;
  speedX: number;
  speedY: number;
}

interface BubbleParticle {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  phase: number;
}

export class WeatherOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentWeather = 0;
  private requiresFlash = false;
  private customDarknessRadius: number | null = null;
  private rainDrops: RainDrop[] = [];
  private fogParticles: FogParticle[] = [];
  private ashParticles: AshParticle[] = [];
  private sandParticles: SandParticle[] = [];
  private bubbleParticles: BubbleParticle[] = [];
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

    this.ashParticles = Array.from({ length: 40 }, () => ({
      x: Math.random() * (window.innerWidth + 200),
      y: Math.random() * window.innerHeight,
      size: 2 + Math.random() * 2.5,
      speedX: -1 - Math.random() * 1.5,
      speedY: 1.5 + Math.random() * 2,
      opacity: 0.4 + Math.random() * 0.45,
    }));

    this.sandParticles = Array.from({ length: 50 }, () => ({
      x: Math.random() * (window.innerWidth + 200),
      y: Math.random() * window.innerHeight,
      length: 16 + Math.random() * 18,
      speedX: -10 - Math.random() * 8,
      speedY: 4 + Math.random() * 4,
    }));

    this.bubbleParticles = Array.from({ length: 24 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: 2 + Math.random() * 3,
      speedY: 1.2 + Math.random() * 1.8,
      wobbleSpeed: 0.05 + Math.random() * 0.05,
      wobbleAmp: 1 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
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

  setCustomDarknessRadius(radius: number | null): void {
    this.customDarknessRadius = radius;
  }

  update(playerScreenX: number, playerScreenY: number, zoom = 1): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    const isRain = this.currentWeather === C.WEATHER_RAIN || this.currentWeather === C.WEATHER_RAIN_THUNDERSTORM || this.currentWeather === C.WEATHER_DOWNPOUR;
    const isThunder = this.currentWeather === C.WEATHER_RAIN_THUNDERSTORM;
    const isFog = this.currentWeather === C.WEATHER_FOG_HORIZONTAL || this.currentWeather === C.WEATHER_FOG_DIAGONAL;
    const isAsh = this.currentWeather === C.WEATHER_VOLCANIC_ASH;
    const isSand = this.currentWeather === C.WEATHER_SANDSTORM;
    const isDrought = this.currentWeather === C.WEATHER_DROUGHT;
    const isBubbles = this.currentWeather === C.WEATHER_UNDERWATER_BUBBLES || this.currentWeather === C.WEATHER_UNDERWATER;
    const isCustomDark = this.customDarknessRadius !== null && this.customDarknessRadius < 200;
    const darkCave = (this.requiresFlash && !flagGet(C.FLAG_SYS_FLASH_ACTIVE)) || isCustomDark;

    const active = isRain || isFog || isAsh || isSand || isDrought || isBubbles || darkCave;
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

    // 1. Cave darkness (requiresFlash without Flash active) or gym darkness (Dewford Gym)
    if (darkCave) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(10, 10, 15, 0.95)";
      this.ctx.fillRect(0, 0, w, h);

      // Cut illuminated circle around the player avatar
      this.ctx.globalCompositeOperation = "destination-out";
      const rad = this.customDarknessRadius !== null
        ? Math.max(16, this.customDarknessRadius * zoom)
        : TILE * 2.5;
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

    // 3. Fog (Tower / Routes / Mt. Pyre)
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

    // 4. Volcanic Ash (Route 113)
    if (isAsh) {
      this.ctx.save();
      for (const p of this.ashParticles) {
        this.ctx.fillStyle = `rgba(235, 235, 245, ${p.opacity})`;
        this.ctx.fillRect(p.x, p.y, p.size, p.size);

        p.x += p.speedX;
        p.y += p.speedY;
        if (p.y > h || p.x < -10) {
          p.x = Math.random() * (w + 100);
          p.y = -10;
        }
      }
      this.ctx.restore();
    }

    // 5. Sandstorm (Route 111 Desert)
    if (isSand) {
      this.ctx.save();
      // Desert sand tint
      this.ctx.fillStyle = "rgba(195, 155, 75, 0.12)";
      this.ctx.fillRect(0, 0, w, h);

      this.ctx.strokeStyle = "rgba(215, 180, 110, 0.5)";
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      for (const s of this.sandParticles) {
        this.ctx.moveTo(s.x, s.y);
        this.ctx.lineTo(s.x + s.speedX * 1.5, s.y + s.speedY * 1.5);

        s.x += s.speedX;
        s.y += s.speedY;
        if (s.x < -50 || s.y > h + 20) {
          s.x = Math.random() * (w + 200);
          s.y = Math.random() * -30;
        }
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 6. Drought / Harsh Sunlight (Groudon / Route 118)
    if (isDrought) {
      this.ctx.save();
      const pulse = 0.18 + 0.06 * Math.sin(Date.now() / 600);
      this.ctx.fillStyle = `rgba(255, 240, 180, ${pulse})`;
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.restore();
    }

    // 7. Underwater Bubbles (Dive routes)
    if (isBubbles) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(220, 245, 255, 0.45)";
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      this.ctx.lineWidth = 1;
      for (const b of this.bubbleParticles) {
        b.phase += b.wobbleSpeed;
        const wobbleX = Math.sin(b.phase) * b.wobbleAmp;

        this.ctx.beginPath();
        this.ctx.arc(b.x + wobbleX, b.y, b.radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        b.y -= b.speedY;
        if (b.y < -10) {
          b.y = h + 10;
          b.x = Math.random() * w;
        }
      }
      this.ctx.restore();
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
