import { db, ref, STORYBOOK_NOW, storybookViewer } from '@db/storybook';

import { GAME_KEY, productGameDatabase } from './_app/play/product.stories.fixture';

export function adminDiscordRecoveryParameters(attention = false) {
  return {
    database: db(
      (baseline) => {
        productGameDatabase(baseline, { state: 'ready' });
        const template = baseline.play_games.find((game) => game.$key === GAME_KEY)!;
        baseline.play_games = baseline.play_games.filter((game) => game.$key !== GAME_KEY);
        const cases = [
          { name: 'Awaiting creation', state: 'pending', channel: false, finished: false },
          {
            name: 'Creation in progress',
            state: 'creating',
            channel: false,
            finished: false,
            lease: STORYBOOK_NOW + 31 * 60_000,
          },
          { name: 'Creation retry', state: 'creating', channel: false, finished: false, lease: STORYBOOK_NOW - 60_000 },
          { name: 'Finished setup', state: 'pending', channel: true, finished: true },
          { name: 'Finished rename', state: 'ready', channel: true, finished: true },
          { name: 'Finished voice', state: 'ready', channel: true, finished: true, renamed: true },
          ...(attention
            ? ([
                {
                  name: 'Rename needs attention',
                  state: 'ready',
                  channel: true,
                  finished: true,
                  operation: 'rename-ended',
                },
                {
                  name: 'Deletion needs attention',
                  state: 'deleting',
                  channel: true,
                  finished: false,
                  operation: 'delete',
                },
                {
                  name: 'Unconfirmed creation',
                  state: 'creating',
                  channel: false,
                  finished: false,
                  operation: 'provision',
                },
              ] as const)
            : []),
        ] as const;
        for (const [index, entry] of cases.entries()) {
          const gameKey = `admin-discord-game-${index}`;
          baseline.play_games.push({
            ...template,
            $key: gameKey,
            name: entry.name,
            slug: entry.name.toLowerCase().replaceAll(' ', '-'),
            discord_voice: true,
            ...(entry.finished
              ? {
                  directory: {
                    stage: 'finished',
                    seatCount: 6,
                    seats: [],
                    phase: null,
                    lastActivityAt: STORYBOOK_NOW,
                    result: null,
                  },
                }
              : {}),
          });
          baseline.play_game_discord_channels.push({
            $key: `admin-discord-channel-${index}`,
            game_id: ref(gameKey),
            creator_id: ref(storybookViewer.subjectKey),
            guild_id: '100',
            category_ids: ['200'],
            ...(entry.channel ? { channel_id: String(300 + index) } : {}),
            state: entry.state,
            ...('lease' in entry ? { lease: `story-lease-${index}`, lease_until: entry.lease } : {}),
            ...('renamed' in entry ? { renamed_ended: entry.renamed } : {}),
            ...('operation' in entry
              ? {
                  retry: {
                    kind: 'bounded' as const,
                    operation: entry.operation,
                    revision: 0,
                    attempts: 3 as const,
                    needsAttention: true,
                  },
                  error: 'Discord request failed (403).',
                }
              : {}),
            ...(entry.name === 'Creation retry' ? { error: 'Discord did not confirm channel creation.' } : {}),
            created_at: STORYBOOK_NOW,
            cleanup_at: STORYBOOK_NOW + 14 * 86_400_000,
            next_attempt_at: STORYBOOK_NOW + 31 * 60_000,
          });
        }
      },
      { discordVoice: true }
    ),
  };
}
