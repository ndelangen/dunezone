import { loadProfileLink } from '@db/profiles';

/**
 * Each linked author's avatar, by profile slug, so a byline shows the same picture as everywhere else the person is cited.
 * A lookup that fails leaves that author on their initials: a post must not go down because a profile read did.
 */
export async function loadAuthorImages(profileSlugs: readonly (string | undefined)[]): Promise<Record<string, string>> {
  const slugs = [...new Set(profileSlugs.filter((slug): slug is string => Boolean(slug)))];
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      const profile = await loadProfileLink(slug).catch(() => null);
      return profile?.image ? [[slug, profile.image] as const] : [];
    })
  );
  return Object.fromEntries(entries.flat());
}
