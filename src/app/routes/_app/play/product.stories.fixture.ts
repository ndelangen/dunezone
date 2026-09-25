import { CanonicalFactionStoredSchema } from '@shared/factions/schema';
import type { TablePiece } from '@shared/play/model';
import type { GameSnapshot, Viewer } from '@shared/play/protocol';
import { factionSupplyLayout } from '@shared/play/setupLayout';
import { BOARD_RADIUS, restingPositionAt } from '@shared/play/tableGeometry';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { tableSeatAngles } from '@shared/play/tableSettings';
import board from '@shared/rulebooks/boards/arrakis.json';

import type { StorybookDatabase } from '@db/storybook';
import { db, ref, storybookViewer } from '@db/storybook';

import { draftingSnapshot, storyPlayer } from './drafting.stories.fixture';
import capturedFactions from './product.stories.fixture/factions.json';
import ruleset from './product.stories.fixture/ruleset.json';
import { storyTransport } from './storyTransport';

/* Public catalogue copies from 2026-09-21. See the fixture provenance beside the JSON. */
export const factions = capturedFactions.map((entry) => ({
  ...entry,
  data: CanonicalFactionStoredSchema.parse(entry.data),
}));
export const SIX = ['twaffle', 'thialfi', 'fectumbra', 'erickenneth', 'ridwan', 'argelius'].map((slug, index) =>
  storyPlayer(`seat-${index + 1}`, slug)
);
export const GAME_KEY = 'game:real';
const RULESET_KEY = 'ruleset:classicrules';
const imageHref = (path: string) => new URL(path, location.origin).href;
export const cardBack = () => imageHref('/play-fixtures/dreamrules/cardback.jpg');

/* Replace the mechanical seed's visible content while retaining its isolated identities. */
export function productDatabase(baseline: StorybookDatabase) {
  const viewer = SIX[1]!;
  baseline.users[0]!.name = viewer.name;
  Object.assign(baseline.profiles[0]!, { username: viewer.name, slug: 'thialfi', avatar_url: viewer.avatar });
  Object.assign(baseline.rulesets[0]!, { name: ruleset.name, slug: ruleset.slug, about: ruleset.about });
  baseline.factions[0]!.data = factions[0]!.data;
  baseline.factions[0]!.slug = factions[0]!.slug;
}

export const parameters = (
  state: 'pending' | 'ready' | 'expired',
  isAdmin = true,
  reason?: string,
  minimumPlayers: TableSeatCount = 6
) => ({
  identity: { ...storybookViewer, sessionKey: 'game-session' },
  database: db((baseline) => {
    productDatabase(baseline);
    for (const user of baseline.users) {
      user.isAdmin = isAdmin;
    }
    baseline.authSessions.push({
      $key: 'game-session',
      userId: ref(storybookViewer.subjectKey),
      expirationTime: 4_102_444_800_000,
    });
    baseline.authRefreshTokens.push({ sessionId: ref('game-session'), expirationTime: 4_102_444_800_000 });
    baseline.play_games.push({
      $key: GAME_KEY,
      state,
      ruleset_id: ref(RULESET_KEY),
      minimum_players: minimumPlayers,
      creator_id: ref(storybookViewer.subjectKey),
      secret: 'story-only-secret',
      attempt_id: 'story-attempt',
      provision_expires_at: 4_102_444_800_000,
      created_at: 0,
      ...(reason ? { provision_error: reason } : {}),
      ...(state === 'ready' ? { confirmed_at: 0 } : {}),
    });
  }),
});

export function swappingSnapshot(): GameSnapshot {
  const { draft: _draft, ...snapshot } = draftingSnapshot(SIX, 6);
  return {
    ...snapshot,
    stage: 'swapping',
    factionArtwork: Object.fromEntries(
      factions.map(({ slug, data }) => [slug, { background: data.background, logo: data.logo, troops: data.troops }])
    ),
    swapping: {
      round: 'story-round',
      deadline: Date.now() + 240_000,
      closed: false,
      ready: [],
      offers: [],
      nextOrder: 1,
      tokens: Object.fromEntries(factions.map((entry, index) => [`seat-${index + 1}`, imageHref(entry.token)])),
    },
    roster: {
      seatCount: 6,
      seats: factions.map((entry, position) => ({
        id: `seat-${position + 1}`,
        position,
        faction: { id: entry.slug, name: entry.data.name, color: entry.data.themeColor },
      })),
    },
  };
}

function piece(
  id: string,
  label: string,
  owner: string,
  color: string,
  kind: TablePiece['kind'],
  items: TablePiece['items'],
  position: TablePiece['position'],
  stackKey: string,
  orientation = 0
): TablePiece {
  const value: TablePiece = {
    id,
    label,
    owner,
    color,
    accent: '#ead9bb',
    kind,
    stackKey,
    items,
    position,
    orientation,
    zoneId: null,
    locked: false,
  };
  return { ...value, position: restingPositionAt(position, value) };
}

function leaderPieces(index = 1): TablePiece[] {
  const faction = factions[index]!;
  return faction.data.leaders.map((leader, i) =>
    piece(
      `leader-${faction.slug}-${i}`,
      leader.name,
      faction.slug,
      faction.data.themeColor,
      'force',
      [
        {
          id: leader.memberId,
          faceUp: true,
          artwork: {
            front: imageHref(faction.leaders[i]!.front),
            back: imageHref(faction.token),
            name: leader.name,
            type: 'token-disc',
          },
        },
      ],
      [-25, 0, -25],
      `leader:${faction.slug}:${leader.memberId}`
    )
  );
}

export function setupSnapshot(viewerSeat = 'seat-2'): GameSnapshot {
  const snapshot = swappingSnapshot();
  snapshot.stage = 'setup';
  snapshot.swapping!.closed = true;
  snapshot.swapping!.ready = SIX.map((player) => player.seat);
  snapshot.setup = {
    steps: [
      {
        id: 'traitors',
        kind: 'traitors',
        title: 'Traitor selection',
        instructions:
          'Combine, shuffle and deal traitor cards. Return unwanted cards to the table, then confirm Ready.',
        symbol: '/vector/icon/traitor.svg',
      },
      {
        id: 'forces',
        kind: 'forces',
        title: 'Starting forces',
        instructions:
          'Place your starting forces using your faction instructions. When every player is prepared, Ready enables Next into Turn 1 Storm.',
        symbol: '/vector/icon/shipment_disc.svg',
      },
    ],
    index: 0,
    visit: 1,
    mapRevealed: false,
    completed: [],
    instructions: factions.map(({ slug, data }) => ({ factionId: slug, text: data.rules.startText })),
  };
  snapshot.predictions = {};
  const angles = tableSeatAngles(6);
  snapshot.table.pieces = factions.flatMap((faction, index) => {
    const angle = angles[index]!;
    const layout = factionSupplyLayout(angle, faction.data.troops.length);
    const troops = faction.data.troops.map((troop, i) =>
      piece(
        `reserve-seat-${index + 1}-${i}`,
        `${faction.data.name} ${troop.name}`,
        faction.slug,
        faction.data.themeColor,
        'force',
        Array.from({ length: troop.count }, (_, n) => ({
          id: `${faction.slug}-troop-${i}-${n}`,
          faceUp: true,
          artwork: {
            front: imageHref(`/play-fixtures/product/${faction.slug}-troop-${i}.jpg`),
            back: imageHref(`/play-fixtures/product/${faction.slug}-troop-${i}${troop.back ? '-back' : ''}.jpg`),
            name: troop.name,
            type: 'troop',
          },
        })),
        layout.reserves[i]!,
        `troops:${faction.slug}:${i}`
      )
    );
    /* The published Traitor preset supplies the common back. */
    const cards = piece(
      `traitors-seat-${index + 1}`,
      `${faction.data.name} traitors`,
      'shared',
      faction.data.themeColor,
      'card',
      faction.data.leaders.map((_leader, i) => ({
        id: `hidden-${index * 5 + i}`,
        faceUp: false,
        artwork: {
          back: imageHref('/play-fixtures/product/traitor-back.jpg'),
          type: 'card-traitor',
        },
      })),
      layout.traitors.position,
      'cards:traitor',
      layout.traitors.orientation
    );
    return [...troops, cards];
  });
  const own = snapshot.roster!.seats.findIndex((seat) => seat.id === viewerSeat);
  if (own >= 0) {
    snapshot.bank = { factionId: factions[own]!.slug, balance: factions[own]!.data.rules.spiceCount };
    snapshot.hand = leaderPieces(own);
  }
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

function placeStartingForces(snapshot: GameSnapshot) {
  const placements: Array<[number, number, string]> = [
    [0, 10, 'arrakeen'],
    [1, 10, 'carthag'],
    [3, 5, 'tueks-sietch'],
    [4, 5, 'sietch-tabr'],
    [4, 5, 'false-wall-south'],
    [5, 1, 'polar-sink'],
    [5, 1, 'imperial-basin'],
  ];
  for (const [factionIndex, count, territory] of placements) {
    const reserve = snapshot.table.pieces.find((entry) => entry.id === `reserve-seat-${factionIndex + 1}-0`)!;
    const area = board.geometry.parts.find(
      (part) =>
        part.key === ({ 'tueks-sietch': 'tueks', 'sietch-tabr': 'tabr', 'polar-sink': 'polar' }[territory] ?? territory)
    );
    if (!area) {
      throw new Error(`The board is missing ${territory}.`);
    }
    const placed = {
      ...reserve,
      id: `starting-${factionIndex}-${territory}`,
      items: reserve.items.slice(0, count),
      zoneId: territory,
    };
    reserve.items = reserve.items.slice(count);
    placed.position = restingPositionAt(
      [(area.x + area.width / 2 - 0.5) * BOARD_RADIUS * 2, 0, (area.y + area.height / 2 - 0.5) * BOARD_RADIUS * 2],
      placed
    );
    reserve.position = restingPositionAt(reserve.position, reserve);
    snapshot.table.pieces.push(placed);
  }
}

/* Public state after each faction kept its private Traitors and placed its starting forces. */
export function preparedSnapshot(viewerSeat = 'seat-2'): GameSnapshot {
  const snapshot = setupSnapshot(viewerSeat);
  const leaders = factions.flatMap((faction) =>
    faction.data.leaders.map((leader, index) => ({ faction, leader, index }))
  );
  const keptCounts = [1, 4, 1, 1, 1, 1];
  const viewer = factions.findIndex((_faction, index) => `seat-${index + 1}` === viewerSeat);
  if (viewer >= 0) {
    const offset = keptCounts.slice(0, viewer).reduce((sum, count) => sum + count, 0);
    const selected = leaders.slice(offset, offset + keptCounts[viewer]!);
    snapshot.hand!.push(
      ...selected.map(({ faction, leader, index }, selectedIndex) =>
        piece(
          `kept-traitor-${selectedIndex}`,
          leader.name,
          factions[viewer]!.slug,
          factions[viewer]!.data.themeColor,
          'card',
          [
            {
              id: `private-traitor-${selectedIndex}`,
              faceUp: true,
              artwork: {
                front: imageHref(`/play-fixtures/product/${faction.slug}-traitor-${index}.jpg`),
                back: imageHref('/play-fixtures/product/traitor-back.jpg'),
                name: leader.name,
                type: 'card-traitor',
              },
            },
          ],
          [-25, 0, -25],
          'cards:traitor'
        )
      )
    );
  }
  const decks = snapshot.table.pieces.filter((entry) => entry.kind === 'card');
  const remaining = {
    ...decks[0]!,
    id: 'remaining-traitors',
    label: 'Unchosen Traitors',
    orientation: 0,
    items: decks.flatMap((entry) => entry.items).slice(keptCounts.reduce((sum, count) => sum + count, 0)),
  };
  remaining.position = restingPositionAt([0, 0, 7.5], remaining);
  snapshot.table.pieces = [...snapshot.table.pieces.filter((entry) => entry.kind !== 'card'), remaining];
  placeStartingForces(snapshot);
  snapshot.setup!.index = 1;
  snapshot.setup!.mapRevealed = true;
  snapshot.setup!.completed = ['traitors'];
  snapshot.controls!.ready = SIX.map((player) => player.seat);
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

export function playingSnapshot(viewerSeat = 'seat-2'): GameSnapshot {
  const snapshot = preparedSnapshot(viewerSeat);
  snapshot.controls!.ready = [];
  delete snapshot.setup;
  delete snapshot.swapping;
  snapshot.stage = 'play';
  snapshot.phase = 0;
  snapshot.table.pieces = snapshot.table.pieces.filter((entry) => entry.kind !== 'card');
  /* The table is arranged for a mid-game page scenario, not a recording of a production game. */
  const cards = [
    'supplies',
    'shield',
    'shield',
    'shield',
    'shield',
    'shield',
    'snooper',
    'snooper',
    'snooper',
    'snooper',
  ];
  snapshot.table.pieces.push(
    piece(
      'treachery-deck',
      'Treachery deck',
      'shared',
      '#ad8a45',
      'card',
      cards.map((_name, index) => ({
        id: `treachery-${index}`,
        faceUp: false,
        artwork: { back: cardBack(), type: 'card-treachery' },
      })),
      [6.3, 0, 0],
      'cards:treachery'
    ),
    piece(
      'treachery-card-loose',
      'Snooper',
      'shared',
      '#ad8a45',
      'card',
      [
        {
          id: 'treachery-loose',
          faceUp: true,
          artwork: {
            front: imageHref('/play-fixtures/dreamrules/snooper.jpg'),
            back: cardBack(),
            name: 'Snooper',
            type: 'card-treachery',
          },
        },
      ],
      [4, 0, 1],
      'cards:treachery'
    )
  );
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

/** The scripted transport a game story installs: the viewer Seat's view of the playing fixture, or of the given snapshot, with the Spectator's private state removed. */
export function productTransport(
  viewerSeat: Viewer['viewerSeat'] = 'seat-2',
  snapshot?: GameSnapshot,
  options?: Parameters<typeof storyTransport>[2]
) {
  const view = snapshot ?? playingSnapshot(viewerSeat);
  if (viewerSeat === 'neutral') {
    delete view.bank;
    delete view.hand;
    delete view.battlePlan;
  }
  return storyTransport(viewerSeat, view, options);
}
