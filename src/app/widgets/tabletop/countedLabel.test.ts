import { describe, expect, it } from 'vite-plus/test';

import { countedLabel } from './countedLabel';

const troop = (label: string) => ({ kind: 'force' as const, label });

describe('countedLabel', () => {
  it('puts the count after the name, whatever the name', () => {
    expect(countedLabel(troop('Harkonnen Troop'), 10)).toBe('Harkonnen Troop ×10');
    expect(countedLabel(troop('Fedaykin'), 3)).toBe('Fedaykin ×3');
    expect(countedLabel(troop('House Atreides troops'), 10)).toBe('House Atreides troops ×10');
    expect(countedLabel(troop(' Spice '), 8)).toBe('Spice ×8');
  });

  it('counts a deck’s cards after its name', () => {
    expect(countedLabel({ kind: 'card', label: 'Spice deck' }, 25)).toBe('Spice deck, 25 cards');
    expect(countedLabel({ kind: 'card', label: '' }, 3)).toBe('3 cards');
  });

  it('counts a pile already named for its cards like any other stack', () => {
    expect(countedLabel({ kind: 'card', label: 'Treachery card' }, 2)).toBe('Treachery card ×2');
    expect(countedLabel({ kind: 'card', label: 'Synthetic cards' }, 25)).toBe('Synthetic cards ×25');
  });

  it('shows the count alone for a piece without a name', () => {
    expect(countedLabel(troop(''), 4)).toBe('×4');
  });
});
