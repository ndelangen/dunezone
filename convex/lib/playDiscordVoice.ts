import { v } from 'convex/values';

export const VOICE_BATCH = 500;
export const VOICE_OBSERVATION_MAX_AGE = 30_000;
export const voiceCandidateValidator = v.object({
  channelId: v.id('play_game_discord_channels'),
  discordChannelId: v.string(),
  guildId: v.string(),
  revision: v.number(),
});
