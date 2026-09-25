// slot_machine.c: Game Corner slots. Reel strips, match lines, payout table,
// machine bias and the biased reel-stop sampling are ported exactly; the reel
// sprites, Clefairy dance and line-flash presentation are pending (the UI
// shows the same 3x3 window, bets, lines and payouts).

export const REEL_LENGTH = 21;

export const ICON_7 = 0;
export const ICON_ROCKET = 1;
export const ICON_PIKACHU = 2;
export const ICON_PSYDUCK = 3;
export const ICON_CHERRIES = 4;
export const ICON_MAGNEMITE = 5;
export const ICON_SHELLDER = 6;

export const ICON_LABELS = ["7", "RKT", "PIK", "PSY", "CHR", "MAG", "SHL"];

export const PAYOUT_NONE = 0;
export const PAYOUT_CHERRIES2 = 1;
export const PAYOUT_CHERRIES3 = 2;
export const PAYOUT_MAGSHELL = 3;
export const PAYOUT_PIKAPSY = 4;
export const PAYOUT_ROCKET = 5;
export const PAYOUT_7 = 6;

const PAYOUTS = [0, 2, 6, 8, 15, 100, 300];

/** sReelIconAnimByReelAndPos */
export const REELS: number[][] = [
  [0, 3, 4, 1, 2, 6, 2, 5, 0, 6, 3, 1, 4, 2, 6, 0, 5, 2, 1, 6, 2],
  [0, 5, 4, 3, 1, 5, 4, 3, 2, 5, 4, 3, 0, 5, 4, 1, 3, 6, 5, 3, 4],
  [0, 3, 6, 5, 2, 3, 6, 5, 2, 3, 5, 6, 2, 3, 5, 6, 2, 3, 5, 6, 1],
];

/** sRowAttributes: [col1, col2, col3, minBet]; names for the UI. */
export const LINES = [
  { cells: [0, 4, 8], minBet: 3, name: "DIAG" },
  { cells: [0, 3, 6], minBet: 2, name: "TOP" },
  { cells: [1, 4, 7], minBet: 1, name: "MID" },
  { cells: [2, 5, 8], minBet: 2, name: "BOT" },
  { cells: [2, 4, 6], minBet: 3, name: "DIAG" },
];

/** sReelBiasChances per machine (cumulative 14-bit thresholds). */
export const BIAS_CHANCES = [
  [0x1fa1, 0x2eab, 0x3630, 0x39f3, 0x3bd4, 0x3bfc, 0x0049],
  [0x1f97, 0x2ea2, 0x3627, 0x39e9, 0x3bca, 0x3bf8, 0x0049],
  [0x1f91, 0x2e9b, 0x3620, 0x39e3, 0x3bc4, 0x3bf4, 0x0049],
  [0x1f87, 0x2e92, 0x3617, 0x39d9, 0x3bba, 0x3bef, 0x0050],
  [0x1f7f, 0x2e89, 0x360e, 0x39d1, 0x3bb2, 0x3bea, 0x0050],
  [0x1fc9, 0x2efc, 0x3696, 0x3a63, 0x3c49, 0x3c8b, 0x0073],
];

const SECOND_REEL_PAIRS = [
  [0, 3], [0, 6], [3, 6], [1, 4], [1, 7], [4, 7],
  [2, 5], [2, 8], [5, 8], [0, 4], [0, 8], [4, 8],
  [2, 4], [2, 6], [4, 6],
];

const THIRD_REEL_TRIPLES = [
  [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
];

export type Rng = () => number;

export type SlotState = {
  machineIdx: number;
  machineBias: number;
  biasCooldown: number;
  bet: number;
  positions: number[];
  stopOrder: number[];
  destPos: number[];
  winLines: boolean[];
  payout: number;
  bestMatch: number;
};

export function newSlotState(machineIdx: number): SlotState {
  return {
    machineIdx: Math.max(0, machineIdx) % BIAS_CHANCES.length,
    machineBias: 0,
    biasCooldown: 0,
    bet: 0,
    positions: [0, 0, 0],
    stopOrder: [0, 0],
    destPos: [REEL_LENGTH, REEL_LENGTH, REEL_LENGTH],
    winLines: [false, false, false, false, false],
    payout: 0,
    bestMatch: 0,
  };
}

/** TestReelIconAttribute */
export function iconAttr(attr: number, icon: number): boolean {
  switch (attr) {
    case PAYOUT_NONE:
      return (icon ^ 4) !== 0;
    case PAYOUT_CHERRIES2:
    case PAYOUT_CHERRIES3:
      return icon === ICON_CHERRIES;
    case PAYOUT_MAGSHELL:
      return icon === ICON_MAGNEMITE || icon === ICON_SHELLDER;
    case PAYOUT_PIKAPSY:
      return icon === ICON_PIKACHU || icon === ICON_PSYDUCK;
    case PAYOUT_ROCKET:
      return icon === ICON_ROCKET;
    case PAYOUT_7:
      return icon === ICON_7;
    default:
      return false;
  }
}

/** ReelIconToPayoutRank */
export function iconRank(icon: number): number {
  switch (icon) {
    default:
    case ICON_CHERRIES:
      return PAYOUT_CHERRIES2;
    case ICON_MAGNEMITE:
    case ICON_SHELLDER:
      return PAYOUT_MAGSHELL;
    case ICON_PIKACHU:
    case ICON_PSYDUCK:
      return PAYOUT_PIKAPSY;
    case ICON_ROCKET:
      return PAYOUT_ROCKET;
    case ICON_7:
      return PAYOUT_7;
  }
}

/** CalcSlotBias */
export function calcSlotBias(st: SlotState, rnd: Rng): void {
  const chances = BIAS_CHANCES[st.machineIdx]!;
  const rval = Math.floor(rnd() / 4);
  let i = 0;
  for (; i < 6; i++) {
    if (rval < chances[i]!) break;
  }
  if (st.machineBias < PAYOUT_ROCKET) {
    if (st.biasCooldown === 0) {
      if ((rnd() & 0x3fff) < chances[PAYOUT_7]!) st.biasCooldown = rnd() & 1 ? 5 : 60;
    }
    if (st.biasCooldown !== 0) {
      if (i === 0 && (rnd() & 0x3fff) < Math.trunc(0.7 * 0x3fff)) {
        st.biasCooldown = rnd() & 1 ? 5 : 60;
      }
      st.biasCooldown--;
    }
    st.machineBias = i;
  }
}

export function resetMachineBias(st: SlotState): void {
  st.machineBias = 0;
}

/** Visible 3x3 icons from the stopped positions (CalcPayout layout). */
export function visibleIcons(st: SlotState): number[] {
  const icons = new Array<number>(9).fill(ICON_7);
  let p0 = st.positions[0];
  let p1 = st.positions[1];
  let p2 = st.positions[2];
  for (let i = 0; i < 3; i++) {
    p0 = (p0 + 1) % REEL_LENGTH;
    p1 = (p1 + 1) % REEL_LENGTH;
    p2 = (p2 + 1) % REEL_LENGTH;
    icons[i] = REELS[0]![p0]!;
    icons[3 + i] = REELS[1]![p1]!;
    icons[6 + i] = REELS[2]![p2]!;
  }
  return icons;
}

/** CalcPayout: win flags, coin payout and best match rank for the bet. */
export function calcPayout(st: SlotState): number {
  const icons = visibleIcons(st);
  st.winLines = [false, false, false, false, false];
  st.payout = 0;
  let best = 0;
  LINES.forEach((line, i) => {
    if (st.bet < line.minBet) return;
    const [a, b, c] = line.cells;
    let match = 0;
    if (iconAttr(1, icons[a]!)) match = iconAttr(2, icons[b]!) ? 2 : 1;
    else if (icons[a] === icons[b] && icons[a] === icons[c]) match = iconRank(icons[a]!);
    if (match !== 0) {
      st.winLines[i] = true;
      st.payout += PAYOUTS[match]!;
    }
    if (match > best) best = match;
  });
  st.bestMatch = best;
  return best;
}

/** TwoReelBiasCheck */
function twoReelBiasCheck(st: SlotState, reel0id: number, reel0pos: number, reel1id: number, reel1pos: number, icon: number): boolean {
  const icons = new Array<number>(9).fill(ICON_7);
  for (let i = 0; i < 3; i++) {
    icons[3 * reel0id + i] = REELS[reel0id]![reel0pos]!;
    icons[3 * reel1id + i] = REELS[reel1id]![reel1pos]!;
    reel0pos = (reel0pos + 1) % REEL_LENGTH;
    reel1pos = (reel1pos + 1) % REEL_LENGTH;
  }
  switch (icon) {
    case 0:
      for (let i = 0; i < 3; i++) if (iconAttr(1, icons[i]!)) return false;
      for (const [x, y] of SECOND_REEL_PAIRS) if (icons[x] === icons[y]) return true;
      return false;
    case 1:
      if (reel0id === 0 || reel1id === 0) {
        if (reel0id === 1 || reel1id === 1) {
          for (let i = 0; i < 15; i += 3) {
            const [x, y] = SECOND_REEL_PAIRS[i]!;
            if (icons[x] === icons[y]) return false;
          }
        }
        for (let i = 0; i < 3; i++) if (iconAttr(icon, icons[i]!)) return true;
        return false;
      }
      return true;
    case 2:
      if (reel0id === 2 || reel1id === 2) {
        for (let i = 0; i < 9; i++) if (iconAttr(icon, icons[i]!)) return true;
        return false;
      }
      break;
  }
  for (const [x, y] of SECOND_REEL_PAIRS) {
    if (icons[x] === icons[y] && iconAttr(icon, icons[x]!)) return true;
  }
  return false;
}

/** OneReelBiasCheck */
function oneReelBiasCheck(st: SlotState, reelId: number, reelPos: number, biasIcon: number): boolean {
  const icons = new Array<number>(9).fill(0);
  let first = st.positions[st.stopOrder[0]!]! + 1;
  let second = st.positions[st.stopOrder[1]!]! + 1;
  let pos = reelPos + 1;
  if (first >= REEL_LENGTH) first = 0;
  if (second >= REEL_LENGTH) second = 0;
  if (pos >= REEL_LENGTH) pos = 0;
  for (let i = 0; i < 3; i++) {
    icons[st.stopOrder[0]! * 3 + i] = REELS[st.stopOrder[0]!]![first]!;
    icons[st.stopOrder[1]! * 3 + i] = REELS[st.stopOrder[1]!]![second]!;
    icons[reelId * 3 + i] = REELS[reelId]![pos]!;
    first = (first + 1) % REEL_LENGTH;
    second = (second + 1) % REEL_LENGTH;
    pos = (pos + 1) % REEL_LENGTH;
  }
  switch (biasIcon) {
    case PAYOUT_NONE:
      for (let i = 0; i < 3; i++) if (iconAttr(1, icons[i]!)) return false;
      for (const [x, y, z] of THIRD_REEL_TRIPLES) {
        if (icons[x] === icons[y] && icons[x] === icons[z]) return false;
      }
      return true;
    case PAYOUT_CHERRIES2:
      for (const [x, y] of THIRD_REEL_TRIPLES) {
        if (icons[x] === icons[y] && iconAttr(biasIcon, icons[x]!)) return false;
      }
      for (let i = 0; i < 3; i++) if (iconAttr(biasIcon, icons[i]!)) return true;
      return false;
    case PAYOUT_CHERRIES3:
      for (const [x, y] of THIRD_REEL_TRIPLES) {
        if (icons[x] === icons[y] && iconAttr(biasIcon, icons[x]!)) return true;
      }
      return false;
  }
  for (const [x, y, z] of THIRD_REEL_TRIPLES) {
    if (icons[x] === icons[y] && icons[x] === icons[z] && iconAttr(biasIcon, icons[x]!)) return true;
  }
  return false;
}

// GetNextReelPosition with zero subpixel (the adapter stops reels instantly).
const nextPos = (st: SlotState, reel: number): number => st.positions[reel]!;

/** StopReel1 */
function stopReel1(st: SlotState, whichReel: number, rnd: Rng): void {
  const next = nextPos(st, whichReel);
  const samples: number[] = [];
  if (st.machineBias === 0 && whichReel === 0) {
    for (let i = 0; i < 5; i++) {
      let dest = next - i + 1;
      let j = 0;
      for (; j < 3; j++) {
        if (dest >= REEL_LENGTH) dest = 0;
        if (iconAttr(1, REELS[whichReel]![dest]!)) break;
        dest++;
      }
      if (j === 3) samples.push(i);
    }
  } else if (st.machineBias !== 1 || whichReel === 0) {
    let dest = next + 1;
    for (let i = 0; i < 3; i++) {
      if (dest >= REEL_LENGTH) dest = 0;
      if (iconAttr(st.machineBias, REELS[whichReel]![dest]!)) {
        samples[0] = 0;
        break;
      }
      dest++;
    }
    dest = next;
    for (let i = 0; i < 4; i++) {
      if (dest < 0) dest = REEL_LENGTH - 1;
      if (iconAttr(st.machineBias, REELS[whichReel]![dest]!)) samples.push(i + 1);
      dest--;
    }
  }
  const pick = samples.length === 0 ? rnd() % 5 : samples[rnd() % samples.length]!;
  let dest = next - pick;
  if (dest < 0) dest += REEL_LENGTH;
  st.stopOrder[0] = whichReel;
  st.destPos[whichReel] = dest;
  st.positions[whichReel] = dest;
}

/** StopReel2 */
function stopReel2(st: SlotState, whichReel: number, rnd: Rng): void {
  void rnd;
  const firstId = st.stopOrder[0]!;
  const firstPos = st.positions[firstId]! + 1 >= REEL_LENGTH ? 0 : st.positions[firstId]! + 1;
  const next = nextPos(st, whichReel);
  let pos = next + 1;
  if (pos >= REEL_LENGTH) pos = 0;
  const possible: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (twoReelBiasCheck(st, firstId, firstPos, whichReel, pos, st.machineBias)) {
      possible.push(i);
    }
    pos--;
    if (pos < 0) pos = REEL_LENGTH - 1;
  }
  let stop: number;
  if (possible.length === 0) {
    stop = st.machineBias === PAYOUT_ROCKET || st.machineBias === PAYOUT_7 ? 4 : 0;
  } else {
    stop = possible[0]!;
  }
  let dest = next - stop;
  if (dest < 0) dest += REEL_LENGTH;
  st.stopOrder[1] = whichReel;
  st.destPos[whichReel] = dest;
  st.positions[whichReel] = dest;
}

/** StopReel3 */
function stopReel3(st: SlotState, whichReel: number, rnd: Rng): void {
  void rnd;
  const next = nextPos(st, whichReel);
  let test = next;
  const possible: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (oneReelBiasCheck(st, whichReel, test, st.machineBias)) possible.push(i);
    test--;
    if (test < 0) test = REEL_LENGTH - 1;
  }
  let stop: number;
  if (possible.length === 0) {
    stop = st.machineBias === PAYOUT_ROCKET || st.machineBias === PAYOUT_7 ? 4 : 0;
  } else {
    stop = possible[0]!;
  }
  let dest = next - stop;
  if (dest < 0) dest += REEL_LENGTH;
  st.destPos[whichReel] = dest;
  st.positions[whichReel] = dest;
}

/** StopCurrentReel for the stop order position (0, 1, 2). */
export function stopReel(st: SlotState, order: number, whichReel: number, rnd: Rng): void {
  if (order === 0) stopReel1(st, whichReel, rnd);
  else if (order === 1) stopReel2(st, whichReel, rnd);
  else stopReel3(st, whichReel, rnd);
}
