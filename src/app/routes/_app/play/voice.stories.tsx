import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { db, ref, refText, SEED_REF_TOKEN, STORYBOOK_NOW, storybookViewer } from '@db/storybook';

import { gameMeta, install } from './game.stories.fixture';
import { GAME_KEY, playingSnapshot, productGameDatabase, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing/Voice',
  beforeEach: install(() => productTransport('seat-1', playingSnapshot('seat-1'))),
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

function voiceParameters(state: 'disabled' | 'connect' | 'member' | 'invite') {
  return {
    database: db(
      (baseline) => {
        productGameDatabase(baseline, { state: 'ready' });
        const game = baseline.play_games.find((row) => row.$key === GAME_KEY)!;
        game.directory = {
          stage: 'play',
          seatCount: 6,
          seats: [{ seat: 'seat-1', userId: refText(storybookViewer.subjectKey, SEED_REF_TOKEN), faction: null }],
          phase: 0,
          result: null,
          lastActivityAt: STORYBOOK_NOW,
        };
        baseline.play_game_discord_channels.push({
          game_id: ref(GAME_KEY),
          guild_id: '100',
          category_ids: ['200'],
          channel_id: '300',
          state: 'ready',
          created_at: STORYBOOK_NOW,
          cleanup_at: STORYBOOK_NOW + 14 * 86_400_000,
          next_attempt_at: STORYBOOK_NOW + 14 * 86_400_000,
        });
        if (state === 'member' || state === 'invite') {
          baseline.authAccounts.push({
            $key: 'voice-account',
            userId: ref(storybookViewer.subjectKey),
            provider: 'discord',
            providerAccountId: '400',
          });
          baseline.play_game_discord_grants.push({
            game_id: ref(GAME_KEY),
            user_id: ref(storybookViewer.subjectKey),
            discord_user_id: '400',
            auth_account_id: ref('voice-account'),
            desired: true,
            needs_sync: false,
            retry_at: 0,
            revision: 1,
            state: state === 'member' ? 'granted' : 'pending',
            request_id: 'previous-join',
            request_state: 'ready',
            request_kind: state === 'member' ? 'channel' : 'invite',
            request_url: state === 'member' ? 'https://discord.com/channels/100/300' : 'https://discord.gg/story-only',
          });
        }
      },
      { discordVoice: state !== 'disabled' }
    ),
  };
}

async function openVoiceMenu(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const menu = await page.findByRole('button', { name: 'Game menu' }, { timeout: 30_000 });
  menu.click();
  await waitFor(() => expect(finishTransitions(page.getByRole('menu'))).toBeVisible());
  return page;
}

export const Disabled = meta.story({
  parameters: voiceParameters('disabled'),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    await expect(page.queryByRole('menuitem', { name: /Discord|voice chat/ })).toBeNull();
  },
});

export const ConnectDiscord = meta.story({
  parameters: voiceParameters('connect'),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    await expect(page.getByRole('menuitem', { name: 'Connect Discord to join voice' })).toHaveAttribute(
      'href',
      '/profiles/krell/edit?tab=sign-in'
    );
  },
});

export const ServerMember = meta.story({
  parameters: voiceParameters('member'),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    await expect(page.getByRole('menuitem', { name: 'Join voice chat' })).toBeEnabled();
  },
});

export const ServerInvite = meta.story({
  parameters: voiceParameters('invite'),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    await expect(page.getByText('Accept the invite, then choose Join voice chat again.')).toBeVisible();
  },
});
