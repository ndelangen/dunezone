import { describe, expect, it } from 'vite-plus/test';

import { EMPTY_PLAN, strengthText, wheelResult } from './battleWheel';
import type { WheelFaction } from './battleWheel';
import { STORY_RULESETS, storyFaction as faction } from './battleWheel.stories.fixture';

const ruleset = (id: string) => STORY_RULESETS.find((candidate) => candidate.id === id)!;

describe('wheelResult', () => {
  it('adds the leader to the dial', () => {
    const atreides = faction('house-atreides');
    const plan = { ...EMPTY_PLAN, leaderId: atreides.leaders[0]!.id, troops: { [atreides.faces[0]!.id]: 4 } };
    expect(wheelResult(ruleset('gf9-basic'), atreides, plan)).toMatchObject({ dial: 4, leader: 5, total: 9 });
  });

  it('counts unsupported troops at half under Advanced, and spends spice on the biggest gain first', () => {
    const emperor = faction('emperor');
    const [normal, sardaukar] = emperor.faces;
    const plan = { ...EMPTY_PLAN, troops: { [normal!.id]: 3, [sardaukar!.id]: 2 }, spice: 2 };
    /* Both Sardaukar supported (2 + 2), three ordinary troops at ½. */
    expect(wheelResult(ruleset('gf9'), emperor, plan)).toMatchObject({ dial: 5.5, spice: 2, supported: 2 });
  });

  it('buys the strongest support when troops cost different spice', () => {
    const emperor = faction('emperor');
    const like = emperor.faces[0]!;
    const custom: WheelFaction = {
      ...emperor,
      faces: [
        { ...like, id: 'elite', troop: 'elite', strength: 0, supportedStrength: 5, supportCost: 3, count: 1 },
        { ...like, id: 'line', troop: 'line', strength: 0, supportedStrength: 3, supportCost: 2, count: 2 },
      ],
    };
    const plan = { ...EMPTY_PLAN, troops: { elite: 1, line: 2 }, spice: 4 };
    expect(wheelResult(ruleset('gf9'), custom, plan)).toMatchObject({ dial: 6, spice: 4, supported: 2 });
  });

  it('dials troops that cost nothing at full strength for free', () => {
    const fremen = faction('fremen');
    const [normal, fedaykin] = fremen.faces;
    const plan = { ...EMPTY_PLAN, troops: { [normal!.id]: 3, [fedaykin!.id]: 1 } };
    expect(wheelResult(ruleset('gf9'), fremen, plan)).toMatchObject({ dial: 5, spice: 0 });
  });

  it('charges KISS spice after the first two troops', () => {
    const atreides = faction('house-atreides');
    const plan = { ...EMPTY_PLAN, troops: { [atreides.faces[0]!.id]: 5 } };
    expect(wheelResult(ruleset('kiss'), atreides, plan)).toMatchObject({ dial: 5, spice: 3 });
  });

  it('adds GF9 2.0 spice strength once the dial reaches the spice', () => {
    const atreides = faction('house-atreides');
    const plan = { ...EMPTY_PLAN, troops: { [atreides.faces[0]!.id]: 4 }, spice: 4 };
    expect(wheelResult(ruleset('gf9-2-0'), atreides, plan)).toMatchObject({ dial: 6, bonus: 2, spice: 4 });
  });

  it("charges the Emperor's ally half for GF9 2.0 spice strength", () => {
    const atreides = faction('house-atreides');
    const plan = { ...EMPTY_PLAN, troops: { [atreides.faces[0]!.id]: 8 }, spice: 8, emperorAlly: true };
    expect(wheelResult(ruleset('gf9-2-0'), atreides, plan)).toMatchObject({ dial: 11, bonus: 3, spice: 4, tier: 8 });
  });
});

describe('strengthText', () => {
  it('prints halves', () => {
    expect([0, 0.5, 3, 5.5].map(strengthText)).toEqual(['0', '½', '3', '5½']);
  });

  it('keeps the sign on halves, and other fractions as they are', () => {
    expect([-0.5, -1.5, 0.25, -2].map(strengthText)).toEqual(['-½', '-1½', '0.25', '-2']);
  });
});
