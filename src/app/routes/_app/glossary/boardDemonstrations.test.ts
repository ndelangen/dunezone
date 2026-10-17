import { describe, expect, it } from 'vite-plus/test';

import { DEMONSTRATIONS, IDLE, parts, ringPoint, sectorPath, shuffled } from './boardDemonstrations';

const STRONGHOLDS = ['arrakeen', 'carthag', 'tueks', 'tabr', 'habbanya'];

function frames(term: string, run = 0) {
  const demonstration = DEMONSTRATIONS[term]!;
  return Array.from({ length: demonstration.steps }, (_, step) => demonstration.frames(step, run));
}

describe('sector wedges', () => {
  it('measures angles counterclockwise from the right of the centre', () => {
    expect(ringPoint(0, 0.5)).toBe('1 0.5');
    expect(ringPoint(90, 0.5).split(' ').map(Number)).toEqual([expect.closeTo(0.5), expect.closeTo(0)]);
  });

  it('draws the first sector as a 20° band between the inner and outer rings', () => {
    expect(sectorPath(0)).toBe(
      `M ${ringPoint(0, 0.497)} A 0.497 0.497 0 0 0 ${ringPoint(20, 0.497)} L ${ringPoint(20, 0.085)} A 0.085 0.085 0 0 1 ${ringPoint(0, 0.085)} Z`
    );
  });

  it('adds eighteen wedges beside the territories, labelled from one', () => {
    const sectors = parts.filter((part) => part.key.startsWith('sector-'));
    expect(sectors.map((part) => part.label)).toEqual(Array.from({ length: 18 }, (_, index) => `Sector ${index + 1}`));
    expect(sectors[17]?.highlight?.paths[0]?.d).toBe(sectorPath(17));
  });
});

describe('shuffled', () => {
  const items = Array.from({ length: 20 }, (_, index) => index);

  it('repeats its order for the same seed and keeps every item', () => {
    expect(shuffled(items, 42)).toEqual(shuffled(items, 42));
    expect(shuffled(items, 42).toSorted((a, b) => a - b)).toEqual(items);
  });

  it('orders differently for another seed without touching its input', () => {
    expect(shuffled(items, 42)).not.toEqual(shuffled(items, 43));
    expect(items).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });
});

describe('demonstrations', () => {
  it('lights every territory once per run, in that run’s order', () => {
    const lit = frames('territory', 7).map((frame) => frame.lit[0]?.key);
    expect(new Set(lit).size).toBe(lit.length);
    expect(frames('territory', 7)).toEqual(frames('territory', 7));
    expect(lit).not.toEqual(frames('territory', 8).map((frame) => frame.lit[0]?.key));
  });

  it('walks the sectors in order', () => {
    expect(frames('sector').map((frame) => frame.lit[0]?.key)).toEqual(
      Array.from({ length: 18 }, (_, sector) => `sector-${sector}`)
    );
  });

  it('lights the strongholds one at a time, then all together', () => {
    const lit = frames('stronghold').map((frame) => frame.lit.map(({ key }) => key));
    expect(lit).toEqual([...STRONGHOLDS.map((key) => [key]), STRONGHOLDS, STRONGHOLDS]);
  });

  it('counts the storm’s moves without lighting anything', () => {
    expect(DEMONSTRATIONS.storm!.frames(7, 0)).toEqual({ lit: [], storm: 7 });
  });

  it('flies the ornithopter route, fading the territories it left and holding at the end', () => {
    const flight = frames('ornithopter');
    expect(flight[0]).toEqual({ lit: [{ key: 'carthag', color: '#3aa0e0', faint: false }], routes: undefined });
    const landed = flight[3]!;
    expect(landed.lit.map(({ key, faint }) => [key, faint])).toEqual([
      ['carthag', true],
      ['tsimpo', true],
      ['plastic-basin', true],
      ['tabr', false],
    ]);
    expect(landed.routes?.[0]?.waypoints).toEqual(
      ['carthag', 'tsimpo', 'plastic-basin', 'tabr'].map((territory) => ({ territory }))
    );
    expect(flight[4]).toEqual(landed);
  });

  it('blinks the single-area terms and leaves the idle board unlit', () => {
    expect(frames('polar-sink')).toEqual([{ lit: [{ key: 'polar', color: '#3cc0e0' }], blink: true }]);
    expect(IDLE.frames(0, 0)).toEqual({ lit: [] });
  });
});
