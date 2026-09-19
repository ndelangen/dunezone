import preview from '@sb/preview';
import { emptySnapshot } from '@shared/play/commands';
import { emptyPublicControls } from '@shared/play/inventory';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN, storybookViewer } from '@db/storybook';

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
        expect(page.getByText(/a random 6 of them will be dealt/)).toBeVisible();
      },
      { timeout: 30_000 }
    );
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
    const accept = await page.findByRole('button', { name: 'Accept trade from House Atreides' }, { timeout: 30_000 });
    expect(page.getByRole('button', { name: 'Offer trade to Emperor' })).toBeDisabled();
    expect(page.getByRole('button', { name: 'Cancel offer to Fremen' })).toBeEnabled();
    await userEvent.click(accept);
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
