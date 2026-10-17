import type { ProfileCatalogueSort } from '../../src/shared/profiles/catalogueSearch';
import { isPublicProfile } from './accountLifecycle';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';
import type { CatalogueDirection, CatalogueSort } from './catalogueOrder';

/** A reader's sort as the aggregate orders it: names A to Z, dates newest first. */
export function profileCatalogueOrderOf(sort: ProfileCatalogueSort | undefined): {
  sort: CatalogueSort;
  direction: CatalogueDirection;
} {
  switch (sort) {
    case 'newest':
      return { sort: 'created', direction: 'desc' };
    case 'name':
    case undefined:
      return { sort: 'name', direction: 'asc' };
  }
}

/** The name a profile lists and sorts under; a profile that never chose a username goes by its slug, as its page does. */
export function profileListName(profile: { username: string | null; slug: string }) {
  return profile.username?.trim() || profile.slug;
}

/**
 * The profile kind of `catalogue_entries`: one entry per profile with its own public page, in the one `'all'` list.
 * A profile is found by its username or its slug.
 */
export const profileCatalogueKind: CatalogueKind = {
  sorts: ['name', 'created'],
  expected: async (ctx, sourceId) => {
    const profileId = ctx.db.normalizeId('profiles', sourceId);
    const profile = profileId ? await ctx.db.get('profiles', profileId) : null;
    if (!profile || !isPublicProfile(profile)) {
      return null;
    }
    const name = profileListName(profile);
    return {
      kind: 'profile',
      source_id: profile._id,
      slug: profile.slug,
      search_text: catalogueSearchText([name, profile.slug]),
      name_key: catalogueNameKey(name),
      created_at: catalogueTimestamp(profile.created_at),
      updated_at: catalogueTimestamp(profile.updated_at),
      edited_at: catalogueEditedAt(profile.created_at, profile.updated_at),
      complexity: 0,
      complexity_score: 0,
      facets: [],
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db
      .query('profiles')
      .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
      .take(limit);
    return rows.filter(isPublicProfile).map((row) => row._id);
  },
};
