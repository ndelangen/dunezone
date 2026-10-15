import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../../src/shared/factions/schema';
import type { FactionCapture } from '../../src/shared/play/capture';
import type { StoredPiece } from '../../src/shared/play/model';
import type { TableRoster } from '../../src/shared/play/schema';
import { factionSupply } from '../../src/shared/play/setupSupply';
import { SHARED_ITEM_PLACEMENT_ANCHORS } from '../../src/shared/play/tableFurnitureLayout';
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
      definition: toStoredHeroKey(assetPublishingFaction),
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
  const parked = [SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position[0], SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position[2]];

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

test('gathering chooses a vacant shared slot without moving other items', () => {
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  const source = fixture.table.pieces.find((piece) => piece.kind === 'force')!;
  const blockers = SHARED_ITEM_PLACEMENT_ANCHORS.slice(0, 7).map((anchor, index) => ({
    ...source,
    id: `occupied-${index}`,
    position: [...anchor.position] as StoredPiece['position'],
    orientation: 0,
  }));
  const traitor = traitorDeck('atreides', 0);
  const result = gatherTraitors(tableOf([...blockers, traitor]), new Set(), true);
  expect(result.table.pieces.slice(0, 7)).toEqual(blockers);
  const gathered = result.table.pieces.find((piece) => piece.id === traitor.id)!;
  expect([gathered.position[0], gathered.position[2]]).toEqual([
    SHARED_ITEM_PLACEMENT_ANCHORS[7]!.position[0],
    SHARED_ITEM_PLACEMENT_ANCHORS[7]!.position[2],
  ]);
  expect(gatherTraitors(result, new Set(), true)).toEqual(result);
});

test('a full shared shelf defers gathering until a slot clears, without moving its contents', () => {
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  const source = fixture.table.pieces.find((piece) => piece.kind === 'force')!;
  const blockers = SHARED_ITEM_PLACEMENT_ANCHORS.map((anchor, index) => ({
    ...source,
    id: `occupied-${index}`,
    position: [...anchor.position] as StoredPiece['position'],
    orientation: 0,
  }));
  const traitor = traitorDeck('atreides', 0);
  const result = gatherTraitors(tableOf([...blockers, traitor]), new Set(), true);
  expect(result.table.pieces).toEqual([...blockers, traitor]);
  expect(result.pendingTraitors).toEqual(traitor.items.map((item) => item.id));
  expect(gatherTraitors(result, new Set())).toEqual(result);
  const cleared = {
    ...result,
    table: { ...result.table, pieces: result.table.pieces.filter((piece) => piece.id !== blockers[7]!.id) },
  };
  const gathered = gatherTraitors(cleared, new Set());
  expect(gathered.pendingTraitors).toEqual([]);
  expect(gathered.table.pieces.find((piece) => piece.id === traitor.id)!.position).toEqual(
    SHARED_ITEM_PLACEMENT_ANCHORS[7]!.position
  );
});
