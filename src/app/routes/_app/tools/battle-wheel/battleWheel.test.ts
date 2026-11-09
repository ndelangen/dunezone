import { describe, expect, it } from 'vite-plus/test';

import { EMPTY_PLAN, strengthText, wheelResult } from './battleWheel';
import { STORY_FACTIONS, STORY_RULESETS } from './battleWheel.stories.fixture';

const faction = (id: string) => STORY_FACTIONS.find((candidate) => candidate.id === id)!;
const ruleset = (id: string) => STORY_RULESETS.find((candidate) => candidate.id === id)!;

describe('wheelResult', () => {
  it('adds the leader to the dial', () => {
    const atreides = faction('atreides');
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

  it('dials troops that cost nothing at full strength for free', () => {
    const fremen = faction('fremen');
    const [normal, fedaykin] = fremen.faces;
    const plan = { ...EMPTY_PLAN, troops: { [normal!.id]: 3, [fedaykin!.id]: 1 } };
    expect(wheelResult(ruleset('gf9'), fremen, plan)).toMatchObject({ dial: 5, spice: 0 });
  });

  it('charges KISS spice after the first two troops', () => {
    const atreides = faction('atreides');
    const plan = { ...EMPTY_PLAN, troops: { [atreides.faces[0]!.id]: 5 } };
    expect(wheelResult(ruleset('kiss'), atreides, plan)).toMatchObject({ dial: 5, spice: 3 });
  });

  it('adds GF9 2.0 spice strength once the dial reaches the spice', () => {
    const atreides = faction('atreides');
    const plan = { ...EMPTY_PLAN, troops: { [atreides.faces[0]!.id]: 4 }, spice: 4 };
    expect(wheelResult(ruleset('gf9-2-0'), atreides, plan)).toMatchObject({ dial: 6, bonus: 2, spice: 4 });
  });
});

describe('strengthText', () => {
  it('prints halves', () => {
    expect([0, 0.5, 3, 5.5].map(strengthText)).toEqual(['0', '½', '3', '5½']);
  });
});
