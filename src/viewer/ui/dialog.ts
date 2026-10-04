export class DialogManager {
  private active = false;
  private readonly box: HTMLElement | null;
  private readonly title: HTMLElement | null;
  private readonly text: HTMLElement | null;

  constructor() {
    this.box = document.getElementById("dialog-box");
    this.title = document.getElementById("dialog-title");
    this.text = document.getElementById("dialog-text");
  }

  isOpen(): boolean {
    return this.active;
  }

  show(titleText: string, contentHtml: string): void {
    if (!this.box || !this.title || !this.text) return;
    this.title.textContent = titleText;
    this.text.innerHTML = contentHtml;
    this.box.classList.add("open");
    this.active = true;
  }

  close(): void {
    if (!this.box) return;
    this.box.classList.remove("open");
    this.active = false;
  }
}
