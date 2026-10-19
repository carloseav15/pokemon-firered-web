export type DialogSegment = string | { text: string; strong: true };
export type DialogChoice = { label: string; primary?: boolean; action: () => void };

export class DialogManager {
  private active = false;
  private readonly box: HTMLElement | null;
  private readonly title: HTMLElement | null;
  private readonly text: HTMLElement | null;
  private readonly closeBtn: HTMLElement | null;
  private readonly foot: HTMLElement | null;
  private readonly prompt: HTMLElement | null;

  constructor() {
    this.box = document.getElementById("dialog-box");
    this.title = document.getElementById("dialog-title");
    this.text = document.getElementById("dialog-text");
    this.closeBtn = document.getElementById("dialog-close");
    this.foot = document.getElementById("dialog-foot");
    this.prompt = document.getElementById("dialog-prompt");

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
    this.render(titleText, segments);
    this.resetFootDefault();
    this.box?.classList.add("open");
    this.active = true;
  }

  showChoice(titleText: string, segments: DialogSegment[], choices: DialogChoice[]): void {
    this.render(titleText, segments);
    if (this.foot) {
      if (this.prompt) this.prompt.style.display = "none";
      if (this.closeBtn) this.closeBtn.style.display = "none";
      const existingChoices = this.foot.querySelectorAll(".dialog-choice-btn");
      existingChoices.forEach((c) => c.remove());

      for (const choice of choices) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn dialog-choice-btn ${choice.primary ? "primary" : ""}`;
        btn.textContent = choice.label;
        btn.style.marginRight = "8px";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.close();
          choice.action();
        });
        this.foot.appendChild(btn);
      }
    }
    this.box?.classList.add("open");
    this.active = true;
  }

  private render(titleText: string, segments: DialogSegment[]): void {
    if (!this.box || !this.title || !this.text) return;
    this.title.textContent = titleText;
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
  }

  private resetFootDefault(): void {
    if (this.prompt) this.prompt.style.display = "";
    if (this.closeBtn) this.closeBtn.style.display = "";
    const existingChoices = this.foot?.querySelectorAll(".dialog-choice-btn");
    existingChoices?.forEach((c) => c.remove());
  }

  close(): void {
    if (!this.box) return;
    this.box.classList.remove("open");
    this.resetFootDefault();
    this.active = false;
  }
}
