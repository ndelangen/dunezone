import { describe, expect, it } from 'vitest';

import { defaultFaction } from '@data/defaultFaction';
import { CURATED_PLANET_IMAGES } from '@game/data/planetCatalogue';

import {
  createTroopBackFromFront,
  defaultAdvantage,
  defaultPlanet,
  defaultTroop,
} from './factionFormDefaults';

describe('faction chapter defaults', () => {
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
