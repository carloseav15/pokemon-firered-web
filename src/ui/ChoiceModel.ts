export class ChoiceModel {
  private selected = 0;

  constructor(readonly options: string[] = ["YES", "NO"]) {}

  move(delta: number): void {
    this.selected = (this.selected + delta + this.options.length) % this.options.length;
  }

  choose(): string {
    return this.options[this.selected] ?? this.options[0] ?? "";
  }

  get index(): number {
    return this.selected;
  }
}
