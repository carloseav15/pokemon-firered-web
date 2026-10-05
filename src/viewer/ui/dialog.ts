export type DialogSegment = string | { text: string; strong: true };

export class DialogManager {
  private active = false;
  private readonly box: HTMLElement | null;
  private readonly title: HTMLElement | null;
  private readonly text: HTMLElement | null;
  private readonly closeBtn: HTMLElement | null;

  constructor() {
    this.box = document.getElementById("dialog-box");
    this.title = document.getElementById("dialog-title");
    this.text = document.getElementById("dialog-text");
    this.closeBtn = document.getElementById("dialog-close");
    // Un solo listener en la vida del diálogo: nunca uno por apertura.
    this.closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.close();
    });
  }

  isOpen(): boolean {
    return this.active;
  }

  show(titleText: string, segments: DialogSegment[]): void {
    if (!this.box || !this.title || !this.text) return;
    this.title.textContent = titleText;
    // Todo como texto: sin entrada HTML arbitraria ni segundo camino inseguro.
    this.text.textContent = "";
    for (const seg of segments) {
      if (typeof seg === "string") {
        this.text.append(seg);
      } else {
        const strong = document.createElement("strong");
        strong.textContent = seg.text;
        this.text.appendChild(strong);
      }
    }
    this.box.classList.add("open");
    this.active = true;
  }

  close(): void {
    if (!this.box) return;
    this.box.classList.remove("open");
    this.active = false;
  }
}
