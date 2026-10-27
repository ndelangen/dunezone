import { describe, expect, test } from 'vite-plus/test';

import { applyPieceAction, drawTechTokenInState } from './commands';
import { freshTableState } from './model';
import type { TablePiece, TableState } from './model';
import { SHARED_ITEM_PLACEMENT_ANCHORS } from './tableFurnitureLayout';
import { troopScale } from './tableGeometry';
import { isCollisionFreePosition } from './tablePhysics';
import { drawableTechTokens } from './techToken';

function techTokens(id: string, names: string[], extra: Partial<TablePiece> = {}): TablePiece {
  return {
    id,
    label: names[0]!,
    kind: 'force',
    owner: 'shared',
    inventory: 'shared',
    color: '#d5ba8c',
    accent: '#ead9bb',
    stackKey: `token:${id}`,
    items: names.map((name, index) => ({
      id: `${id}-${index}`,
      faceUp: true,
      artwork: {
        front: `https://example.test/${name}.jpg`,
        back: `https://example.test/${name}.jpg`,
        name,
        type: 'token-tech',
      },
    })),
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
    ...extra,
  };
}

function tableWith(...pieces: TablePiece[]): TableState {
  return { ...freshTableState(), pieces: [...freshTableState().pieces, ...pieces] };
}

const onTable = (state: TableState) =>
  state.pieces.filter((piece) => piece.items[0]?.artwork?.type === 'token-tech' && !piece.inventory);

describe('drawing a tech token', () => {
  test('takes the picked token out of the shared inventory and sets it down face up on a free shelf spot', () => {
    const state = tableWith(techTokens('customs', ['Customs']), techTokens('heighliners', ['Heighliners']));
    const next = drawTechTokenInState(state, 'Atreides', undefined, () => 1);
    const [drawn] = onTable(next);
    expect(drawn).toMatchObject({ id: 'heighliners', inventory: undefined, label: 'Heighliners' });
    expect(drawn!.items).toEqual([expect.objectContaining({ faceUp: true })]);
    expect(drawn!.position[0]).toBeCloseTo(SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position[0]);
    expect(drawn!.position[2]).toBeCloseTo(SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position[2]);
    expect(drawableTechTokens(next.pieces).map((piece) => piece.id)).toEqual(['customs']);
    expect(next.events[0]).toMatchObject({
      status: 'accepted',
      message: 'Atreides drew Heighliners from the tech tokens.',
    });
  });

  test('gives every token the same chance, so one drawn off a stack leaves the rest in the inventory', () => {
    const state = tableWith(techTokens('stack', ['Customs', 'Heighliners', 'Spice Production']));
    const choices: number[] = [];
    const next = drawTechTokenInState(state, 'Atreides', undefined, (count) => {
      choices.push(count);
      return 1;
    });
    expect(choices).toEqual([3]);
    const [drawn] = onTable(next);
    expect(drawn!.id).not.toBe('stack');
    expect(drawn!.items.map((item) => item.artwork?.name)).toEqual(['Heighliners']);
    expect(drawableTechTokens(next.pieces)[0]!.items.map((item) => item.artwork?.name)).toEqual([
      'Customs',
      'Spice Production',
    ]);
  });

  test('lands at the free spot nearest the drawing seat when the table names one', () => {
    const near: [number, number, number] = [3.84, 0, 0];
    const next = drawTechTokenInState(tableWith(techTokens('customs', ['Customs'])), 'Atreides', near, () => 0);
    const [drawn] = onTable(next);
    expect(Math.hypot(drawn!.position[0] - near[0], drawn!.position[2] - near[2])).toBeLessThan(1);
  });

  test('moves on to the next free spot when the first is taken', () => {
    const first = drawTechTokenInState(
      tableWith(techTokens('a', ['A']), techTokens('b', ['B'])),
      'Atreides',
      undefined,
      () => 0
    );
    const second = drawTechTokenInState(first, 'Atreides', undefined, () => 0);
    const [a, b] = onTable(second);
    expect(a!.position).not.toEqual(b!.position);
    expect(isCollisionFreePosition(b!, b!.position, [a!])).toBe(true);
  });

  test('leaves out tokens someone is carrying, other tokens and the table', () => {
    const carried = techTokens('carried', ['Customs'], { locked: true });
    const placed = techTokens('placed', ['Heighliners'], { inventory: undefined, position: [0, 0, 0] });
    const other = {
      ...techTokens('disc', ['Recovery']),
      items: [
        {
          id: 'disc-0',
          faceUp: true,
          artwork: { back: 'https://example.test/recovery.jpg', name: 'Recovery', type: 'token-disc' },
        },
      ],
    };
    expect(drawableTechTokens([carried, placed, other])).toEqual([]);
    expect(() => drawTechTokenInState(tableWith(carried, placed, other))).toThrow(
      'There are no tech tokens left in the shared table inventory.'
    );
  });

  test('is a table command any player can send', () => {
    const next = applyPieceAction(
      tableWith(techTokens('customs', ['Customs'])),
      { kind: 'tech-token-draw' },
      0,
      'Atreides'
    );
    expect(onTable(next).map((piece) => piece.id)).toEqual(['customs']);
  });

  test('draws tech tokens as wide as a leader disc', () => {
    expect(troopScale(techTokens('customs', ['Customs']))).toBe(troopScale({ kind: 'force', stackKey: 'leader:paul' }));
  });
});
