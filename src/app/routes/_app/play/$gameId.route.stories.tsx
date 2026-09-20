import preview from '@sb/preview';
import { emptySnapshot } from '@shared/play/commands';
import { emptyPublicControls } from '@shared/play/inventory';
import type { LogEntry } from '@shared/play/log';
import type { TablePiece } from '@shared/play/model';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN, storybookViewer } from '@db/storybook';
import leaderImage from '@game/rulebook/fixtures/asset-explainer/leader.jpg?url';

import { pageStoryMeta } from '../../storybookConfig';
import { draftingSnapshot, storyPlayer } from './drafting.stories.fixture';
import { hostedStoryTransport } from './hostedStoryTransport';
import { GameRuntimeContext, browserGameRuntime } from './multiplayer/gameRuntime';
import token5 from './swapping.stories.fixture/bene-gesserit.png?url';
import token2 from './swapping.stories.fixture/emperor.png?url';
import token4 from './swapping.stories.fixture/fremen.png?url';
import token0 from './swapping.stories.fixture/house-atreides.png?url';
import token1 from './swapping.stories.fixture/house-harkonnen.png?url';
import token3 from './swapping.stories.fixture/spacing-guild.png?url';

const GAME_KEY = 'game:real';
const RULESET_KEY = 'ruleset:classicrules';

/* An Administrator's session and one real game on the baseline ruleset, in the requested state. */
const parameters = (state: 'pending' | 'ready' | 'expired', isAdmin = true, reason?: string) => ({
  identity: { ...storybookViewer, sessionKey: 'game-session' },
  database: db((baseline) => {
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
      minimum_players: 4,
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

let runtime = browserGameRuntime;
let transport: ReturnType<typeof hostedStoryTransport>;

const meta = preview.meta({
  ...pageStoryMeta,
  decorators: [
    (Story) => (
      <GameRuntimeContext value={runtime}>
        <Story />
      </GameRuntimeContext>
    ),
  ],
  title: 'Play/Game',
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
});

export const NotForMembers = meta.story({
  parameters: parameters('ready', false),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('This game is not available', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('link', { name: 'Back to lobby' })).toHaveAttribute('href', '/play');
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const Preparing = meta.story({
  parameters: parameters('pending'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Preparing the table', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const CatalogueRefused = meta.story({
  parameters: parameters(
    'expired',
    true,
    'This ruleset is not ready: spice: Spice deck, Publish every member and back before requesting this asset.'
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('This game could not be prepared', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByText(/Publish every member and back/)).toBeVisible();
    expect(page.queryByText('Preparing the table')).toBeNull();
    expect(page.queryByRole('group', { name: 'Table view' })).toBeNull();
  },
});

export const ProvisionTimedOut = meta.story({
  parameters: parameters('expired'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('The table was not ready in time. Create the game again from the lobby.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

const install = (transportFor: () => ReturnType<typeof hostedStoryTransport>) => () => {
  transport = transportFor();
  runtime = transport.runtime;
  return () => {
    transport.dispose();
    if (runtime === transport.runtime) {
      runtime = browserGameRuntime;
    }
  };
};

/* The six real players of the accepted drafting scenario, Thialfi in seat 2 as the viewer. */
const SIX = [
  storyPlayer('seat-1', 'twaffle'),
  storyPlayer('seat-2', 'thialfi'),
  storyPlayer('seat-3', 'fectumbra'),
  storyPlayer('seat-4', 'erickenneth'),
  storyPlayer('seat-5', 'ridwan'),
  storyPlayer('seat-6', 'argelius'),
];
const MIDWAY = {
  picks: {
    'seat-1': ['house-atreides', 'spacing-guild'],
    'seat-2': ['fremen'],
    'seat-3': ['house-harkonnen', 'bene-gesserit'],
    'seat-4': ['emperor'],
    'seat-5': ['ecaz-ecaz-moritani', 'moritani-ecaz-moritani'],
    'seat-6': ['bene-tleilax'],
  },
  bans: { 'seat-1': ['ixians'] },
  ready: ['seat-1'],
};

/** The lists of the players still seated: a departing player's lists go with them, so a smaller roster keeps only its own. */
function draftOfSeated(draft: typeof MIDWAY, players: typeof SIX): Parameters<typeof draftingSnapshot>[2] {
  const seats = new Set(players.map((player) => player.seat));
  const own = (lists: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(lists).filter(([seat]) => seats.has(seat)));
  return { picks: own(draft.picks), bans: own(draft.bans), ready: draft.ready.filter((seat) => seats.has(seat)) };
}

/** A real game opens drafting: the creator alone in seat 1, three open seats on the ledger, the counts in the header. */
export const Drafting = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-1', draftingSnapshot([storyPlayer('seat-1', 'thialfi')], 4))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'ClassicRules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The table arrives with its chunk and the connection, so every read waits for the header. */
    await waitFor(
      () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(header).toBeInstanceOf(HTMLElement);
        expect(within(header as HTMLElement).getByText('Waiting for 3 more players')).toBeVisible();
        expect(page.queryByRole('group', { name: 'Phase navigation' })).toBeNull();
        expect(page.getByText('You are seated alone', { exact: false })).toBeVisible();
        expect(within(page.getByRole('region', { name: 'Players' })).getAllByTitle('Open seat')).toHaveLength(3);
      },
      { timeout: 30_000 }
    );
  },
});

/** Six real players midway: one ban strips a pick from the pool, one player is ready, and the note says a random six of nine will be dealt. */
export const DraftingMidway = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'ClassicRules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(
      () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(within(header as HTMLElement).getByText('Waiting for 5 to ready')).toBeVisible();
        expect(
          within(page.getByRole('region', { name: 'Banned factions' })).getByRole('img', {
            name: /Ixians, banned by Twaffle/,
          })
        ).toBeVisible();
        expect(within(page.getByRole('region', { name: 'Drafted factions' })).getAllByRole('img')).toHaveLength(9);
      },
      { timeout: 30_000 }
    );
    await userEvent.hover(page.getByLabelText('Draft pool details'));
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent('a random 6 of them will be dealt');
    await userEvent.unhover(page.getByLabelText('Draft pool details'));
    const list = () => within(page.getByRole('list', { name: 'Factions' }));
    await waitFor(
      async () => {
        await userEvent.click(list().getAllByRole('button', { name: /^Draft$/, pressed: false })[0]!);
      },
      { timeout: 30_000 }
    );
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'draft-pick' } }));
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'draft-ready', ready: true } })
    );
  },
});

/** A spectator sees the same ledger and the seat bar, and none of the drafting tools. */
export const DraftingSpectator = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport('neutral', draftingSnapshot(SIX.slice(0, 3), 6, draftOfSeated(MIDWAY, SIX.slice(0, 3))))
  ),
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'You are watching');
    await shows(() => bar().getByText('Take a seat in this game?'));
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('region', { name: 'Drafted factions' }));
    expect(page.queryByLabelText('Search factions')).toBeNull();
    expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

/** Bans have left too few factions for five players: the note blocks, and nobody can be dealt. */
export const DraftingPoolTooShort = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport(
      'seat-2',
      draftingSnapshot(SIX.slice(0, 5), 6, {
        picks: { 'seat-1': ['house-atreides'], 'seat-2': ['fremen'] },
        bans: {
          'seat-1': ['house-harkonnen', 'emperor', 'ixians'],
          'seat-3': ['spacing-guild', 'bene-gesserit', 'bene-tleilax'],
          'seat-4': ['iduali', 'ecaz-ecaz-moritani', 'moritani-ecaz-moritani', 'richese', 'ginaz'],
        },
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'ClassicRules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(
      () => {
        expect(page.getByRole('alert')).toHaveTextContent('Nobody can be dealt yet.');
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(within(header as HTMLElement).getByText('Not enough factions in the pool')).toBeVisible();
      },
      { timeout: 30_000 }
    );
  },
});

/* A real game while drafting: the creator holds seat 1 and the given requests wait. */
function drafting(seatRequests: NonNullable<GameSnapshot['controls']>['seatRequests'] = []): GameSnapshot {
  return {
    ...emptySnapshot(),
    roster: { seatCount: 4, seats: [{ id: 'seat-1', position: 0, faction: null }] },
    controls: { ...emptyPublicControls(), seats: ['seat-1'], seatRequests },
  };
}

/* A seated player's cursor publishes as pointer messages, so the command is the last of its kind, not the last message. */
const lastCommand = () => [...transport.messages].reverse().find((message) => message.type === 'command');

/**
 * The decision bar by its eyebrow, read fresh on every use: the panel arrives with the table chunk and the connection, so a node held from before goes stale.
 */
async function decisionBar(canvasElement: HTMLElement, name: string) {
  const page = within(canvasElement.ownerDocument.body);
  const bar = () => within(page.getByRole('region', { name }));
  await expect(
    page.findByRole('heading', { name: 'ClassicRules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await waitFor(() => expect(page.getByRole('region', { name })).toBeVisible(), { timeout: 30_000 });
  return bar;
}

/** Reads text under a fresh query until the remounting scene lets it settle. */
const shows = (read: () => HTMLElement) => waitFor(() => expect(read()).toBeVisible(), { timeout: 30_000 });

/** Clicks a control by a fresh query, retried until the click takes on a settled node. */
const press = (read: () => HTMLElement) =>
  waitFor(
    async () => {
      await userEvent.click(read());
    },
    { timeout: 30_000 }
  );

/** A spectator is offered a seat; asking sends the one seat command a spectator may send. */
export const SpectatorAsksForASeat = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', drafting());
    runtime = transport.runtime;
    return () => {
      transport.dispose();
      if (runtime === transport.runtime) {
        runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'You are watching');
    await shows(() => bar().getByText('Take a seat in this game?'));
    await shows(() => bar().getByText(/1 player is drafting/));
    await press(() => bar().getByRole('button', { name: 'Request a seat' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-request' } }));
    expect(within(canvasElement.ownerDocument.body).queryByRole('button', { name: 'Leave game' })).toBeNull();
  },
});

/** The requester sees their own request waiting and can take it back. */
export const WaitingForApproval = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport(
      'neutral',
      drafting([{ id: 'seat-request-2', requesterName: 'Storybook player', seat: null, own: true }])
    );
    runtime = transport.runtime;
    return () => {
      transport.dispose();
      if (runtime === transport.runtime) {
        runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Seat requested');
    await shows(() => bar().getByText('Waiting for a player to approve you'));
    await press(() => bar().getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-withdraw' } }));
  },
});

/** A seated player is asked to approve the next request, with the others counted. */
export const PlayerApprovesARequest = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport(
      'seat-1',
      drafting([
        { id: 'seat-request-2', requesterName: 'Chani', seat: null },
        { id: 'seat-request-3', requesterName: 'Stilgar', seat: null },
      ])
    );
    runtime = transport.runtime;
    return () => {
      transport.dispose();
      if (runtime === transport.runtime) {
        runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Seat request');
    await shows(() => bar().getByText('Chani asks for a seat'));
    await shows(() => bar().getByText(/1 more request waits/));
    await press(() => bar().getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'seat-approve', requestId: 'seat-request-2' },
      })
    );
  },
});

/** Giving up a seat starts in the game menu, is confirmed in the bar with what it costs, and only then sends. */
export const PlayerLeavesTheGame = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('seat-1', drafting());
    runtime = transport.runtime;
    return () => {
      transport.dispose();
      if (runtime === transport.runtime) {
        runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bar = await decisionBar(canvasElement, 'Your seat');
    await shows(() => bar().getByText('You hold seat 1'));
    expect(bar().queryByRole('button')).toBeNull();
    const giveUp = async () => {
      await press(() => page.getByRole('button', { name: 'Game menu' }));
      await press(() => page.getByRole('menuitem', { name: 'Give up your seat' }));
    };
    await giveUp();
    const leaving = await decisionBar(canvasElement, 'Leaving');
    await shows(() => leaving().getByText('You are the last player. Leaving discards the game for good.'));
    expect(transport.messages.some((message) => message.type === 'command')).toBe(false);
    await press(() => leaving().getByRole('button', { name: 'Stay' }));
    await decisionBar(canvasElement, 'Your seat');
    await giveUp();
    await decisionBar(canvasElement, 'Leaving');
    await press(() => leaving().getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-depart' } }));
  },
});

/** A spectator's game menu has nothing to give up. */
export const SpectatorGameMenu = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', drafting());
    runtime = transport.runtime;
    return () => {
      transport.dispose();
      if (runtime === transport.runtime) {
        runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    await decisionBar(canvasElement, 'You are watching');
    const page = within(canvasElement.ownerDocument.body);
    await press(() => page.getByRole('button', { name: 'Game menu' }));
    await waitFor(() =>
      expect(page.getByRole('menuitem', { name: 'Give up your seat' })).toHaveAttribute('data-disabled')
    );
  },
});

/** A discarded game keeps its table readable and offers no seat. */
export const Discarded = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', { ...drafting(), stage: 'discarded' });
    runtime = transport.runtime;
    return () => {
      transport.dispose();
      if (runtime === transport.runtime) {
        runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Discarded');
    await shows(() => bar().getByText('This game was discarded'));
    expect(bar().queryByRole('button')).toBeNull();
  },
});

/** Real assigned factions and retained token faces, reused across the trading states. */
function swappingSnapshot(): GameSnapshot {
  const { draft, ...snapshot } = draftingSnapshot(SIX, 6);
  return {
    ...snapshot,
    stage: 'swapping',
    swapping: {
      round: 'story-round',
      deadline: Date.now() + 240_000,
      closed: false,
      ready: [],
      offers: [],
      nextOrder: 1,
      tokens: Object.fromEntries(
        [token0, token1, token2, token3, token4, token5].map((token, index) => [`seat-${index + 1}`, token])
      ),
    },
    roster: {
      seatCount: 6,
      seats: SIX.map((player, position) => {
        const faction = draft!.factions[position]!;
        return { id: player.seat, position, faction: { id: faction.id, name: faction.name, color: faction.color } };
      }),
    },
  };
}

export const Swapping = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', swappingSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const offer = await page.findByRole('button', { name: 'Offer trade to House Atreides' }, { timeout: 30_000 });
    await userEvent.click(offer);
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        action: { kind: 'swap-offer', seat: 'seat-2', target: 'seat-1', round: 'story-round' },
      })
    );
  },
});

export const TradingOffers = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    const snapshot = swappingSnapshot();
    snapshot.swapping!.offers = [
      { id: 'offer-one', origin: 'seat-1', target: 'seat-2', order: 1 },
      { id: 'offer-two', origin: 'seat-2', target: 'seat-5', order: 2 },
    ];
    snapshot.swapping!.ready = ['seat-3'];
    snapshot.swapping!.nextOrder = 3;
    return hostedStoryTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Accept trade from House Atreides' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'fectumbra' }));
    expect(page.getByRole('button', { name: 'Offer trade to Emperor' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Ridwan' }));
    expect(page.getByRole('button', { name: 'Cancel offer to Fremen' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Twaffle' }));
    await userEvent.click(page.getByRole('button', { name: 'Accept trade from House Atreides' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ action: { kind: 'swap-accept', offerId: 'offer-one' } }));
  },
});

export const TradingEndedWithVacancy = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    const snapshot = swappingSnapshot();
    snapshot.swapping!.closed = true;
    snapshot.swapping!.deadline = 1;
    snapshot.controls!.seats = snapshot.controls!.seats.filter((seat) => seat !== 'seat-6');
    snapshot.controls!.players = snapshot.controls!.players.filter((player) => player.seat !== 'seat-6');
    return hostedStoryTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('Trading ended. Waiting for approved replacements.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: /Offer trade to/ })).toBeNull();
    expect(page.getByRole('button', { name: 'Ready to start' })).toBeDisabled();
  },
});

/** The isolated provisional capture can reach setup while troop and traitor publications remain gated in real games. */
function setupSnapshot(): GameSnapshot {
  const snapshot = swappingSnapshot();
  snapshot.stage = 'setup';
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
    instructions: snapshot.roster!.seats.map((seat) => ({
      factionId: seat.faction!.id,
      text: 'Place your starting forces according to your faction sheet.',
    })),
  };
  snapshot.predictions = {};
  snapshot.controls = { ...snapshot.controls!, ready: [] };
  snapshot.swapping!.closed = true;
  snapshot.swapping!.ready = snapshot.roster!.seats.map((seat) => seat.id);
  const angles = tableSeatAngles(6);
  const pieces: TablePiece[] = snapshot.roster!.seats.flatMap((seat) => {
    const angle = angles[seat.position]!;
    const reserve: TablePiece = {
      id: `reserve-${seat.id}`,
      label: `${seat.faction!.name} reserves`,
      owner: seat.faction!.id,
      color: seat.faction!.color,
      accent: '#ead9bb',
      kind: 'force',
      stackKey: `troops:${seat.faction!.id}:0`,
      items: Array.from({ length: 20 }, (_, index) => ({ id: `troop-${seat.id}-${index}`, faceUp: true })),
      position: [Math.cos(angle) * 5.18, 0, Math.sin(angle) * 5.18],
      orientation: 0,
      zoneId: null,
      locked: false,
    };
    const deck: TablePiece = {
      ...reserve,
      id: `traitors-${seat.id}`,
      label: 'Traitor cards',
      owner: 'shared',
      kind: 'card',
      stackKey: 'cards:traitor',
      items: Array.from({ length: 5 }, (_, index) => ({ id: `traitor-${seat.id}-${index}`, faceUp: false })),
      position: [Math.cos(angle) * 3.15, 0, Math.sin(angle) * 3.15],
      orientation: Math.PI / 2 - angle,
    };
    return [reserve, deck].map((piece) => ({ ...piece, position: restingPositionAt(piece.position, piece) }));
  });
  snapshot.table.pieces = pieces;
  snapshot.versions = Object.fromEntries(pieces.map((piece) => [piece.id, snapshot.revision]));
  const own = snapshot.roster!.seats[1]!.faction!;
  snapshot.bank = { factionId: own.id, balance: 10 };
  snapshot.hand = [
    {
      id: 'setup-leader',
      label: 'Leader',
      owner: own.id,
      color: own.color,
      accent: '#ead9bb',
      kind: 'force',
      stackKey: 'leader:setup',
      items: [
        {
          id: 'setup-leader-item',
          faceUp: true,
          artwork: {
            front: new URL(leaderImage, window.location.origin).href,
            back: new URL(token1, window.location.origin).href,
            name: 'Leader',
            type: 'token-disc',
          },
        },
      ],
      position: [-25, 0, -25],
      orientation: 0,
      zoneId: null,
      locked: false,
    },
  ];
  return snapshot;
}

export const Setup = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Gather tabletop traitors' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: /^Ready$/ }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'ready', ready: true } })
    );
    await userEvent.click(page.getByRole('button', { name: /^Spice$/ }));
    await expect(page.findByLabelText('Banked spice')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Shared inventory$/ }));
    expect(page.queryByRole('button', { name: 'Add from catalogue' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: /^Hand$/ }));
  },
});

export const SetupForces = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    const snapshot = setupSnapshot();
    const decks = snapshot.table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    const gathered = {
      ...decks[0]!,
      id: 'other-traitors',
      label: 'Traitor deck',
      orientation: 0,
      items: decks.flatMap((piece) => piece.items),
    };
    gathered.position = restingPositionAt([0, 0, 7.5], gathered);
    snapshot.table.pieces = [...snapshot.table.pieces.filter((piece) => piece.stackKey !== 'cards:traitor'), gathered];
    snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((piece) => [piece.id, snapshot.revision]));
    snapshot.setup!.index = 1;
    snapshot.setup!.mapRevealed = true;
    snapshot.setup!.completed = ['traitors'];
    snapshot.controls!.ready = snapshot.controls!.seats;
    return hostedStoryTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Next phase' }, { timeout: 30_000 })).resolves.toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Next phase' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'phase' } }));
  },
});

function predictionSnapshot(locked = false): GameSnapshot {
  const snapshot = setupSnapshot();
  const factionId = snapshot.roster!.seats[1]!.faction!.id;
  snapshot.setup!.steps.unshift({
    id: 'prediction',
    factionId,
    kind: 'prediction',
    title: 'Prediction',
    instructions: 'Choose the faction that will win and the turn of its victory.',
    symbol: '/vector/icon/traitor.svg',
  });
  if (locked) {
    snapshot.predictions = {
      prediction: {
        factionId,
        lockedAt: 1,
        revealedAt: null,
        choice: { factionId: snapshot.roster!.seats[0]!.faction!.id, turn: 6 },
      },
    };
  }
  return snapshot;
}

export const SetupPrediction = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', predictionSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Lock prediction' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeDisabled();
    expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

export const SetupPredictionLocked = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', predictionSnapshot(true))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Reveal prediction' }, { timeout: 30_000 })).resolves.toBeEnabled();
    expect(page.getByRole('button', { name: 'Next phase' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Reveal prediction' }));
    await waitFor(() =>
      expect(lastCommand()).toMatchObject({
        type: 'command',
        action: { kind: 'prediction-reveal', stepId: 'prediction' },
      })
    );
  },
});

function removalSnapshot() {
  const snapshot = setupSnapshot();
  const players = snapshot.controls!.players;
  snapshot.removalVotes = [
    {
      id: 'removal-12',
      target: { name: players[0].name, seat: players[0].seat },
      openedAt: Date.now() - 125_000,
      threshold: 4,
      ballots: players.slice(1).map((player, index) => ({
        name: player.name,
        seat: player.seat,
        choice: index === 0 ? ('remove' as const) : null,
      })),
    },
  ];
  return snapshot;
}

export const RemovalVoting = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'View vote about Twaffle' }));
    expect(page.getByRole('button', { name: 'Twaffle, removal vote in progress' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Withdraw' }));
    expect(lastCommand()).toMatchObject({ action: { kind: 'removal-ballot', voteId: 'removal-12', choice: null } });
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    expect(lastCommand()).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
  },
});

/* The log a game at its prediction step has written, newest first, as the table answers a page read: House Harkonnen holds seat 2 and predicts, Twaffle holds House Atreides in seat 1 and Ridwan holds Fremen in seat 5. */
const GAME_LOG: LogEntry[] = [
  {
    sequence: 5,
    class: 'spice',
    text: 'Ridwan collected 3 spice from the table into the Fremen bank.',
    context: 'Setup, Prediction',
    at: 5,
  },
  {
    sequence: 4,
    class: 'spice',
    text: 'Twaffle withdrew 4 spice from the House Atreides bank to the table.',
    context: 'Setup, Prediction',
    at: 4,
  },
  {
    sequence: 3,
    class: 'prediction',
    text: 'House Harkonnen revealed its prediction: House Atreides, turn 6.',
    context: 'Setup, Prediction',
    at: 3,
  },
  {
    sequence: 2,
    class: 'prediction',
    text: 'House Harkonnen locked its prediction.',
    context: 'Setup, Prediction',
    at: 2,
  },
];
/* Seat 6 changed hands during swapping: its first occupant's account was deleted, then Argelius took the vacancy. */
const AUDIT_LOG: LogEntry[] = [
  {
    sequence: 8,
    class: 'vote',
    text: 'Twaffle keeps seat 1: Thialfi voted remove; Fectumbra and Erickenneth voted keep; Ridwan and Argelius did not vote.',
    context: 'Setup, Traitor selection',
    at: 8,
  },
  { sequence: 7, class: 'seat', text: 'Argelius took seat 6, approved by Twaffle.', context: 'Swapping', at: 7 },
  {
    sequence: 6,
    class: 'seat',
    text: '[deleted user] left seat 6 when the account was deleted.',
    context: 'Swapping',
    at: 6,
  },
  { sequence: 1, class: 'seat', text: 'Twaffle created the game and took seat 1.', context: 'Drafting', at: 1 },
];

type LogRead = Extract<ClientMessage, { type: 'log-history' }>;
const gameLogReads = (messages: ClientMessage[]) =>
  messages.filter((message): message is LogRead => message.type === 'log-history' && message.tab === 'game');

/* The prediction step with its prediction locked and revealed, which is the state the Game log above describes. */
function revealedPredictionSnapshot(): GameSnapshot {
  const snapshot = predictionSnapshot(true);
  snapshot.predictions!.prediction!.revealedAt = 2;
  return snapshot;
}

export const LogGame = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport('seat-2', revealedPredictionSnapshot(), { logEntries: { game: GAME_LOG } })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Log' }));
    const log = await page.findByRole('region', { name: 'Game log' });
    await expect(within(log).findByText('House Harkonnen locked its prediction.')).resolves.toBeVisible();
    expect(
      within(log)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'SpiceRidwan collected 3 spice from the table into the Fremen bank.Setup, Prediction',
      'SpiceTwaffle withdrew 4 spice from the House Atreides bank to the table.Setup, Prediction',
      'PredictionHouse Harkonnen revealed its prediction: House Atreides, turn 6.Setup, Prediction',
      'PredictionHouse Harkonnen locked its prediction.Setup, Prediction',
    ]);
    expect(within(log).queryByRole('button', { name: 'Earlier entries' })).toBeNull();
  },
});

export const LogAudit = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    const snapshot = setupSnapshot();
    snapshot.removalVotes = [];
    return hostedStoryTransport('seat-2', snapshot, { logEntries: { audit: AUDIT_LOG } });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Log' }));
    await userEvent.click(await page.findByRole('button', { name: 'Audit' }));
    const log = await page.findByRole('region', { name: 'Audit log' });
    await expect(within(log).findByText(/Twaffle keeps seat 1/)).resolves.toBeVisible();
    expect(within(log).getByText('[deleted user] left seat 6 when the account was deleted.')).toBeVisible();
    expect(page.queryByRole('button', { name: 'View vote about Twaffle' })).toBeNull();
  },
});

export const LogPagination = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', revealedPredictionSnapshot(), { holdLogHistory: true })),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Log' }));
    await waitFor(() => expect(gameLogReads(transport.messages).length).toBeGreaterThan(0));
    const latest = GAME_LOG[0]!;
    const older: LogEntry = {
      sequence: 1,
      class: 'phase',
      text: 'Trading ended and setup began.',
      context: 'Swapping',
      at: 1,
    };
    transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
      entries: [latest],
      more: true,
    });
    await userEvent.click(await page.findByRole('button', { name: 'Earlier entries' }));
    const messagesBeforeUpdate = transport.messages.length;
    const updated = revealedPredictionSnapshot();
    updated.revision += 1;
    transport.deliver(transport.view(updated));
    await waitFor(() => {
      const later = gameLogReads(transport.messages.slice(messagesBeforeUpdate));
      expect(later.length).toBeGreaterThan(0);
      expect(later.every((message) => message.before === latest.sequence)).toBe(true);
    });
    transport.deliver({ type: 'log-history', tab: 'game', before: latest.sequence, entries: [older], more: false });
    await expect(page.findByText('Trading ended and setup began.')).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Latest entries' }));
    expect(gameLogReads(transport.messages).at(-1)).toEqual({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
    });
    transport.deliver({
      type: 'log-history',
      tab: 'game',
      before: Number.MAX_SAFE_INTEGER,
      entries: [latest],
      more: true,
    });
    await expect(page.findByText(latest.text)).resolves.toBeVisible();
    expect(page.queryByText('Trading ended and setup began.')).toBeNull();
  },
});

export const RemovalResolution = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => {
    return hostedStoryTransport('seat-2', removalSnapshot(), {
      logEntries: {
        audit: [
          {
            sequence: 1,
            class: 'vote',
            text: 'Twaffle keeps seat 1: Thialfi and Fectumbra voted keep; Erickenneth, Ridwan and Argelius did not vote.',
            context: 'Setup, Traitor selection',
            at: 1,
          },
        ],
      },
    });
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'View vote about Twaffle' }));
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    const command = lastCommand();
    expect(command).toMatchObject({ action: { kind: 'removal-ballot', choice: 'keep' } });
    const resolved = setupSnapshot();
    resolved.removalVotes = [];
    resolved.revision += 1;
    transport.deliver(transport.view(resolved, command!.commandId));
    await waitFor(() => expect(page.queryByRole('button', { name: 'View vote about Twaffle' })).toBeNull());
    expect(page.queryByRole('heading', { name: 'Remove Twaffle?' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Twaffle, removal vote in progress' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Log' }));
    await userEvent.click(await page.findByRole('button', { name: 'Audit' }));
    await expect(page.findByText(/Twaffle keeps seat 1/)).resolves.toBeVisible();
  },
});

export const RemovalRejected = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', removalSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'View vote about Twaffle' }));
    await userEvent.click(page.getByRole('button', { name: 'Keep' }));
    transport.deliver({
      type: 'rejected',
      requestId: lastCommand()!.commandId,
      message: 'The vote changed. Try again.',
    });
    const publicState = within(canvasElement.ownerDocument.getElementById('player-public-state')!);
    await expect(publicState.findByText('The vote changed. Try again.')).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-pressed', 'true');
  },
});

const conversationPair = () => {
  const seats = setupSnapshot().roster!.seats;
  return { factionId: seats[1]!.faction!.id, peerId: seats[0]!.faction!.id };
};
const conversationMessages = () =>
  Array.from({ length: 55 }, (_, index) => ({
    sequence: index + 1,
    requestId: `saved-${index}`,
    senderFactionId: conversationPair().peerId,
    author: 'Twaffle',
    text: index === 54 ? 'Shall we keep the southern route open?' : `Earlier plan ${index + 1}`,
    savedAt: 1_800_000_000_000 + index * 60_000,
  }));

export const ConversationHistory = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport('seat-2', setupSnapshot(), { conversationMessages: conversationMessages() })
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Twaffle' });
    page.getByRole('separator', { name: 'Resize controls panel' }).focus();
    await userEvent.keyboard('{End}');
    await userEvent.click(page.getByRole('button', { name: 'Info' }));
    const { factionId, peerId } = conversationPair();
    transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 55, unread: 55 }],
    });
    await expect(page.findByRole('button', { name: 'Twaffle, 55 unread' })).resolves.toBeVisible();
    expect(transport.messages.some((entry) => entry.type === 'conversation-read')).toBe(false);
    await userEvent.click(page.getByRole('button', { name: 'Conversation' }));
    await page.findByText('Shall we keep the southern route open?');
    const loadedHistory = page.getByRole('region', { name: 'Conversation history' });
    await waitFor(() =>
      expect(loadedHistory.scrollHeight - loadedHistory.scrollTop - loadedHistory.clientHeight).toBeLessThan(8)
    );
    await waitFor(() =>
      expect(transport.messages.some((entry) => entry.type === 'conversation-read' && entry.through === 55)).toBe(true)
    );
    transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 55, unread: 0 }],
    });
    await userEvent.click(page.getByRole('button', { name: 'Earlier messages' }));
    await expect(page.findByText('Earlier plan 1')).resolves.toBeInTheDocument();
    page.getByText('Earlier plan 1').scrollIntoView({ block: 'center' });
    const history = page.getByRole('region', { name: 'Conversation history' });
    const readingPosition = history.scrollTop;
    const composerTop = page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top;
    transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        ...conversationMessages()[0]!,
        sequence: 56,
        requestId: 'new-arrival',
        text: 'A new message while you read older plans.',
      },
    });
    transport.deliver({
      type: 'conversations',
      factionId,
      generation: 0,
      entries: [{ peerId, latest: 56, unread: 1 }],
    });
    await expect(page.findByRole('button', { name: 'Twaffle, 1 unread' })).resolves.toBeVisible();
    expect(transport.messages.some((entry) => entry.type === 'conversation-read' && entry.through === 56)).toBe(false);
    expect(Math.abs(history.scrollTop - readingPosition)).toBeLessThan(2);
    expect(page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top).toBe(composerTop);
    history.scrollTop = history.scrollHeight;
    history.dispatchEvent(new Event('scroll'));
    transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        ...conversationMessages()[0]!,
        sequence: 57,
        requestId: 'following-arrival',
        text: 'Follow this new message at the bottom.',
      },
    });
    await page.findByText('Follow this new message at the bottom.');
    await waitFor(() => expect(history.scrollHeight - history.scrollTop - history.clientHeight).toBeLessThan(8));
    expect(page.getByRole('textbox', { name: 'Message' }).getBoundingClientRect().top).toBe(composerTop);

    await userEvent.click(page.getByRole('button', { name: 'Info' }));
    expect(page.queryByRole('textbox', { name: 'Message' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'fectumbra' }));
    await expect(page.findByRole('textbox', { name: 'Message' })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Thialfi' }));
    expect(page.queryByRole('button', { name: 'Conversation' })).toBeNull();
  },
});

export const ConversationDelivery = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Message' });
    await userEvent.type(page.getByRole('textbox', { name: 'Message' }), 'I can keep the southern route open.');
    await userEvent.click(page.getByRole('button', { name: /^Send$/ }));
    await expect(page.findByText('Pending', { exact: true })).resolves.toBeVisible();
    const sent = [...transport.messages].reverse().find((entry) => entry.type === 'conversation-send')!;
    transport.deliver({ type: 'rejected', requestId: sent.requestId, message: 'The message could not be saved.' });
    await expect(page.findByText('Failed', { exact: true })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Retry$/ }));
    expect([...transport.messages].reverse().find((entry) => entry.type === 'conversation-send')).toEqual(sent);
    const { factionId, peerId } = conversationPair();
    transport.deliver({
      type: 'conversation-message',
      factionId,
      peerId,
      message: {
        sequence: 1,
        requestId: sent.requestId,
        senderFactionId: factionId,
        author: 'Thialfi',
        text: sent.text,
        savedAt: Date.now() - 120_000,
      },
    });
    await expect(page.findByText('Sent', { exact: true })).resolves.toBeVisible();
    expect(page.getAllByText('I can keep the southern route open.')).toHaveLength(1);
    expect(page.getByText('2 minutes ago')).toBeVisible();
  },
});

export const ConversationOffline = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', setupSnapshot())),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Conversation' });
    transport.deliver({ type: 'admission', status: 'suspended' });
    await expect(page.findByRole('combobox', { name: 'Faction conversation' })).resolves.toBeVisible();
    await userEvent.type(page.getByRole('textbox', { name: 'Message' }), 'Send once I reconnect.');
    await userEvent.click(page.getByRole('button', { name: /^Send$/ }));
    await expect(page.findByText('Pending', { exact: true })).resolves.toBeVisible();
    expect(transport.messages.filter((entry) => entry.type === 'conversation-send')).toHaveLength(0);
  },
});
