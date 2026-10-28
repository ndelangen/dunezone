import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { toStoredHeroKey } from '../../src/shared/factions/schema';
import { initialSnapshot } from '../../src/shared/play/commands';
import { freshTableState } from '../../src/shared/play/model';
import { composeTurn } from '../../src/shared/play/phases';
import { factionSupply, piece, place } from '../../src/shared/play/setupSupply';
import { stackPreviewPositionFor, tokenBoxRatio, troopScale } from '../../src/shared/play/tableGeometry';
import { piecesCanStack } from '../../src/shared/play/tablePhysics';
import { applyDraftToState } from '../../src/shared/play/tableState';
import {
  RoomProjection,
  storedSnapshotSchema,
  validatedSnapshot,
  withKnownCardFaces,
  withUnchangedParts,
} from './state';

const TRAITOR_BACK = 'https://table.test/published/cardback-presets/traitor/cardback.jpg';

test("a deck on the Traitor preset joins a faction's Traitor deck, and every face-down card in it reaches a viewer alike", () => {
  let next = 0;
  const traitors = factionSupply(
    {
      faction: { id: 'atreides', slug: 'atreides', name: 'Atreides' },
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

test('a stored card keeps its type, so a snapshot holding a card without one does not restore', () => {
  const snapshot = initialSnapshot();
  const holding = (artwork: object) => ({
    ...snapshot,
    table: {
      ...snapshot.table,
      pieces: [
        {
          ...piece('traitors', 'Traitor cards', 'shared', '#d5ba8c', 'card', 'cards:traitor'),
          items: [{ id: 'traitor', faceUp: false, artwork }],
        },
      ],
    },
  });

  expect(
    storedSnapshotSchema.safeParse(holding({ back: TRAITOR_BACK, backName: 'Traitor', type: 'card-traitor' })).success
  ).toBe(true);
  expect(storedSnapshotSchema.safeParse(holding({ back: TRAITOR_BACK, backName: 'Traitor' })).success).toBe(false);
});

test("the composed turn reaches every viewer, so hosted headers and trackers follow the factions' phases", () => {
  const phases = composeTurn(
    [
      {
        factionId: 'guild',
        declarations: [
          {
            id: 'negotiations',
            type: 'instruction',
            title: 'Guild negotiations',
            symbol: '/vector/icon/fate.svg',
            before: 'bidding',
            priority: 10,
            allPlayersMustBeReady: false,
          },
        ],
      },
    ],
    ['guild']
  );
  const stored = storedSnapshotSchema.parse({ ...initialSnapshot(), phases });
  const projection = new RoomProjection('secret');

  expect(projection.snapshot(stored).phases).toEqual(phases);
  expect(projection.snapshot(stored, 'guild').phases).toEqual(phases);
  expect(projection.snapshot(storedSnapshotSchema.parse(initialSnapshot())).phases).toBeUndefined();
});

test('a viewer without a faction never takes an empty battle side as its own, even beside a stray plan', () => {
  const plan = {
    mode: 'max' as const,
    troops: [],
    spice: 3,
    adjustment: 0,
    leaderIds: [],
    cardIds: [],
    strength: 0,
    pieces: [],
    faces: [],
  };
  const stored = storedSnapshotSchema.parse({
    ...initialSnapshot(),
    battleState: {
      id: 'battle',
      anchor: [0, 0, 0],
      territory: 'Arrakeen',
      stage: 'preparing',
      sides: [{ factionId: 'atreides', ready: false, choice: null }, null],
      deadline: null,
      plans: [plan, plan],
    },
  });
  const projection = new RoomProjection('secret');

  expect(projection.snapshot(stored).battlePlan).toBeNull();
  expect(projection.snapshot(stored, 'atreides').battlePlan).toMatchObject({ spice: 3 });
});

test('every viewer, spectators included, sees how many Treachery cards each seated faction holds, and nothing else of a hand', () => {
  const card = (id: string, type: string) => ({
    id,
    label: id,
    owner: 'atreides',
    color: '#000',
    accent: '#fff',
    kind: 'card' as const,
    stackKey: id,
    items: [
      {
        id: `${id}-item`,
        faceUp: false,
        artwork: { front: 'https://dune.zone/f.png', back: 'https://dune.zone/b.png', name: id, type },
      },
    ],
    position: [0, 0, 0] as [number, number, number],
    orientation: 0,
    zoneId: null,
    locked: false,
  });
  const parsed = storedSnapshotSchema.parse({
    ...initialSnapshot(),
    factionInventories: { atreides: [card('lasgun', 'card-treachery'), card('traitor', 'card-traitor')] },
  });
  const stored = {
    ...parsed,
    roster: {
      seatCount: 2,
      seats: [
        { position: 0, faction: { id: 'atreides', name: 'Atreides' } },
        { position: 1, faction: { id: 'fremen', name: 'Fremen' } },
      ],
    },
  } as unknown as typeof parsed;
  const projection = new RoomProjection('secret');

  expect(projection.snapshot(stored).handCounts).toEqual({ atreides: 1, fremen: 0 });
  expect(projection.snapshot(stored, 'fremen').handCounts).toEqual({ atreides: 1, fremen: 0 });
  expect(projection.snapshot(stored, 'fremen').hand).toEqual([]);
  expect(projection.snapshot(parsed).handCounts).toBeUndefined();

  /* A card committed to a secret battle plan still counts, so editing the plan never shows opponents a change before the reveal. */
  const plan = (pieces: ReturnType<typeof card>[]) => ({
    mode: 'max' as const,
    troops: [],
    spice: 0,
    adjustment: 0,
    leaderIds: [],
    cardIds: pieces.map((piece) => piece.id),
    strength: 0,
    pieces,
    faces: [],
    disclosed: { leader: false, dial: false, cardIds: [] },
  });
  const battle = (stage: 'preparing' | 'revealed') =>
    ({
      ...stored,
      factionInventories: { atreides: [card('traitor', 'card-traitor')] },
      battleState: {
        id: 'battle',
        anchor: [0, 0, 0],
        territory: 'Arrakeen',
        stage,
        sides: [
          { factionId: 'atreides', ready: false, choice: null },
          { factionId: 'fremen', ready: false, choice: null },
        ],
        deadline: null,
        plans: [plan([card('lasgun', 'card-treachery')]), plan([])],
      },
    }) as unknown as typeof parsed;

  expect(projection.snapshot(battle('preparing'), 'fremen').handCounts).toEqual({ atreides: 1, fremen: 0 });
  expect(projection.snapshot(battle('revealed'), 'fremen').handCounts).toEqual({ atreides: 0, fremen: 0 });
});

test('every viewer is sent the same sorted card faces, and a card taken out of the game stays among them, history included', () => {
  const initial = storedSnapshotSchema.parse(initialSnapshot());
  const face = (name: string) => `https://table.test/published/treachery/${name}.jpg`;
  const stored = {
    ...initial,
    table: {
      ...initial.table,
      pieces: initial.table.pieces.map((candidate) =>
        candidate.kind === 'card'
          ? {
              ...candidate,
              items: candidate.items.map((item, index) => ({
                ...item,
                artwork: { front: face(index % 2 ? 'karama' : 'lasgun'), back: face('back'), type: 'treachery' },
              })),
            }
          : candidate
      ),
    },
  };
  const projection = new RoomProjection('secret');
  const faces = projection.snapshot(stored).cardFaces;
  expect(faces).toEqual([face('karama'), face('lasgun')]);
  expect(projection.snapshot(stored, 'harkonnen').cardFaces).toBe(faces);

  const withoutCards = {
    ...stored,
    table: { ...stored.table, pieces: stored.table.pieces.filter((candidate) => candidate.kind !== 'card') },
  };
  expect(projection.snapshot(withoutCards).cardFaces).toEqual([]);
  expect(projection.snapshot(withKnownCardFaces(stored, withoutCards)).cardFaces).toEqual(faces);
  /* A step stored before the list existed is sent the live game's list, so no two steps differ by a removed card. */
  expect(new RoomProjection('secret').snapshot(withoutCards, undefined, stored).cardFaces).toEqual(faces);
});

test('a validated command keeps every piece it left alone as the same object, and only those', () => {
  const previous = storedSnapshotSchema.parse(initialSnapshot());
  const [moved, ...untouched] = previous.table.pieces;
  /* A command's result rebuilt from scratch, as a serialized copy is, with one piece moved and one more added. */
  const added = { ...structuredClone(moved!), id: 'added-piece' };
  const next = structuredClone({
    ...previous,
    revision: previous.revision + 1,
    table: {
      ...previous.table,
      pieces: [added, { ...moved!, position: [1, moved!.position[1], 1] }, ...untouched],
    },
  });

  const validated = validatedSnapshot(previous, next);
  const pieces = new Map(validated.table.pieces.map((piece) => [piece.id, piece]));

  expect(validated).toEqual(storedSnapshotSchema.parse(next));
  for (const piece of untouched) {
    expect(pieces.get(piece.id)).toBe(piece);
  }
  expect(pieces.get(moved!.id)).not.toBe(moved);
  expect(pieces.get(moved!.id)!.items).toBe(moved!.items);
  expect(validated.table).not.toBe(previous.table);
  expect(validated.factionArtwork).toBe(previous.factionArtwork);
  /* The projection's per-piece cache then answers for the untouched card pieces in the next delivery. */
  const projection = new RoomProjection('secret');
  const before = new Map(projection.snapshot(previous).table.pieces.map((piece) => [piece.id, piece]));
  const after = projection.snapshot(validated).table.pieces;
  for (const piece of after.filter((candidate) => candidate.id !== moved!.id && candidate.id !== 'added-piece')) {
    expect(piece).toBe(before.get(piece.id));
  }
});

test('a validated snapshot that changed nothing is the previous snapshot itself', () => {
  const previous = storedSnapshotSchema.parse(initialSnapshot());

  expect(validatedSnapshot(previous, structuredClone(previous))).toBe(previous);
});

test('every audience shares the parts of a projection no faction changes, and an unchanged part outlives its snapshot', () => {
  const stored = storedSnapshotSchema.parse(initialSnapshot());
  const projection = new RoomProjection('secret');
  const everyone = projection.snapshot(stored);
  const atreides = projection.snapshot(stored, 'atreides');

  expect(atreides.table).toBe(everyone.table);
  expect(atreides.versions).toBe(everyone.versions);
  expect(atreides.battleResults).toBe(everyone.battleResults);
  expect(projection.snapshot({ ...stored, revision: stored.revision + 1 }, 'atreides').table).toBe(everyone.table);
});

test('keeping unchanged parts never changes a value, its key order or which parts are shared', () => {
  let seed = 11;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  const below = (count: number) => Math.floor(random() * count);
  /* Small JSON values whose lists often hold entries with ids, so matching by id and by index both get exercised. */
  function value(depth: number): unknown {
    const roll = random();
    if (depth === 0 || roll < 0.3) {
      return [null, true, 1, 'text', below(3)][below(5)];
    }
    if (roll < 0.6) {
      return Array.from({ length: below(5) }, () =>
        random() < 0.5 ? { id: `e${below(4)}`, value: value(depth - 1) } : value(depth - 1)
      );
    }
    return Object.fromEntries(Array.from({ length: below(4) }, () => [`k${below(4)}`, value(depth - 1)]));
  }
  for (let round = 0; round < 2000; round++) {
    const previous = value(4);
    const next = random() < 0.3 ? structuredClone(previous) : value(4);
    const kept = withUnchangedParts(previous, structuredClone(next));

    expect(JSON.stringify(kept)).toBe(JSON.stringify(next));
    if (JSON.stringify(previous) === JSON.stringify(next) && typeof previous === 'object' && previous !== null) {
      expect(kept).toBe(previous);
    }
  }
});

test('a list that grows by an empty entry keeps its new length', () => {
  const first = { id: 'a' };

  expect(withUnchangedParts([first], [first, undefined])).toEqual([first, undefined]);
});

test('token privacy preserves physical shape, stack compatibility and authorized faces', () => {
  const source = freshTableState().pieces.find((entry) => entry.kind === 'force')!;
  const token = {
    ...source,
    label: 'Secret leader',
    stackKey: 'leader:atreides:secret-member',
    items: [
      {
        id: 'opaque-item',
        faceUp: false,
        artwork: {
          front: 'https://table.test/secret.png',
          back: 'https://table.test/back.png',
          name: 'Secret leader',
          type: 'token-enhance',
          size: 1,
          description: 'Secret ability',
        },
      },
    ],
  };
  const projection = new RoomProjection('secret');
  const hidden = projection.piece(token);
  const visible = projection.piece(token, true);
  const flipped = projection.piece({ ...token, items: token.items.map((item) => ({ ...item, faceUp: true })) });
  expect(hidden).toMatchObject({
    id: token.id,
    label: 'Token',
    position: token.position,
    orientation: token.orientation,
  });
  expect(hidden.items[0]).toEqual({
    id: 'opaque-item',
    faceUp: false,
    artwork: {
      back: 'https://table.test/back.png',
      backName: undefined,
      type: 'token-enhance',
      size: 1,
    },
  });
  expect(hidden.stackKey).toMatch(/^leader:/);
  expect(tokenBoxRatio(hidden)).toBe(tokenBoxRatio(token));
  expect(troopScale(hidden)).toBe(troopScale(token));
  expect(hidden.stackKey).not.toContain('secret-member');
  expect(visible.stackKey).toBe(hidden.stackKey);
  expect(flipped.stackKey).toBe(hidden.stackKey);
  expect(visible.items).toEqual(token.items);
  expect(visible.label).toBe(token.label);
  expect(flipped.items[0].artwork).toEqual(token.items[0].artwork);
  // Another audience's peek cannot warm a cache that exposes the face in the public copy.
  expect(projection.piece(token)).toBe(hidden);
  expect(piecesCanStack(hidden, flipped)).toBe(piecesCanStack(token, { ...token, items: flipped.items }));
  expect(projection.piece({ ...token, stackKey: null }).stackKey).toBeNull();
  const factionToken = { ...token, stackKey: 'faction-token:atreides' };
  expect(projection.piece(factionToken)).toBe(factionToken);
});
