import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import type { FactionCapture } from './capture';
import { applyPieceAction, initialSnapshot, nextSnapshot } from './commands';
import { freshTableState } from './model';
import type { TablePiece, TableState } from './model';
import { tableForViewer } from './protocol';
import { factionSupply } from './setupSupply';
import type { SupplyDependencies } from './setupSupply';
import { stackPreviewPositionFor } from './tableGeometry';
import { applyDraftToState } from './tableState';

test('snapshots discard version entries when a split removes its source', () => {
  const previous = initialSnapshot();
  const table = applyPieceAction(
    tableForViewer(previous, 'harkonnen'),
    { kind: 'split', pieceId: 'harkonnen-force-stack', count: 5 },
    previous.phase
  );
  const next = nextSnapshot(previous, table);

  expect(next.table.pieces.some((piece) => piece.id === 'harkonnen-force-stack')).toBe(false);
  expect(next.versions).not.toHaveProperty('harkonnen-force-stack');
  expect(Object.keys(next.versions).sort()).toEqual(next.table.pieces.map((piece) => piece.id).sort());
  expect(previous.versions).toHaveProperty('harkonnen-force-stack', 0);
});

test('revision stamps advance legacy versions while preserving unchanged pieces', () => {
  const previous = { ...initialSnapshot(), revision: 37 };
  previous.versions['retired-piece'] = 12;
  const table = applyPieceAction(
    tableForViewer(previous, 'harkonnen'),
    { kind: 'lock', pieceId: 'harkonnen-force-stack' },
    previous.phase
  );
  const next = nextSnapshot(previous, table);

  expect(next.revision).toBe(38);
  expect(next.versions).toMatchObject({ 'harkonnen-force-stack': 38, 'atreides-force-stack': 0 });
  expect(next.versions).not.toHaveProperty('retired-piece');

  const reset = nextSnapshot(next, freshTableState(), 0, true);
  expect(reset.revision).toBe(39);
  expect(new Set(Object.values(reset.versions))).toEqual(new Set([39]));
});

describe('card decks', () => {
  const BACK = 'https://cards.example/shared-back.png';
  let next = 0;
  const dependencies: SupplyDependencies = { id: () => `supply-${next++}`, shuffle: (items) => items };

  function traitorDeck(factionId: string, angle: number): TablePiece {
    const capture: FactionCapture = {
      faction: { id: factionId, slug: factionId, name: factionId },
      capturedAt: 0,
      definition: assetPublishingFaction,
      components: {
        token: { front: null, back: null },
        leaders: [],
        troops: [],
        alliance: { front: null, back: null },
        traitors: {
          back: BACK,
          cards: assetPublishingFaction.leaders.map((leader) => ({
            memberId: leader.memberId,
            name: leader.name,
            front: null,
          })),
        },
      },
      extras: [],
      readiness: { ready: true, problems: [] },
    };
    return factionSupply(capture, angle, dependencies).traitors[0]!;
  }

  /* The drop a player makes by carrying one stack onto another, as the table commits it. */
  function dropOnto(state: TableState, pieceId: string, targetId: string): TableState {
    const piece = state.pieces.find((candidate) => candidate.id === pieceId)!;
    const target = state.pieces.find((candidate) => candidate.id === targetId)!;
    return applyDraftToState(state, {
      operation: 'merge',
      pieceId,
      sourcePieceId: pieceId,
      pickedUpItemIds: piece.items.map((item) => item.id),
      withdrawals: [],
      origin: [...piece.position],
      originOrientation: piece.orientation,
      position: stackPreviewPositionFor(target),
      orientation: piece.orientation,
      targetZoneId: target.zoneId,
      targetPieceId: targetId,
    });
  }

  const pieceById = (state: TableState, id: string) => state.pieces.find((piece) => piece.id === id);
  const splitOff = (state: TableState, pieceId: string, count: number) =>
    applyPieceAction(state, { kind: 'split', pieceId, count }, 0);
  const splitOne = (state: TableState, pieceId: string) => splitOff(state, pieceId, 1);

  test('a Traitor card dropped onto a Treachery deck stays separate even when their backs are identical', () => {
    const fresh = freshTableState();
    const traitors = traitorDeck('atreides', 0);
    const table = {
      ...fresh,
      pieces: [...fresh.pieces, traitors].map((piece) => ({
        ...piece,
        items: piece.items.map((item) => ({ ...item, artwork: { back: BACK, type: 'card' } })),
      })),
    };
    const drawn = splitOne(table, traitors.id);
    const card = drawn.pieces.at(-1)!;

    const dropped = dropOnto(drawn, card.id, 'treachery-deck');

    expect(dropped.events[0]?.status).toBe('rejected');
    expect(pieceById(dropped, card.id)?.items).toEqual(card.items);
    expect(pieceById(dropped, 'treachery-deck')?.items).toEqual(pieceById(drawn, 'treachery-deck')?.items);
  });

  test('a Traitor stack keeps its name through a split, a merge and two factions combining', () => {
    const atreides = traitorDeck('atreides', 0);
    const harkonnen = traitorDeck('harkonnen', Math.PI);
    const table = { ...freshTableState(), pieces: [atreides, harkonnen] };
    expect(atreides.label).toBe('Traitor deck');

    const split = splitOne(table, atreides.id);
    const card = split.pieces.at(-1)!;
    expect([card.label, pieceById(split, atreides.id)?.label]).toEqual(['Traitor card', 'Traitor deck']);

    const merged = dropOnto(split, card.id, atreides.id);
    expect(pieceById(merged, atreides.id)?.label).toBe('Traitor deck');

    const combined = dropOnto(merged, harkonnen.id, atreides.id);
    expect(pieceById(combined, harkonnen.id)).toBeUndefined();
    expect(pieceById(combined, atreides.id)).toMatchObject({ label: 'Traitor deck' });
    expect(pieceById(combined, atreides.id)?.items).toHaveLength(atreides.items.length + harkonnen.items.length);
  });

  test('a split Traitor stack on the table reads the same before and after a card joins it', () => {
    const atreides = traitorDeck('atreides', 0);
    const table = { ...freshTableState(), pieces: [atreides] };

    const three = splitOff(table, atreides.id, 3);
    const stack = three.pieces.at(-1)!;
    expect(stack.label).toBe('Traitor deck');

    const drawn = splitOne(three, atreides.id);
    const joined = dropOnto(drawn, drawn.pieces.at(-1)!.id, stack.id);
    expect(pieceById(joined, stack.id)).toMatchObject({ label: 'Traitor deck' });
    expect(pieceById(joined, stack.id)?.items).toHaveLength(4);
  });
});
