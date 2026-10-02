import { describe, expect, it } from 'vitest';

import { phaseSequence } from './FactionPhaseSequence';

const row = (id: string, before: string, extra: object = {}) => ({
  id,
  type: 'instruction',
  title: `Phase ${id}`,
  symbol: '/vector/icon/fate.svg',
  before,
  priority: 10,
  allPlayersMustBeReady: false,
  ...extra,
});

const labels = (groups: ReturnType<typeof phaseSequence>['turnGroups']) =>
  groups.flatMap((group) => [...group.placed, group.step].map((entry) => entry.label));

describe('phaseSequence', () => {
  it('shows the standard setup and turn when the faction declares nothing', () => {
    const { setupGroups, turnGroups, omitted } = phaseSequence([]);
    expect(labels(setupGroups)).toEqual(['Traitors', 'Starting troops']);
    expect(labels(turnGroups)).toHaveLength(9);
    expect([...setupGroups, ...turnGroups].every((group) => group.placed.length === 0)).toBe(true);
    expect(omitted).toEqual([]);
  });

  it('places a setup and a turn declaration before their targets, in priority then list order', () => {
    const { setupGroups, turnGroups } = phaseSequence([
      row('late', 'bidding', { priority: 20 }),
      row('early', 'bidding'),
      row('omen', 'forces'),
    ]);
    expect(labels(setupGroups)).toEqual(['Traitors', 'Phase omen', 'Starting troops']);
    expect(labels(turnGroups).slice(2, 6)).toEqual(['CHOAM charity', 'Phase early', 'Phase late', 'Bidding']);
    const bidding = turnGroups.find((group) => group.step.label === 'Bidding')!;
    expect(bidding.placed.map((entry) => (entry.kind === 'faction' ? entry.rowIndex : -1))).toEqual([1, 0]);
  });

  it('leaves out a row the schema refuses and names its place in the list', () => {
    const { turnGroups, omitted } = phaseSequence([row('fine', 'storm'), row('broken', 'karama')]);
    expect(labels(turnGroups)[0]).toBe('Phase fine');
    expect(labels(turnGroups)).not.toContain('Phase broken');
    expect(omitted).toEqual([1]);
  });

  it('leaves out a second row that repeats an id, keeping the first', () => {
    const { turnGroups, omitted } = phaseSequence([row('same', 'storm'), row('same', 'bidding', { title: 'Copy' })]);
    expect(labels(turnGroups)[0]).toBe('Phase same');
    expect(labels(turnGroups)).not.toContain('Copy');
    expect(omitted).toEqual([1]);
  });

  it('orders setup declarations by priority before list order', () => {
    const { setupGroups } = phaseSequence([row('second', 'traitors', { priority: 20 }), row('first', 'traitors')]);
    expect(labels(setupGroups)).toEqual(['Phase first', 'Phase second', 'Traitors', 'Starting troops']);
  });
});
