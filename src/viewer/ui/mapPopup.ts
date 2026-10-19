/**
 * map_name_popup.c: On-screen sliding banner displaying the current area's name.
 * Slides down from top-left, stays visible for ~2 seconds, then slides back up.
 */

export class MapNamePopup {
  private el: HTMLElement;
  private timer: number | null = null;
  private currentName = "";

  constructor(parent: HTMLElement = document.body) {
    this.el = document.createElement("div");
    this.el.id = "map-name-popup";
    this.el.className = "map-popup-hidden";
    this.el.setAttribute("aria-live", "polite");
    parent.appendChild(this.el);
  }

  show(name: string, theme: "town" | "city" | "route" | "cave" | "indoor" = "route"): void {
    if (!name || name === this.currentName && !this.el.classList.contains("map-popup-hidden")) return;
    this.currentName = name;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    this.el.textContent = name;
    this.el.dataset.theme = theme;
    this.el.classList.remove("map-popup-hidden");
    this.el.classList.add("map-popup-visible");

    this.timer = window.setTimeout(() => {
      this.dismiss();
    }, 2400);
  }

  dismiss(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.el.classList.remove("map-popup-visible");
    this.el.classList.add("map-popup-hidden");
  }

  dispose(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.el.remove();
  }
}
