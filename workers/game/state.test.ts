import { expect, test } from 'vitest';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { freshTableState } from '../../src/shared/play/model';
import { factionSupply, piece, place } from '../../src/shared/play/setupSupply';
import { stackPreviewPositionFor } from '../../src/shared/play/tableGeometry';
import { applyDraftToState } from '../../src/shared/play/tableState';
import { RoomProjection } from './state';

const TRAITOR_BACK = 'https://table.test/published/cardback-presets/traitor/cardback.jpg';

test("a deck on the Traitor preset joins a faction's Traitor deck, and every face-down card in it reaches a viewer alike", () => {
  let next = 0;
  const traitors = factionSupply(
    {
      faction: { id: 'atreides', slug: 'atreides', name: 'Atreides' },
      capturedAt: 0,
      definition: assetPublishingFaction,
      components: {
        token: { front: null, back: null },
        leaders: [],
        troops: [],
        alliance: { front: null, back: null },
        traitors: {
          back: TRAITOR_BACK,
          cards: assetPublishingFaction.leaders.map((leader) => ({
            memberId: leader.memberId,
            name: leader.name,
            front: `https://table.test/published/factions/atreides/${leader.memberId}.jpg`,
          })),
        },
      },
      extras: [],
      readiness: { ready: true, problems: [] },
    },
    0,
    { id: () => `supply-${next++}`, shuffle: (items) => items }
  ).traitors[0]!;
  /* A catalogue deck an author put on the Traitor preset, as the capture writes it and as it lands face down on the table. */
  const preset = place(
    {
      ...piece('preset-deck', 'Preset deck', 'shared', '#d5ba8c', 'card', 'deck:preset-deck'),
      items: [0, 1].map((index) => ({
        id: `preset-${index}`,
        faceUp: false,
        artwork: {
          front: 'https://table.test/published/cards/lasgun/card.jpg',
          back: TRAITOR_BACK,
          backName: 'Traitor',
          name: 'Lasgun',
          type: 'card-treachery',
        },
      })),
    },
    [6, 0, 6]
  );
  const table = { ...freshTableState(), pieces: [traitors, preset] };

  const combined = applyDraftToState(table, {
    operation: 'merge',
    pieceId: preset.id,
    sourcePieceId: preset.id,
    pickedUpItemIds: preset.items.map((item) => item.id),
    withdrawals: [],
    origin: [...preset.position],
    originOrientation: preset.orientation,
    position: stackPreviewPositionFor(traitors),
    orientation: preset.orientation,
    targetZoneId: traitors.zoneId,
    targetPieceId: traitors.id,
  });
  const stack = combined.pieces.find((candidate) => candidate.id === traitors.id)!;

  expect(new Set(stack.items.map((item) => item.artwork?.type))).toEqual(new Set(['card-traitor', 'card-treachery']));
  expect(new RoomProjection('secret').piece(stack).items.map((item) => item.artwork)).toEqual(
    stack.items.map(() => ({ back: TRAITOR_BACK, backName: 'Traitor' }))
  );
});
