import { toStoredHeroKey } from '@shared/factions/schema';
import { publicFaction } from '@shared/play/capture';
import type { FactionCapture } from '@shared/play/capture';
import { normalizePlayGameSlug } from '@shared/play/gameNames';
import type { TablePiece } from '@shared/play/model';
import type { GameSnapshot, Viewer } from '@shared/play/protocol';
import { rosterFactionNames } from '@shared/play/protocol';
import type { SupplyDependencies } from '@shared/play/setupSupply';
import { factionSupply, item, piece, place } from '@shared/play/setupSupply';
import { cardBaySlotPositions, SHARED_ITEM_PLACEMENT_ANCHORS } from '@shared/play/tableFurnitureLayout';
import { BOARD_RADIUS, restingPositionAt } from '@shared/play/tableGeometry';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { labelForCount } from '@shared/play/tableState';
import { ARRAKIS_OFFICIAL as board } from '@shared/rulebooks/fixtures/arrakisOfficial';

import type { StorybookDatabase } from '@db/storybook';
import { db, ref, STORYBOOK_NOW, storybookViewer } from '@db/storybook';

import { draftingSnapshot, factions, storyPlayer } from './drafting.stories.fixture';
import dreamrulesDecks from '@shared/play/fixtures/dreamrulesDecks.json';
import ruleset from './product.stories.fixture/ruleset.json';
import { storyTransport } from './storyTransport';

export { factions };
export const SIX = ['central', 'krell', 'jaded-af', 'eichmal', 'ridwan', 'tautrimas'].map((slug, index) =>
  storyPlayer(`seat-${index + 1}`, slug)
);
export const GAME_KEY = 'game:real';
const RULESET_KEY = 'ruleset:classicrules';
const imageHref = (path: string) => new URL(path, location.origin).href;
const dreamrulesFace = (file: string) => imageHref(`/play-fixtures/dreamrules/${file}`);
/** The published Dreamrules Treachery back. */
export const cardBack = () => dreamrulesFace(dreamrulesDecks.treachery.back.file);
/** The published Dreamrules Spice back. */
export const spiceBack = () => dreamrulesFace(dreamrulesDecks.spice.back.file);

type DreamrulesDeck = 'treachery' | 'spice';
const DECK_PIECES = {
  treachery: { id: 'treachery-deck', name: 'Treachery', color: '#ad8a45', back: cardBack },
  spice: { id: 'spice-deck', name: 'Spice', color: '#c47a2c', back: spiceBack },
} satisfies Record<DreamrulesDeck, { id: string; name: string; color: string; back: () => string }>;

/** A Dreamrules card face up, with its published front, by its printed name. */
export function dreamrulesCard(deck: DreamrulesDeck, name: string, id: string) {
  const card = dreamrulesDecks[deck].cards.find((entry) => entry.name === name);
  if (!card) {
    throw new Error(`The Dreamrules ${deck} deck has no ${name}.`);
  }
  const { back, name: backName } = DECK_PIECES[deck];
  return item(id, card.name, dreamrulesFace(card.file), back(), `card-${deck}`, true, backName);
}

/* How many cards the published Dreamrules deck holds, counting every copy. */
const deckSize = (deck: DreamrulesDeck) => dreamrulesDecks[deck].cards.reduce((sum, card) => sum + card.count, 0);

/**
 * A Dreamrules deck lying face down in its card bay, as setup lays it: Treachery in the left bay, Spice in the right.
 * Every card reaches a viewer as its back alone, so taking cards off it changes only its height.
 * Once cards have left it, the stack takes the name its back gives it, as a split names it.
 * A full deck keeps the published deck's own name.
 */
export function dreamrulesDeck(
  deck: DreamrulesDeck,
  taken = 0,
  factionNames: Parameters<typeof labelForCount>[2] = {}
) {
  const { id, name, color, back } = DECK_PIECES[deck];
  const count = deckSize(deck) - taken;
  const stack = {
    /* A catalogue deck, keyed by its asset as the Worker spawns it. */
    ...piece(id, dreamrulesDecks[deck].name, 'shared', color, 'card', `deck:${id}`),
    items: Array.from({ length: count }, (_, index) => ({
      id: `${deck}-${index}`,
      faceUp: false,
      artwork: { back: back(), backName: name },
    })),
  };
  return place(
    taken ? { ...stack, label: labelForCount(stack, count, factionNames) } : stack,
    cardBaySlotPositions(deck === 'treachery' ? 'left' : 'right')[0]!
  );
}

/**
 * A discard pile beside its deck: the given Dreamrules cards face up, the last on top.
 * The Treachery discard lies beside its deck in the left bay, the Spice discard below its deck in the right bay.
 */
export function dreamrulesDiscard(
  deck: DreamrulesDeck,
  id: string,
  names: string[],
  factionNames: Parameters<typeof labelForCount>[2] = {}
) {
  const stack = {
    ...piece(id, '', 'shared', DECK_PIECES[deck].color, 'card', `deck:${DECK_PIECES[deck].id}`),
    items: names.map((name, index) => dreamrulesCard(deck, name, `${id}-${index}`)),
  };
  return place(
    { ...stack, label: labelForCount(stack, names.length, factionNames, true) },
    cardBaySlotPositions(deck === 'treachery' ? 'left' : 'right')[1]!
  );
}

/* A troop face as the room shows it to every seat: its battle values stay out, as `supplyInventory` in the game Worker leaves them. */
function troopArtwork<Face extends { capable?: boolean; combat?: unknown }>(face: Face) {
  const { capable: _capable, combat: _battleValues, ...artwork } = face;
  return artwork;
}

/* Replace the mechanical seed's visible content while retaining its isolated identities. */
export function productDatabase(baseline: StorybookDatabase) {
  const viewer = SIX[1]!;
  baseline.users[0]!.name = viewer.name;
  Object.assign(baseline.profiles[0]!, { username: viewer.name, slug: 'krell', avatar_url: viewer.avatar });
  Object.assign(baseline.rulesets[0]!, { name: ruleset.name, slug: ruleset.slug, about: ruleset.about });
  baseline.factions[0]!.data = factions[0]!.data;
  baseline.factions[0]!.slug = factions[0]!.slug;
}

type ProductGame = {
  state: 'pending' | 'ready' | 'expired';
  reason?: string;
  minimumPlayers?: TableSeatCount;
  name?: string;
};

/** The real game's rows over the product database: the viewer's session and the game itself, in the given state. */
export function productGameDatabase(baseline: StorybookDatabase, game: ProductGame) {
  const { state, reason, minimumPlayers = 6, name = ruleset.name } = game;
  productDatabase(baseline);
  baseline.authSessions.push({
    $key: 'game-session',
    userId: ref(storybookViewer.subjectKey),
    expirationTime: 4_102_444_800_000,
  });
  baseline.authRefreshTokens.push({ sessionId: ref('game-session'), expirationTime: 4_102_444_800_000 });
  baseline.play_games.push({
    $key: GAME_KEY,
    name,
    slug: normalizePlayGameSlug(name),
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
}

export const parameters = (
  state: ProductGame['state'],
  reason?: string,
  minimumPlayers: TableSeatCount = 6,
  name = ruleset.name
) => ({
  identity: { ...storybookViewer, sessionKey: 'game-session' },
  database: db((baseline) => productGameDatabase(baseline, { state, reason, minimumPlayers, name })),
});

export function swappingSnapshot(): GameSnapshot {
  const { draft: _draft, ...snapshot } = draftingSnapshot(SIX, 6);
  return {
    ...snapshot,
    stage: 'swapping',
    factionArtwork: Object.fromEntries(
      factions.map(({ slug, data }) => [
        slug,
        {
          background: data.background,
          emblem: data.emblem,
          troops: data.troops.map(({ back, ...front }) => ({
            ...troopArtwork(front),
            ...(back ? { back: troopArtwork(back) } : {}),
          })),
        },
      ])
    ),
    swapping: {
      round: 'story-round',
      deadline: STORYBOOK_NOW + 240_000,
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

/* A faction as the Worker retains it at public assignment, less its Extras, with the published faces the README names. */
/** A story faction's captured sheet with its art, as the room captures it at setup. */
export function capture({ slug, data, token, leaders }: (typeof factions)[number]): FactionCapture {
  const face = (name: string) => imageHref(`/play-fixtures/product/${slug}-${name}.jpg`);
  return {
    faction: { id: slug, slug, name: data.name },
    capturedAt: 0,
    definition: toStoredHeroKey(data),
    components: {
      token: { front: imageHref(token), back: face('token-back') },
      leaders: data.leaders.map((leader, index) => ({
        memberId: leader.memberId,
        name: leader.name,
        strength: leader.strength ?? null,
        front: imageHref(leaders[index]!.front),
        back: imageHref(token),
      })),
      troops: data.troops.map((troop, index) => ({
        name: troop.name,
        count: troop.count,
        front: face(`troop-${index}`),
        back: face(`troop-${index}${troop.back ? '-back' : ''}`),
      })),
      alliance: { front: face('alliance'), back: imageHref('/play-fixtures/product/alliance-back.jpg') },
      /* The published Traitor preset supplies the common back. */
      traitors: {
        back: imageHref('/play-fixtures/product/traitor-back.jpg'),
        cards: data.leaders.map((leader, index) => ({
          memberId: leader.memberId,
          name: leader.name,
          front: face(`traitor-${index}`),
        })),
      },
    },
    extras: [],
    readiness: { ready: true, problems: [] },
  };
}

/* A face-down card reaches a viewer as its back and the word printed on it under an opaque id, as `RoomProjection` projects it, so no story holds a concealed identity. */
function projected(piece: TablePiece, { id }: SupplyDependencies): TablePiece {
  return {
    ...piece,
    items: piece.items.map((entry) =>
      entry.faceUp
        ? entry
        : {
            id: id(),
            faceUp: false,
            ...(entry.artwork
              ? {
                  artwork: {
                    back: entry.artwork.back,
                    ...(entry.artwork.backName ? { backName: entry.artwork.backName } : {}),
                  },
                }
              : {}),
          }
    ),
  };
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
        title: 'Starting troops',
        instructions:
          'Place your starting troops using your faction instructions. When every player is prepared, Ready enables Next into Turn 1 Storm.',
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
  let next = 0;
  const supply: SupplyDependencies = { id: () => `supply-${next++}`, shuffle: (items) => items };
  const angles = tableSeatAngles(6);
  const supplies = factions.map((faction, index) => factionSupply(capture(faction), angles[index]!, supply));
  /* Setup supplies the ruleset's decks with the factions: the Treachery deck in the left card bay, the Spice deck in the right. */
  snapshot.table.pieces = [
    ...supplies.flatMap(({ token, reserves, traitors }) => [
      ...token,
      ...reserves,
      ...traitors.map((deck) => projected(deck, supply)),
    ]),
    dreamrulesDeck('treachery'),
    dreamrulesDeck('spice'),
  ];
  const own = snapshot.roster!.seats.findIndex((seat) => seat.id === viewerSeat);
  if (own >= 0) {
    snapshot.bank = { factionId: factions[own]!.slug, balance: factions[own]!.data.rules.spiceCount };
    snapshot.hand = supplies[own]!.hand;
  }
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

function placeStartingTroops(snapshot: GameSnapshot) {
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
    const reserve = snapshot.table.pieces.find(
      (entry) => entry.stackKey === `troops:${factions[factionIndex]!.slug}:0`
    )!;
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

/* Public state after each faction kept its private Traitors and placed its starting troops. */
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
      ...selected.map(({ faction, leader, index }, selectedIndex) => ({
        /* The Traitors were dealt, and a deal names every card it hands out "Card", whatever its face. */
        ...piece(
          `kept-traitor-${selectedIndex}`,
          'Card',
          factions[viewer]!.slug,
          factions[viewer]!.data.themeColor,
          'card',
          'cards:traitor'
        ),
        items: [
          item(
            `private-traitor-${selectedIndex}`,
            leader.name,
            imageHref(`/play-fixtures/product/${faction.slug}-traitor-${index}.jpg`),
            imageHref('/play-fixtures/product/traitor-back.jpg'),
            'card-traitor',
            true,
            'Traitor'
          ),
        ],
      }))
    );
  }
  const isTraitorDeck = (entry: TablePiece) => entry.stackKey === 'cards:traitor';
  const decks = snapshot.table.pieces.filter(isTraitorDeck);
  const items = decks.flatMap((entry) => entry.items).slice(keptCounts.reduce((sum, count) => sum + count, 0));
  /* The gather combines the six Traitor decks, which changes their cards, so the pile takes the name its back gives it. */
  const remaining = {
    ...decks[0]!,
    id: 'remaining-traitors',
    label: labelForCount(decks[0]!, items.length, rosterFactionNames(snapshot.roster)),
    orientation: 0,
    items,
  };
  remaining.position = restingPositionAt(SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position, remaining);
  snapshot.table.pieces = [...snapshot.table.pieces.filter((entry) => !isTraitorDeck(entry)), remaining];
  placeStartingTroops(snapshot);
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
  /* A finished setup stays on the game, as the Worker keeps it: every step is completed and the last one stays current. */
  const setup = snapshot.setup!;
  snapshot.setup = {
    ...setup,
    index: setup.steps.length - 1,
    visit: setup.visit + setup.steps.length,
    completed: setup.steps.map((step) => step.id),
    mapRevealed: true,
  };
  delete snapshot.swapping;
  snapshot.stage = 'play';
  snapshot.phase = 0;
  /*
   * A Dreamrules table a few turns in, laid out as a game lays it: the Treachery deck in the left card bay with a used
   * Snooper discarded beside it, and the Spice deck in the right card bay with the last Spice Blow, Broken Land, discarded below it.
   * Setup dealt seven Treachery cards (two to Harkonnen), and the gathered Traitor deck stays where setup left it.
   */
  const factionNames = rosterFactionNames(snapshot.roster);
  const decks = new Set(Object.values(DECK_PIECES).map(({ id }) => id));
  snapshot.table.pieces = snapshot.table.pieces.filter((entry) => !decks.has(entry.id));
  snapshot.table.pieces.push(
    dreamrulesDeck('treachery', 8, factionNames),
    dreamrulesDiscard('treachery', 'treachery-card-loose', ['Snooper'], factionNames),
    dreamrulesDeck('spice', 1, factionNames),
    dreamrulesDiscard('spice', 'spice-discard', ['Broken Land'], factionNames)
  );
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

/** Every story faction's captured sheet by faction id, as a real game answers Faction info's reads. */
export function capturedFactions() {
  return Object.fromEntries(factions.map((faction) => [faction.slug, publicFaction(capture(faction))]));
}

/** The scripted transport a game story installs: the viewer Seat's view of the playing fixture, or of the given snapshot, where a Spectator's view carries no Seat-private state. */
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
  return storyTransport(viewerSeat, view, { factions: capturedFactions(), ...options });
}
