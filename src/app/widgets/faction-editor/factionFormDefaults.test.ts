import { FactionMemberIdSchema } from '@shared/factions/memberIdentity';
import { describe, expect, it } from 'vitest';

import { CURATED_PLANET_IMAGES } from '@game/data/planetCatalogue';

import { defaultFaction } from './defaultFaction';
import {
  createTroopBackFromFront,
  defaultAdvantage,
  defaultPlanet,
  defaultTroop,
  nextLeaderFromLast,
  nextTroopBattleValues,
} from './factionFormDefaults';

describe('faction chapter defaults', () => {
  it('allocates a fresh persistent identity for every added supporting Leader', () => {
    const first = nextLeaderFromLast(undefined);
    const next = nextLeaderFromLast(first);
    expect(FactionMemberIdSchema.safeParse(first.memberId).success).toBe(true);
    expect(FactionMemberIdSchema.safeParse(next.memberId).success).toBe(true);
    expect(next.memberId).not.toBe(first.memberId);
  });

  it('creates a planet with exactly one curated illustration', () => {
    const planet = defaultPlanet();

    expect(CURATED_PLANET_IMAGES.map(({ image }) => image)).toContain(planet.image);
    expect(planet).toEqual({
      image: CURATED_PLANET_IMAGES[0]?.image,
      name: '',
      description: '',
    });
  });

  it('creates a reversible troop side without changing physical supply or planet association', () => {
    const front = {
      ...defaultTroop(),
      name: 'Guard',
      description: 'Front',
      count: 12,
      planet: 'World Alpha',
      striped: true,
    };

    const back = createTroopBackFromFront(front);

    expect(back).toEqual({
      name: 'Guard',
      image: front.image,
      description: 'Front',
      star: undefined,
      striped: undefined,
    });
    expect(back).not.toHaveProperty('count');
    expect(back).not.toHaveProperty('planet');
  });

  it('gives a new back the battle values its reverse inherited, as its own copy', () => {
    const battleValues = { strength: 0.5, supportedStrength: -1, supportCost: 0 };
    const front = { ...defaultTroop(), capable: false, combat: battleValues };

    const back = createTroopBackFromFront(front);

    expect(back).toMatchObject({ capable: false, combat: battleValues });
    expect(back.combat).not.toBe(battleValues);
    expect(defaultTroop()).not.toHaveProperty('combat');
  });

  it('keeps battle values the author entered and never fills the other strength', () => {
    const strength = nextTroopBattleValues(undefined, 'strength', 1.5);
    expect(strength).toEqual({ strength: 1.5 });
    const both = nextTroopBattleValues(strength, 'supportedStrength', -2);
    expect(both).toEqual({ strength: 1.5, supportedStrength: -2 });
    expect(nextTroopBattleValues(both, 'supportCost', 0)).toEqual({
      strength: 1.5,
      supportedStrength: -2,
      supportCost: 0,
    });
    expect(nextTroopBattleValues(both, 'strength', undefined)).toEqual({ supportedStrength: -2 });
    expect(nextTroopBattleValues({ strength: 1, supportedStrength: 2 }, 'supportCost', undefined)).toEqual({
      strength: 1,
      supportedStrength: 2,
    });
    expect(nextTroopBattleValues(strength, 'strength', undefined)).toBeUndefined();
  });

  it('keeps optional advantage fields absent by default', () => {
    expect(defaultAdvantage()).toEqual({ text: '' });
    expect(defaultFaction.planet).toEqual([]);
  });
});
