import preview from '@sb/preview';
import { emptySnapshot } from '@shared/play/commands';
import { emptyPublicControls } from '@shared/play/inventory';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { hostedStoryTransport } from './hostedStoryTransport';

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

let transport: ReturnType<typeof hostedStoryTransport>;

const meta = preview.meta({
  ...pageStoryMeta,
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

/** A real game opens drafting: the ruleset names the page, the header shows the stage and no phase controls exist. */
export const Drafting = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('seat-1', {
      ...emptySnapshot(),
      roster: { seatCount: 4, seats: [{ id: 'seat-1', position: 0, faction: null }] },
    });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'ClassicRules', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The lazy table chunk suspends while it loads and again while textures load, so every read waits for the header. */
    await waitFor(
      () => {
        const header = canvasElement.ownerDocument.querySelector('.seated-header');
        expect(header).toBeInstanceOf(HTMLElement);
        expect(within(header as HTMLElement).getByText('Drafting')).toBeVisible();
        expect(within(header as HTMLElement).queryByText(/^Turn \d+$/)).toBeNull();
        expect(page.queryByRole('group', { name: 'Phase navigation' })).toBeNull();
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

/** Waits for the decision bar, which the scene can hide while the table chunk and its textures load. */
async function decisionBar(canvasElement: HTMLElement, name: string) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'ClassicRules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  let bar!: HTMLElement;
  await waitFor(
    () => {
      bar = page.getByRole('region', { name });
      expect(bar).toBeVisible();
    },
    { timeout: 30_000 }
  );
  return within(bar);
}

/** A spectator is offered a seat; asking sends the one seat command a spectator may send. */
export const SpectatorAsksForASeat = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', drafting());
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'You are watching');
    expect(bar.getByText('Take a seat in this game?')).toBeVisible();
    expect(bar.getByText(/1 player is drafting/)).toBeVisible();
    await userEvent.click(bar.getByRole('button', { name: 'Request a seat' }));
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
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Seat requested');
    expect(bar.getByText('Waiting for a player to approve you')).toBeVisible();
    await userEvent.click(bar.getByRole('button', { name: 'Withdraw' }));
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
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Seat request');
    expect(bar.getByText('Chani asks for a seat')).toBeVisible();
    expect(bar.getByText(/1 more request waits/)).toBeVisible();
    await userEvent.click(bar.getByRole('button', { name: 'Approve' }));
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
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Your seat');
    expect(bar.getByText('You hold seat 1')).toBeVisible();
    expect(bar.queryByRole('button')).toBeNull();
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Give up your seat' }));
    const leaving = await decisionBar(canvasElement, 'Leaving');
    expect(leaving.getByText('You are the last player. Leaving discards the game for good.')).toBeVisible();
    expect(transport.messages.some((message) => message.type === 'command')).toBe(false);
    await userEvent.click(leaving.getByRole('button', { name: 'Stay' }));
    await decisionBar(canvasElement, 'Your seat');
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Give up your seat' }));
    await userEvent.click((await decisionBar(canvasElement, 'Leaving')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(lastCommand()).toMatchObject({ type: 'command', action: { kind: 'seat-depart' } }));
  },
});

/** A spectator's game menu has nothing to give up. */
export const SpectatorGameMenu = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', drafting());
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    await decisionBar(canvasElement, 'You are watching');
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await expect(page.findByRole('menuitem', { name: 'Give up your seat' })).resolves.toHaveAttribute('data-disabled');
  },
});

/** A discarded game keeps its table readable and offers no seat. */
export const Discarded = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('neutral', { ...drafting(), stage: 'discarded' });
    return transport.install();
  },
  play: async ({ canvasElement }) => {
    const bar = await decisionBar(canvasElement, 'Discarded');
    expect(bar.getByText('This game was discarded')).toBeVisible();
    expect(bar.queryByRole('button')).toBeNull();
  },
});
