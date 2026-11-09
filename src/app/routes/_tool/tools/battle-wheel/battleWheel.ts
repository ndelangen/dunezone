import type { FactionRender } from '@shared/factions/schema';
import type { BattleFace } from '@shared/play/battle';
import {
  dialsFree,
  flatStrength,
  KISS_DIAL_CAP,
  kissSpice,
  spiceStrength,
  spiceStrengthChoices,
} from '@shared/play/battleDialing';
import type { BattleDialing } from '@shared/rulesets/battleDialing';
import type { z } from 'zod';

/*
 * The battle wheel tool's arithmetic: a leader and the troops dialed give the dial and the total strength, counted the way
 * the table's Ruleset dials (battle dialing per Ruleset, free dialing per troop). No Treachery cards: the wheel only adds up.
 * Play's own dialing helpers do the counting, so the tool and an online game always agree.
 */

type LeaderRender = z.infer<typeof FactionRender.leaders>[number];
type TroopRender = z.infer<typeof FactionRender.troops>[number];

export type WheelLeader = Readonly<{
  id: string;
  name: string;
  /** Null for a leader whose strength is set at the battle, such as the Tleilaxu's Zoal (X). */
  strength: number | null;
  image: LeaderRender['image'];
}>;

/** A face the faction can dial, with how many of it the faction owns and how its token looks. */
export type WheelFace = BattleFace &
  Readonly<{
    /** How many tokens of this troop the faction owns. */
    count: number;
    /** The troop the face belongs to: a troop's front and back are one set of tokens, so together they dial no more than its count. */
    troop?: string;
    image: TroopRender['image'];
    star?: TroopRender['star'];
    hue?: string;
    striped?: boolean;
  }>;

export type WheelFaction = Readonly<{
  id: string;
  name: string;
  emblem: LeaderRender['emblem'];
  background: LeaderRender['background'];
  leaders: readonly WheelLeader[];
  faces: readonly WheelFace[];
}>;

/** A faction as the picker shows it, before its leaders and troops are read: enough to draw its token. */
export type FactionChoice = Pick<WheelFaction, 'id' | 'name' | 'emblem' | 'background'>;

export type WheelRuleset = Readonly<{ id: string; name: string; dialing: BattleDialing }>;

/**
 * One battle plan on the wheel.
 * `spice` is what the player offers to spend: under Advanced it supports troops, the strongest gain first, and under GF9 2.0 it buys spice strength.
 * Basic ignores it and KISS works out its own cost.
 */
export type WheelPlan = Readonly<{
  leaderId: string | null;
  /** The strength a leader without a printed one (X) fights at in this battle. */
  leaderX: number;
  troops: Readonly<Record<string, number>>;
  spice: number;
}>;

export const EMPTY_PLAN: WheelPlan = { leaderId: null, leaderX: 0, troops: {}, spice: 0 };

export type WheelResult = Readonly<{
  /** The number on the wheel: the troops' strength, with any spice strength. Can be a half under Advanced. */
  dial: number;
  /** The GF9 2.0 spice strength included in the dial. */
  bonus: number;
  leader: number;
  total: number;
  /** The spice the plan pays. */
  spice: number;
  /** How many dialed troops spice supports, under Advanced. */
  supported: number;
  /** True when KISS's cap of 20 cut the dial. */
  capped: boolean;
}>;

/* Each face's dialed count, within what the faction owns: a troop's faces share its tokens, the earlier face first. */
function declared(plan: WheelPlan, faction: WheelFaction) {
  const used = new Map<string, number>();
  return faction.faces.map((face) => {
    const group = face.troop ?? face.id;
    const left = face.count - (used.get(group) ?? 0);
    const count = Math.max(0, Math.min(left, plan.troops[face.id] ?? 0));
    used.set(group, (used.get(group) ?? 0) + count);
    return { face, count };
  });
}

/** The most of this face the plan can dial: the troop's tokens less those its other face dials. */
export function mostOf(faction: WheelFaction, plan: WheelPlan, face: WheelFace) {
  const others = faction.faces
    .filter((other) => other.id !== face.id && (other.troop ?? other.id) === (face.troop ?? face.id))
    .reduce((total, other) => total + (plan.troops[other.id] ?? 0), 0);
  return Math.max(0, face.count - others);
}

export function leaderOf(faction: WheelFaction, plan: WheelPlan) {
  return faction.leaders.find((leader) => leader.id === plan.leaderId) ?? null;
}

function leaderStrength(faction: WheelFaction, plan: WheelPlan) {
  const leader = leaderOf(faction, plan);
  if (!leader) {
    return 0;
  }
  return leader.strength ?? plan.leaderX;
}

/** Whether spice changes this face's strength under Advanced: it costs something and fights stronger supported. */
export function supportable(face: BattleFace) {
  return face.supportCost > 0 && face.supportedStrength > face.strength;
}

/** The most spice an Advanced plan can usefully spend: supporting every dialed troop that spice strengthens. */
export function mostUsefulSpice(ruleset: WheelRuleset, faction: WheelFaction, plan: WheelPlan) {
  return ruleset.dialing === 'advanced' ? supportSpice(faction, plan) : 0;
}

/* The spice that supports every dialed troop spice strengthens. */
function supportSpice(faction: WheelFaction, plan: WheelPlan) {
  return declared(plan, faction).reduce(
    (total, { face, count }) => total + (supportable(face) ? count * face.supportCost : 0),
    0
  );
}

/**
 * The plan with its spice brought within what it can spend, so spice the player cannot see never comes back.
 * Advanced spice beyond the troops it can support is dropped.
 * A GF9 2.0 tier the dial no longer reaches falls to the highest it does.
 */
export function settled(ruleset: WheelRuleset, faction: WheelFaction, plan: WheelPlan): WheelPlan {
  if (ruleset.dialing === 'advanced') {
    const most = mostUsefulSpice(ruleset, faction, plan);
    return plan.spice > most ? { ...plan, spice: most } : plan;
  }
  if (ruleset.dialing === 'gf92') {
    const spice = spiceChoices(ruleset, faction, plan).findLast((choice) => choice <= plan.spice) ?? 0;
    return spice === plan.spice ? plan : { ...plan, spice };
  }
  return plan;
}

/** The spice amounts a GF9 2.0 plan may spend at its dial. */
export function spiceChoices(ruleset: WheelRuleset, faction: WheelFaction, plan: WheelPlan): number[] {
  if (ruleset.dialing !== 'gf92') {
    return [0];
  }
  const troops = asTroops(plan, faction);
  return spiceStrengthChoices(flatStrength(troops, faction.faces), dialsFree(troops, faction.faces));
}

function asTroops(plan: WheelPlan, faction: WheelFaction) {
  return declared(plan, faction)
    .filter(({ count }) => count > 0)
    .map(({ face, count }) => ({ faceId: face.id, undialed: count, dialed: 0 }));
}

type Support = Readonly<{ gain: number; spent: number; supported: number }>;

/* More strength wins; at equal strength, less spice. */
const betterSupport = (candidate: Support, held: Support) =>
  candidate.gain > held.gain || (candidate.gain === held.gain && candidate.spent < held.spent);

/*
 * The strongest support the offered spice buys: a small knapsack over every dialed troop that spice strengthens.
 * Support costs can differ per troop, so a greedy pick by gain per spice can leave strength unbought.
 */
function bestSupport(declaredTroops: readonly { face: WheelFace; count: number }[], budget: number): Support {
  let best: Support[] = Array.from({ length: budget + 1 }, () => ({ gain: 0, spent: 0, supported: 0 }));
  for (const { face, count } of declaredTroops) {
    if (!supportable(face)) {
      continue;
    }
    const gain = face.supportedStrength - face.strength;
    for (let troop = 0; troop < count; troop++) {
      const next = best.slice();
      for (let held = face.supportCost; held <= budget; held++) {
        const from = best[held - face.supportCost]!;
        const candidate = {
          gain: from.gain + gain,
          spent: from.spent + face.supportCost,
          supported: from.supported + 1,
        };
        if (betterSupport(candidate, next[held]!)) {
          next[held] = candidate;
        }
      }
      best = next;
    }
  }
  return best.reduce((held, candidate) => (betterSupport(candidate, held) ? candidate : held), best[0]!);
}

/** Advanced spice dialing: the offered spice supports the troops that make the dial strongest. */
function advanced(plan: WheelPlan, faction: WheelFaction) {
  const troops = declared(plan, faction);
  /* A troop whose dial cost is 0 fights at full strength for free (free dialing is per troop, never per faction). */
  const base = troops.reduce(
    (total, { face, count }) => total + count * (face.supportCost === 0 ? face.supportedStrength : face.strength),
    0
  );
  const budget = Math.max(0, Math.min(plan.spice, supportSpice(faction, plan)));
  const { gain, spent, supported } = bestSupport(troops, budget);
  return { dial: base + gain, spice: spent, supported, bonus: 0, capped: false };
}

export function wheelResult(ruleset: WheelRuleset, faction: WheelFaction, plan: WheelPlan): WheelResult {
  const leader = leaderStrength(faction, plan);
  let counted: Omit<WheelResult, 'leader' | 'total'>;
  if (ruleset.dialing === 'advanced') {
    counted = advanced(plan, faction);
  } else {
    const troops = asTroops(plan, faction);
    const flat = flatStrength(troops, faction.faces);
    if (ruleset.dialing === 'gf92') {
      const free = dialsFree(troops, faction.faces);
      const spice = spiceStrengthChoices(flat, free).findLast((choice) => choice <= plan.spice) ?? 0;
      const bonus = spiceStrength(flat, spice, free);
      counted = { dial: flat + bonus, bonus, spice, supported: 0, capped: false };
    } else if (ruleset.dialing === 'kiss') {
      counted = {
        dial: Math.min(flat, KISS_DIAL_CAP),
        bonus: 0,
        spice: kissSpice(troops, faction.faces),
        supported: 0,
        capped: flat > KISS_DIAL_CAP,
      };
    } else {
      counted = { dial: flat, bonus: 0, spice: 0, supported: 0, capped: false };
    }
  }
  return { ...counted, leader, total: counted.dial + leader };
}

/** How many troops the plan dials. */
export function troopsDialed(plan: WheelPlan, faction: WheelFaction) {
  return declared(plan, faction).reduce((total, { count }) => total + count, 0);
}

/** A strength as the wheel prints it: halves as ½, the sign kept, and any other fraction as it is. */
export function strengthText(value: number) {
  const sign = value < 0 ? '-' : '';
  const size = Math.abs(value);
  const whole = Math.floor(size);
  if (size - whole !== 0.5) {
    return String(value);
  }
  return `${sign}${whole === 0 ? '' : whole}½`;
}

/** The plan with one face's count changed, kept within what the faction owns. */
export function withTroops(faction: WheelFaction, plan: WheelPlan, face: WheelFace, count: number): WheelPlan {
  return {
    ...plan,
    troops: { ...plan.troops, [face.id]: Math.max(0, Math.min(mostOf(faction, plan, face), count)) },
  };
}
