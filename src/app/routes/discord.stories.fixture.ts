import { db, ref, STORYBOOK_NOW } from '@db/storybook';

import { GAME_KEY, productGameDatabase } from './_app/play/product.stories.fixture';

export const VOICE_INVITE = 'https://discord.gg/story-only';

export function voiceParameters(enabled = true, finished = false) {
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
        baseline.play_game_discord_channels.push({
          game_id: ref(GAME_KEY),
          guild_id: '100',
          category_ids: ['200'],
          channel_id: '300',
          invite_url: VOICE_INVITE,
          state: 'ready',
          ...(finished ? { renamed_ended: true } : {}),
          created_at: STORYBOOK_NOW,
          cleanup_at: STORYBOOK_NOW + 14 * 86_400_000,
          next_attempt_at: STORYBOOK_NOW + 14 * 86_400_000,
        });
      },
      { discordVoice: enabled }
    ),
  };
}
