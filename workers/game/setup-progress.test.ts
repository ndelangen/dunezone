import { expect, test } from 'vitest';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import type { FactionCapture } from '../../src/shared/play/capture';
import type { StoredPiece } from '../../src/shared/play/model';
import type { TableRoster } from '../../src/shared/play/schema';
import { factionSupply } from '../../src/shared/play/setupSupply';
import { OTHER_DECK_POSITION } from '../../src/shared/play/tableFurnitureLayout';
import { deckCommand } from './decks';
import { hostedFixturePlan } from './fixture';
import { gatherTraitors, initialSetup } from './setup-progress';
import type { StoredSnapshot } from './state';

const TRAITOR_BACK = 'https://table.test/published/cardback-presets/traitor/cardback.jpg';
let next = 0;

/* One faction's Traitor deck as setup places it: its setup name, one card per leader, on the published Traitor back. */
function traitorDeck(factionId: string, angle: number) {
  return factionSupply(
    {
      faction: { id: factionId, slug: factionId, name: factionId },
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
            front: null,
          })),
        },
      },
      extras: [],
      readiness: { ready: true, problems: [] },
    },
    angle,
    { id: () => `supply-${next++}`, shuffle: (items) => items }
  ).traitors[0]!;
}

function tableOf(pieces: StoredPiece[]): StoredSnapshot {
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  return { ...fixture, table: { ...fixture.table, pieces } };
}

/* Gathers every Traitor stack on a table holding only `pieces`, and reads back the name and table spot of what is left. */
function gathered(pieces: StoredPiece[]) {
  return gatherTraitors(tableOf(pieces), new Set(), true).table.pieces.map((piece) => ({
    label: piece.label,
    at: [piece.position[0], piece.position[2]],
  }));
}

test('gathering names combined stacks by their back, and a lone stack it only moves keeps its name', () => {
  const atreides = traitorDeck('atreides', 0);
  const harkonnen = traitorDeck('harkonnen', Math.PI);
  /* Harkonnen's deck dealt down to its last card, which the deal names by its back. */
  const dealt = harkonnen.items
    .slice(1)
    .reduce(
      (snapshot) =>
        deckCommand(snapshot, 'harkonnen', { kind: 'deck-draw', pieceId: harkonnen.id, recipient: 'harkonnen' }),
      tableOf([harkonnen])
    );
  const lastCard = dealt.table.pieces[0]!;
  const parked = [OTHER_DECK_POSITION[0], OTHER_DECK_POSITION[2]];

  expect(gathered([atreides])).toEqual([{ label: 'Traitor cards', at: parked }]);
  expect(gathered([lastCard])).toEqual([{ label: 'Traitor card', at: parked }]);
  expect(gathered([atreides, lastCard])).toEqual([{ label: 'Traitor deck', at: parked }]);
});

const prediction = (id: string) => ({
  id,
  type: 'prediction',
  title: `Prediction ${id}`,
  symbol: '/vector/icon/fate.svg',
  before: 'traitors',
  priority: 10,
  allPlayersMustBeReady: false,
});

/* Only the parts initialSetup reads: the faction, its declarations and its start text. */
const capture = (factionId: string, declarationId: string) =>
  ({
    faction: { id: factionId, slug: factionId, name: factionId },
    definition: { extraPhases: [prediction(declarationId)], rules: { startText: '' } },
  }) as unknown as FactionCapture;

test('two factions whose joined ids would read alike still get distinct setup steps', () => {
  /* `a_b` + `c` and `a` + `b_c` both join to `a_b_c`; each prediction must keep its own step to lock. */
  const roster = {
    seatCount: 2,
    seats: [
      { position: 0, faction: { id: 'a_b', name: 'A B' } },
      { position: 1, faction: { id: 'a', name: 'A' } },
    ],
  } as unknown as TableRoster;
  const setup = initialSetup([capture('a_b', 'c'), capture('a', 'b_c')], roster, 0);
  const ids = setup.steps.map((step) => step.id);

  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(setup.steps.filter((step) => step.kind === 'prediction').map((step) => step.factionId))).toEqual(
    new Set(['a', 'a_b'])
  );
});
