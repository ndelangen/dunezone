import { describe, expect, it } from 'vitest';

import { capturedCombatFaces } from '../play/battle';

const image = '/vector/troop/atreides.svg';
const values = { strength: 0.5, fundedStrength: 1 };

describe('captured troop combat faces', () => {
  it('lets an unauthored reverse play as its front, with one section for both', () => {
    expect(capturedCombatFaces([{ name: 'Guard', image, combat: values }])).toEqual([
      { id: 'troop-0-front', name: 'Guard', capable: true, ...values, fundingCost: 1, image },
    ]);
    expect(capturedCombatFaces([{ name: 'Envoy', image, capable: false, combat: values }])).toEqual([]);
  });

  it('keeps an authored back distinct: its own flag, its own values, and no borrowing when they are missing', () => {
    const faces = capturedCombatFaces([
      { name: 'Envoy', image, capable: false, back: { name: 'Zealot', image, combat: { ...values, fundingCost: 0 } } },
      { name: 'Guard', image, combat: values, back: { name: 'Unset', image } },
      { name: 'Unset', image, back: { name: 'Quiet', image, capable: false, combat: values } },
    ]);

    expect(faces.map(({ id, name, fundingCost }) => ({ id, name, fundingCost }))).toEqual([
      { id: 'troop-0-back', name: 'Zealot', fundingCost: 0 },
      { id: 'troop-1-front', name: 'Guard', fundingCost: 1 },
    ]);
  });
});
