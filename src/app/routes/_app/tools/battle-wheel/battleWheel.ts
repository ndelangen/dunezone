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
    count: number;
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

function declared(plan: WheelPlan, faction: WheelFaction) {
  return faction.faces.map((face) => ({ face, count: Math.max(0, Math.min(face.count, plan.troops[face.id] ?? 0)) }));
}

export function leaderOf(faction: WheelFaction, plan: WheelPlan) {
  return faction.leaders.find((leader) => leader.id === plan.leaderId) ?? null;
}

export function leaderStrength(faction: WheelFaction, plan: WheelPlan) {
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
  if (ruleset.dialing === 'advanced') {
    return declared(plan, faction).reduce(
      (total, { face, count }) => total + (supportable(face) ? count * face.supportCost : 0),
      0
    );
  }
  if (ruleset.dialing === 'gf92') {
    return Math.max(...spiceChoices(ruleset, faction, plan));
  }
  return 0;
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

/** Advanced spice dialing: the offered spice supports troops one at a time, the biggest gain per spice first. */
function advanced(plan: WheelPlan, faction: WheelFaction) {
  let budget = Math.max(0, plan.spice);
  let dial = 0;
  let spice = 0;
  let supported = 0;
  const byGain = declared(plan, faction).sort(
    (a, b) =>
      (b.face.supportedStrength - b.face.strength) / Math.max(1, b.face.supportCost) -
      (a.face.supportedStrength - a.face.strength) / Math.max(1, a.face.supportCost)
  );
  for (const { face, count } of byGain) {
    if (!supportable(face)) {
      /* A troop whose dial cost is 0 fights at full strength for free (free dialing is per troop, never per faction). */
      dial += count * (face.supportCost === 0 ? face.supportedStrength : face.strength);
      continue;
    }
    const paid = Math.min(count, Math.floor(budget / face.supportCost));
    budget -= paid * face.supportCost;
    spice += paid * face.supportCost;
    supported += paid;
    dial += paid * face.supportedStrength + (count - paid) * face.strength;
  }
  return { dial, spice, supported, bonus: 0, capped: false };
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

/** A strength as the wheel prints it: halves as ½. */
export function strengthText(value: number) {
  const whole = Math.floor(value);
  const half = value - whole >= 0.5;
  if (!half) {
    return String(whole);
  }
  return whole === 0 ? '½' : `${whole}½`;
}

/** The plan with one face's count changed, kept within what the faction owns. */
export function withTroops(plan: WheelPlan, face: WheelFace, count: number): WheelPlan {
  return { ...plan, troops: { ...plan.troops, [face.id]: Math.max(0, Math.min(face.count, count)) } };
}
