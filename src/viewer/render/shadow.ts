import { cdata, loadCData } from "@core/hw/assets";
import { loadEffectTemplate, type EffectTemplate, type EffectTemplateName } from "../data/fieldFxTemplates";
const names: Record<string, EffectTemplateName> = {
  SHADOW_SIZE_S:"ShadowSmall", SHADOW_SIZE_M:"ShadowMedium", SHADOW_SIZE_L:"ShadowLarge", SHADOW_SIZE_XL:"ShadowExtraLarge",
};
/** FldEff_Shadow / UpdateShadowFieldEffect: ground anchor excludes the jump y2. */
export class JumpShadow {
  private readonly node = document.createElement("div");
  constructor(private readonly templates: ReadonlyMap<string, EffectTemplate>, content: HTMLElement, private readonly offsets: readonly number[]) {
    this.node.className = "field-fx jump-shadow";
    this.node.style.zIndex = "24";
    this.hide();
    content.appendChild(this.node);
  }
  static async create(content: HTMLElement): Promise<JumpShadow> {
    await loadCData("field_effect_helpers");
    const templates = await Promise.all(Object.entries(names).map(async ([size,name]) => [size,await loadEffectTemplate(name)] as const));
    return new JumpShadow(new Map(templates),content,cdata<number[]>("field_effect_helpers", "gShadowVerticalOffsets"));
  }
  hide(): void { this.node.style.display = "none"; }
  update(visible: boolean, x: number, groundY: number, avatarHeight: number, size: string): void {
    if (!visible) { this.hide(); return; }
    const template = this.templates.get(size);
    if (!template) throw new Error(`Missing jump shadow ${size}`);
    const frame = template.frames[0]!;
    // Linked sprite center is groundY + 16 - height/2; C adds height/2 - offset.
    const offset = this.offsets[Object.keys(names).indexOf(size)]!;
    Object.assign(this.node.style, {display:"block",left:`${x+8-frame.width/2}px`,
      top:`${groundY+16-avatarHeight/2+avatarHeight/2-offset-frame.height/2}px`,
      width:`${frame.width}px`,height:`${frame.height}px`,backgroundImage:`url("${frame.url}")`,
      backgroundPosition:`-${frame.sourceX}px -${frame.sourceY}px`});
  }
  dispose(): void { this.node.remove(); }
}
