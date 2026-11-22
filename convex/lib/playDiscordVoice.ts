import { v } from 'convex/values';

import type { Doc } from '../_generated/dataModel';

export const VOICE_BATCH = 500;
export const VOICE_OBSERVATION_MAX_AGE = 30_000;
export const voiceCandidateValidator = v.object({
  channelId: v.id('play_game_discord_channels'),
  discordChannelId: v.string(),
  guildId: v.string(),
  revision: v.number(),
});

/** A confirmed renamed channel remains eligible until deletion is requested. */
export function canCheckDiscordVoiceChannel(channel: Doc<'play_game_discord_channels'>) {
  if (channel.state !== 'ready' || channel.deletion_requested_at !== undefined) {
    return false;
  }
  return Boolean(channel.channel_id && channel.renamed_ended);
}

/** Only opted-in, finished real games receive hourly occupancy checks. */
export function canCheckDiscordVoiceGame(game: Doc<'play_games'> | null) {
  if (game?.state !== 'ready' || game.directory?.stage !== 'finished') {
    return false;
  }
  if (game.discord_voice !== true) {
    return false;
  }
  return game.ruleset_id !== undefined && game.fixture_key === undefined;
}
