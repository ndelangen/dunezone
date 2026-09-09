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

  it('keeps optional advantage fields absent by default', () => {
    expect(defaultAdvantage()).toEqual({ text: '' });
    expect(defaultFaction.planet).toEqual([]);
  });
});
