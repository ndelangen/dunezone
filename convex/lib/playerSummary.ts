import { PLAY_DISPLAY_NAME_MAX_LENGTH, PLAY_PROFILE_SLUG_MAX_LENGTH } from '../../src/shared/play/admission';
import type { Doc } from '../_generated/dataModel';
import { isActiveProfile } from './accountLifecycle';

/**
 * How the game Worker names and draws a Player, from their profile or its absence.
 * The name is cut to the admission cap, and an empty or missing one reads as 'Player'.
 * The avatar is the stored rendition before the legacy URL.
 * The profile slug lets the table link to the person.
 * It is null for an account that is not active, or a slug too long to carry.
 * The lobby directory keeps its own shape, because its names are unbounded and it leaves deleted accounts out.
 */
export function playerSummary(profile: Doc<'profiles'> | null) {
  return {
    displayName: profile?.username?.slice(0, PLAY_DISPLAY_NAME_MAX_LENGTH) || 'Player',
    avatarUrl: profile ? (profile.avatar?.url ?? profile.avatar_url) : null,
    profileSlug:
      profile &&
      isActiveProfile(profile) &&
      profile.slug.length > 0 &&
      profile.slug.length <= PLAY_PROFILE_SLUG_MAX_LENGTH
        ? profile.slug
        : null,
  };
}
