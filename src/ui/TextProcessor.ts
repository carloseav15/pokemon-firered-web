export type TextContext = {
  playerName?: string;
  rivalName?: string;
  variables?: Record<string, string | number>;
};

export class TextProcessor {
  constructor(private readonly maxLines = 3, private readonly maxCharactersPerLine = 34) {}

  pages(lines: string[], context: TextContext = {}): string[] {
    const source = lines.map((line) => this.replaceVariables(line, context).replaceAll("\\l", "\n")).join("\\p");
    const explicitPages = source.split("\\p");
    const pages: string[] = [];
    for (const page of explicitPages) {
      const wrapped = this.wrap(page.trim());
      for (let index = 0; index < wrapped.length; index += this.maxLines) pages.push(wrapped.slice(index, index + this.maxLines).join("\n"));
    }
    return pages.length > 0 ? pages : [""];
  }

  private replaceVariables(text: string, context: TextContext): string {
    const variables = context.variables ?? {};
    return text
      .replaceAll("{PLAYER}", context.playerName ?? "RED")
      .replaceAll("{RIVAL}", context.rivalName ?? "BLUE")
      .replace(/\{([A-Z0-9_]+)\}/g, (match, key: string) => String(variables[key] ?? match));
  }

  private wrap(text: string): string[] {
    return text.split("\n").flatMap((line) => {
      if (line.length <= this.maxCharactersPerLine) return [line];
      const words = line.split(/\s+/);
      const output: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > this.maxCharactersPerLine && current) {
          output.push(current);
          current = word;
        } else current = candidate;
      }
      if (current) output.push(current);
      return output;
    });
  }
}
