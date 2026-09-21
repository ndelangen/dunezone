import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { draftingSnapshot, storyPlayer } from './drafting.stories.fixture';
import {
  decisionBar,
  drafting,
  session as gameSession,
  install,
  lastCommand,
  MIDWAY,
  press,
  shows,
} from './game.stories.fixture';
import { browserGameRuntime, GameRuntimeContext } from './multiplayer/gameRuntime';
import { GAME_KEY, productTransport as hostedStoryTransport, parameters, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Play/Drafting',
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}`) },
  decorators: [
    (Story) => (
      <GameRuntimeContext value={gameSession.runtime}>
        <Story />
      </GameRuntimeContext>
    ),
  ],
});

/** A real game opens drafting: the creator alone in seat 1, three open seats on the ledger, the counts in the header. */
export const WaitingForPlayers = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-1', draftingSnapshot([storyPlayer('seat-1', 'thialfi')], 4))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
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
export const ChoosingFactions = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('seat-2', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
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
export const Observer = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() => hostedStoryTransport('neutral', draftingSnapshot(SIX, 6, MIDWAY))),
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'You are watching');
    await shows(() => bar().getByText('Take a seat in this game?'));
    const page = within(canvasElement.ownerDocument.body);
    await shows(() => page.getByRole('region', { name: 'Drafted factions' }));
    expect(page.queryByLabelText('Search factions')).toBeNull();
    expect(page.queryByRole('button', { name: /^Ready$/ })).toBeNull();
  },
});

/** Bans have left too few factions for six players: the note blocks, and nobody can be dealt. */
export const InsufficientFactionPool = meta.story({
  parameters: parameters('ready'),
  beforeEach: install(() =>
    hostedStoryTransport(
      'seat-2',
      draftingSnapshot(SIX, 6, {
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
      page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
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

/** A spectator is offered a seat; asking sends the one seat command a spectator may send. */
export const SpectatorAsksForASeat = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    gameSession.transport = hostedStoryTransport('neutral', drafting());
    gameSession.runtime = gameSession.transport.runtime;
    return () => {
      gameSession.transport.dispose();
      if (gameSession.runtime === gameSession.transport.runtime) {
        gameSession.runtime = browserGameRuntime;
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
    gameSession.transport = hostedStoryTransport(
      'neutral',
      drafting([{ id: 'seat-request-2', requesterName: 'Klyzx', seat: null, own: true }])
    );
    gameSession.runtime = gameSession.transport.runtime;
    return () => {
      gameSession.transport.dispose();
      if (gameSession.runtime === gameSession.transport.runtime) {
        gameSession.runtime = browserGameRuntime;
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
    gameSession.transport = hostedStoryTransport(
      'seat-1',
      drafting([
        { id: 'seat-request-2', requesterName: 'Klyzx', seat: null },
        { id: 'seat-request-3', requesterName: 'Erickenneth', seat: null },
      ])
    );
    gameSession.runtime = gameSession.transport.runtime;
    return () => {
      gameSession.transport.dispose();
      if (gameSession.runtime === gameSession.transport.runtime) {
        gameSession.runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Seat request');
    await shows(() => bar().getByText('Klyzx asks for a seat'));
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
    gameSession.transport = hostedStoryTransport('seat-1', drafting());
    gameSession.runtime = gameSession.transport.runtime;
    return () => {
      gameSession.transport.dispose();
      if (gameSession.runtime === gameSession.transport.runtime) {
        gameSession.runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bar = await decisionBar(canvasElement, 'Your seat');
    await shows(() => bar().getByText('You hold seat 1'));
    expect(bar().queryByRole('button', { name: 'Leave' })).toBeNull();
    const giveUp = async () => {
      await press(() => page.getByRole('button', { name: 'Game menu' }));
      await press(() => page.getByRole('menuitem', { name: 'Give up your seat' }));
    };
    await giveUp();
    const leaving = await decisionBar(canvasElement, 'Leaving');
    await shows(() => leaving().getByText('You are the last player. Leaving discards the game for good.'));
    expect(gameSession.transport.messages.some((message) => message.type === 'command')).toBe(false);
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
    gameSession.transport = hostedStoryTransport('neutral', drafting());
    gameSession.runtime = gameSession.transport.runtime;
    return () => {
      gameSession.transport.dispose();
      if (gameSession.runtime === gameSession.transport.runtime) {
        gameSession.runtime = browserGameRuntime;
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
    gameSession.transport = hostedStoryTransport('neutral', { ...drafting(), stage: 'discarded' });
    gameSession.runtime = gameSession.transport.runtime;
    return () => {
      gameSession.transport.dispose();
      if (gameSession.runtime === gameSession.transport.runtime) {
        gameSession.runtime = browserGameRuntime;
      }
    };
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Discarded');
    await shows(() => bar().getByText('This game was discarded'));
    expect(bar().queryByRole('button')).toBeNull();
  },
});
