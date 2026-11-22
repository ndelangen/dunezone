import { describe, expect, it } from 'vitest';

import { countedLabel } from './countedLabel';

const troop = (label: string) => ({ kind: 'force' as const, label });

describe('countedLabel', () => {
  it('puts the last word of a singular catalogue name in the plural', () => {
    expect(countedLabel(troop('Harkonnen Troop'), 10)).toBe('10 Harkonnen Troops');
    expect(countedLabel(troop('Normal troop'), 5)).toBe('5 Normal troops');
    expect(countedLabel(troop('Fighter'), 18)).toBe('18 Fighters');
    expect(countedLabel(troop('Ally'), 2)).toBe('2 Allies');
    expect(countedLabel(troop('Beach'), 2)).toBe('2 Beaches');
    expect(countedLabel(troop('TROOP'), 2)).toBe('2 TROOPS');
  });

  it('keeps a name that is already plural or the same in the plural', () => {
    expect(countedLabel(troop('House Atreides troops'), 10)).toBe('10 House Atreides troops');
    expect(countedLabel(troop('Fedaykin'), 3)).toBe('3 Fedaykin');
    expect(countedLabel(troop('Sardaukar'), 5)).toBe('5 Sardaukar');
    expect(countedLabel(troop('Spice'), 8)).toBe('8 Spice');
    expect(countedLabel(troop('Troop (elite)'), 2)).toBe('2 Troop (elite)');
  });

  it('counts a deck’s cards after its name', () => {
    expect(countedLabel({ kind: 'card', label: 'Spice deck' }, 25)).toBe('Spice deck, 25 cards');
    expect(countedLabel({ kind: 'card', label: '' }, 3)).toBe('3 cards');
  });

  it('shows the count alone for a piece without a name', () => {
    expect(countedLabel(troop(''), 4)).toBe('4');
  });
});
