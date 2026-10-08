// Single decision policy of the playtest driver (attack, items, switching, forgetting a move, catching, nicknames,
// Yes/No answers). Every decision the driver takes goes through one Policy object, so an option such as "noItems"
// applies to the whole driver at once. The decision functions are pure: the driver passes the live readings in
// (strategy.check.mjs and policy.check.mjs call them with independent values). Thresholds are walkthrough policy,
// not FireRed rules.
import { rankMoves, hpItem, statusItem, chooseMoveToForget } from "../strategy.js";

export const DEFAULTS = {
  fieldHp: 0.6, battleHp: 0.4, minAttackPP: 2, reservePotions: 1, maxDecisions: 80, maxUnchanged: 6,
  noItems: false,        // never use a bag item in battle or on the field (also hides the bag from every decision)
  trainTarget: null,     // personality of the party member being trained (wild battles bring it in once)
  answers: {},           // script label -> boolean: the Yes/No answers a route declares (e.g. MtMoon_B2F_EventScript_DomeFossil)
  battleYesNo: { "Cmd_trygivecaughtmonnick": false, "Cmd_yesnobox": false, "Cmd_yesnoboxlearnmove": null, "Cmd_yesnoboxstoplearningmove": true },
  unansweredYesNo: undefined, // answer for a script Yes/No the route did not declare; undefined = stop (exploration sets false)
  catchWild: false,      // the driver never throws a Poke Ball unless a route enables it
};

export class Policy {
  constructor(options = {}) { this.options = { ...DEFAULTS, ...options, answers: { ...(options.answers ?? {}) } }; }
  /** Change options in place; every consumer reads them on each decision. */
  set(patch) { Object.assign(this.options, patch); return this; }
  get itemsAllowed() { return !this.options.noItems; }
  /** The bag as every decision may see it. */
  bag(real) { return this.itemsAllowed ? real : []; }

  /** Replacement candidates that are alive and not the active mon. `mons` are {slot, personality, hp, maxHP, battleMon}. */
  _able(mons, active) { return mons.filter(m => m.species && !m.isEgg && m.hp > 0 && m.personality !== active.personality); }

  /** Best able replacement; healthy=true requires hp >= fieldHp. Returns a slot or -1. */
  bestReplacement({ mons, active, healthy = false }, deps) {
    const o = this.options;
    const choices = this._able(mons, active).filter(m => !healthy || m.hp / m.maxHP >= o.fieldHp).map(m => {
      const attacks = deps.bestMoves(m.battleMon);
      return attacks.length ? { slot: m.slot, score: attacks[0].score * m.hp / m.maxHP } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.slot - b.slot);
    return choices[0]?.slot ?? -1;
  }

  /** A reserve that one real medicine would make usable. Always null when items are not allowed. */
  recoverReplacement({ mons, active, bag }, deps) {
    if (!this.itemsAllowed) return null;
    const o = this.options, C = deps.C;
    const choices = this._able(mons, active).map(m => {
      const attacks = deps.bestMoves(m.battleMon), heal = hpItem(m.battleMon, bag, C);
      if (!attacks.length || !heal || (m.hp + heal.restores) / m.maxHP < o.fieldHp) return null;
      return { target: m.slot, personality: m.personality, otId: m.otId, item: heal.item, score: attacks[0].score * (m.hp + heal.restores) / m.maxHP };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.target - b.target);
    return choices[0] ? { action: "item", ...choices[0], reason: "recover attacking reserve" } : null;
  }

  /**
   * One battle decision. state: { flags, mon (battle mon), mons (party), bag, incoming, trainerBattle, training:{target,switched} }.
   * Returns { action: stop|run|switch|item|move, reason, ... }.
   */
  battle(state, deps) {
    const o = this.options, C = deps.C, { flags, mon, incoming = 0 } = state;
    if (flags & (C.BATTLE_TYPE_DOUBLE | C.BATTLE_TYPE_LINK | C.BATTLE_TYPE_SAFARI | C.BATTLE_TYPE_POKEDUDE | C.BATTLE_TYPE_OLD_MAN_TUTORIAL))
      return { action: "stop", reason: "unsupported battle format" };
    const bag = this.bag(state.bag), trainer = !!(flags & C.BATTLE_TYPE_TRAINER);
    const low = mon.hp <= Math.max(mon.maxHP * o.battleHp, incoming * 1.5);
    const heal = hpItem(mon, bag, C);
    const t = state.training;
    if (t?.target != null && !trainer && !t.switched && mon.personality !== t.target) {
      const m = state.mons.find(m => m.species && m.personality === t.target && m.hp / m.maxHP >= o.fieldHp);
      t.switched = true;
      if (m) return { action: "switch", target: m.slot, personality: t.target, reason: "training: share experience" };
    }
    const exhausted = () => trainer ? { action: "stop", reason: "resources exhausted in trainer battle" } : { action: "run", reason: "resources exhausted in wild battle" };
    const switchTo = (slot, reason) => ({ action: "switch", target: slot, personality: state.mons.find(m => m.slot === slot).personality, reason });
    const attacks = deps.bestMoves(mon);
    if (!attacks.length) {
      const target = this.bestReplacement({ mons: state.mons, active: mon, healthy: true }, deps);
      if (target >= 0) return switchTo(target, "no usable attack");
      const recovery = this.recoverReplacement({ mons: state.mons, active: mon, bag }, deps);
      return recovery ?? exhausted();
    }
    // A potion that restores no more than the foe took last turn only burns stock: fight on or switch instead.
    const futile = !!heal && incoming > 0 && heal.restores <= incoming;
    if (low && heal && !futile) return { action: "item", item: heal.item, reason: "low hp", incoming };
    const cure = statusItem(mon.status1, bag, C);
    if (cure) return { action: "item", item: cure, reason: "status" };
    const better = this.bestReplacement({ mons: state.mons, active: mon, healthy: true }, deps);
    if (attacks[0].effectiveness < 1 && better >= 0) {
      const next = state.mons.find(m => m.slot === better), best = deps.bestMoves(next.battleMon)[0];
      if (next.hp / next.maxHP >= o.fieldHp && best.score > attacks[0].score * 1.8) return switchTo(better, "better attack matchup");
    }
    if (low && !heal) {
      const target = this.bestReplacement({ mons: state.mons, active: mon, healthy: true }, deps);
      return target >= 0 ? switchTo(target, "low hp without medicine") : exhausted();
    }
    return { action: "move", ...attacks[0], reason: "ranked attack" };
  }

  /** Field preparation before walking: what to do for one party member. */
  prepare({ mon, bag, stock }, deps) {
    const o = this.options, C = deps.C;
    const out = { cure: null, heal: null, retreat: null };
    if (mon.hp <= 0 || mon.attackPP < o.minAttackPP) { out.retreat = "return to center: hp or pp exhausted"; return out; }
    const cure = this.itemsAllowed ? statusItem(mon.status, bag, C) : null;
    if (mon.status && !cure) { out.retreat = "return to center: untreated status"; return out; }
    out.cure = cure;
    if (mon.hp / mon.maxHP < o.fieldHp) {
      const heal = this.itemsAllowed ? hpItem({ hp: mon.hp, maxHP: mon.maxHP }, bag, C) : null;
      if (!heal || stock <= o.reservePotions) out.retreat = "return to center: low hp and medicine reserve";
      else out.heal = heal.item;
    }
    return out;
  }

  /** Which move slot to forget for `move` (-1 keeps the current moves). */
  forgetMove({ moves, move, types }, deps) { return chooseMoveToForget(moves, move, types, deps.rom, deps.C); }

  /** Answer for a script Yes/No: the label of the running script, declared by the route. undefined = not declared. */
  scriptYesNo(entry) { return Object.hasOwn(this.options.answers, entry) ? this.options.answers[entry] : this.options.unansweredYesNo; }
  /** Answer for a battle Yes/No prompt (by script command); null = decided by the caller from the situation. */
  battleYesNo(command) { return Object.hasOwn(this.options.battleYesNo, command) ? this.options.battleYesNo[command] : undefined; }
  nickname() { return false; }
  catchWild() { return !!this.options.catchWild; }
}

export { rankMoves };
