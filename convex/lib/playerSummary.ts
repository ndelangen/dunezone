import { PLAY_DISPLAY_NAME_MAX_LENGTH } from '../../src/shared/play/admission';
import type { Doc } from '../_generated/dataModel';

/**
 * How the game Worker names and draws a Player, from their profile or its absence.
 * The name is cut to the admission cap, and an empty or missing one reads as 'Player'.
 * The avatar is the stored rendition before the legacy URL.
 * The lobby directory keeps its own shape, because its names are unbounded and it leaves deleted accounts out.
 */
export function playerSummary(profile: Doc<'profiles'> | null) {
  return {
    displayName: profile?.username?.slice(0, PLAY_DISPLAY_NAME_MAX_LENGTH) || 'Player',
    avatarUrl: profile ? (profile.avatar?.url ?? profile.avatar_url) : null,
  };
}
