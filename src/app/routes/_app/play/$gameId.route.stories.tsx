import preview from '@sb/preview';
import { emptySnapshot } from '@shared/play/commands';
import { expect, waitFor, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN, storybookViewer } from '@db/storybook';

import { pageStoryMeta } from '../../storybookConfig';
import { hostedStoryTransport } from './hostedStoryTransport';
import { GameRuntimeContext, browserGameRuntime } from './multiplayer/gameRuntime';

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
  decorators: [
    (Story) => (
      <GameRuntimeContext value={transport?.runtime ?? browserGameRuntime}>
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

/** A real game opens drafting: the ruleset names the page, the header shows the stage and no phase controls exist. */
export const Drafting = meta.story({
  parameters: parameters('ready'),
  beforeEach: () => {
    transport = hostedStoryTransport('seat-1', {
      ...emptySnapshot(),
      roster: { seatCount: 4, seats: [{ id: 'seat-1', position: 0, faction: null }] },
    });
    return transport.dispose;
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
