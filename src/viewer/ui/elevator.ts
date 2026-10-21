/** Navigation presentation for source elevator menus. Does not execute the story VM. */
export class ElevatorMenu {
  private readonly dialog = document.createElement("dialog");
  private finish: ((choice: number | null) => void) | null = null;
  private buttons: HTMLButtonElement[] = [];
  constructor() {
    this.dialog.id = "elevator-menu";
    this.dialog.setAttribute("aria-label", "Elevator");
    this.dialog.addEventListener("cancel", e => { e.preventDefault(); this.close(null); });
    this.dialog.addEventListener("keydown", e => {
      e.stopImmediatePropagation();
      const index = this.buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown","ArrowUp","w","s"].includes(e.key)) {
        e.preventDefault();
        const delta = e.key === "ArrowUp" || e.key === "w" ? -1 : 1;
        this.buttons[(index + delta + this.buttons.length) % this.buttons.length]?.focus();
      } else if (["z"," ","Enter"].includes(e.key)) { e.preventDefault(); this.buttons[index]?.click(); }
      else if (["Escape","x","b"].includes(e.key)) { e.preventDefault(); this.close(null); }
    });
    document.body.append(this.dialog);
  }
  get open(): boolean { return this.dialog.open; }
  choose(labels: string[], current: number): Promise<number | null> {
    if (this.finish) throw Error("Elevator menu already open");
    this.dialog.replaceChildren();
    const title = document.createElement("h2"); title.textContent = "Which floor would you like?";
    const on = document.createElement("p"); on.textContent = `Current floor: ${labels[current] ?? "—"}`;
    this.dialog.append(title,on);
    this.buttons = [...labels,"Exit"].map((label,index) => {
      const button = document.createElement("button");button.className="btn";button.textContent=label;
      button.style.display="block";button.style.width="100%";button.style.margin="4px 0";
      button.addEventListener("click",()=>this.close(index < labels.length ? index : null));
      this.dialog.append(button);return button;
    });
    return new Promise(resolve => {
      this.finish=resolve;this.dialog.showModal();this.buttons[Math.max(current,0)]?.focus();
    });
  }
  private close(choice:number|null):void {
    this.dialog.close();const finish=this.finish;this.finish=null;finish?.(choice);
  }
}
