import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { db, ref, STORYBOOK_NOW } from '@db/storybook';

import { GAME_KEY, productGameDatabase } from './product.stories.fixture';

export const VOICE_INVITE = 'https://discord.gg/story-only';

export function voiceParameters(enabled = true, withNudgeFailure = false, finished = false) {
  return {
    database: db(
      (baseline) => {
        productGameDatabase(baseline, { state: 'ready' });
        baseline.play_games.find((game) => game.$key === GAME_KEY)!.discord_voice = true;
        if (finished) {
          baseline.play_games.find((game) => game.$key === GAME_KEY)!.directory = {
            stage: 'finished',
            seatCount: 6,
            seats: [],
            phase: null,
            lastActivityAt: STORYBOOK_NOW,
            result: null,
          };
        }
        if (withNudgeFailure) {
          baseline.play_game_discord_nudges.push({
            game_id: ref(GAME_KEY),
            to_seat: 'seat-2',
            nudge_id: 'story-nudge',
            from_faction_name: 'Atreides',
            at: STORYBOOK_NOW,
            state: 'failed',
            attempts: 1,
            error: 'Discord request failed (403).',
          });
        }
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
