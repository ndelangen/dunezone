import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { db, ref, STORYBOOK_NOW } from '@db/storybook';

import { GAME_KEY, productGameDatabase } from './product.stories.fixture';

export const VOICE_INVITE = 'https://discord.gg/story-only';

export function voiceParameters(enabled = true) {
  return {
    database: db(
      (baseline) => {
        productGameDatabase(baseline, { state: 'ready' });
        baseline.play_games.find((game) => game.$key === GAME_KEY)!.discord_voice = true;
        baseline.play_game_discord_channels.push({
          game_id: ref(GAME_KEY),
          guild_id: '100',
          category_ids: ['200'],
          channel_id: '300',
          invite_url: VOICE_INVITE,
          state: 'ready',
          created_at: STORYBOOK_NOW,
          cleanup_at: STORYBOOK_NOW + 14 * 86_400_000,
          next_attempt_at: STORYBOOK_NOW + 14 * 86_400_000,
        });
      },
      { discordVoice: enabled }
    ),
  };
}

export async function openVoiceMenu(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const menu = await page.findByRole('button', { name: 'Game menu' }, { timeout: 30_000 });
  menu.click();
  await waitFor(() => expect(finishTransitions(page.getByRole('menu'))).toBeVisible());
  return page;
}
