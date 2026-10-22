import { parseProfileActivitySearch } from '@shared/profiles/catalogueSearch';
import type { ProfileActivitySearch } from '@shared/profiles/catalogueSearch';
import { notFound, redirect } from '@tanstack/react-router';

import type { ProfileActivityArgs } from '@db/profiles';
import { publicPageHead } from '@app/routes/publicPage';
import type { ProfileActivityRoute } from '@app/widgets/profile-activity/ProfileActivityPage';

/*
 * What the profile's two paged lists share: how they read their address, load their page and name themselves.
 * The routes stay the words that differ: which list, which query, which kit list renders the rows.
 */

/**
 * The page query's arguments for an address, parsed again since the router keeps a parameter the parser dropped;
 * the one key is spelled out so the loader deps compare equal however the address was written.
 */
export function profileActivityDeps(search: ProfileActivitySearch) {
  return { page: parseProfileActivitySearch(search).page };
}

/** The pager's facts a loaded page carries, with the profile the address named or was renamed from. */
type LoadedActivityPage = { profile: { slug: string }; page: number; pageCount: number };

/**
 * One list's page for an address: not found for an unknown profile, a permanent redirect for a renamed one, and not found with where the rows end for a page past them.
 * Both routes load through this so the three answers are spelled once.
 */
export async function loadProfileActivity<T extends LoadedActivityPage>(
  load: (args: ProfileActivityArgs) => Promise<T | null>,
  to: ProfileActivityRoute,
  params: { profileSlug: string },
  deps: ReturnType<typeof profileActivityDeps>
): Promise<T> {
  const data = await load({ slug: params.profileSlug, page: deps.page });
  if (!data) {
    throw notFound();
  }
  if (data.profile.slug !== params.profileSlug) {
    throw redirect({
      to,
      params: { profileSlug: data.profile.slug },
      search: deps.page ? { page: deps.page } : {},
      replace: true,
      statusCode: 301,
    });
  }
  /* A page past the end is an address that does not exist, so it answers 404 and points at the last page. */
  if (data.page > data.pageCount) {
    throw notFound({ data: { pageCount: data.pageCount } });
  }
  return data;
}

/** The page's name in its title: whose list it is, and the page number past the first. */
export function profileActivityName(username: string | null, kind: string, page: number | undefined) {
  const name = `${kind} by ${username ?? 'Unknown'}`;
  return page ? `${name}, page ${page}` : name;
}

/** The document head of one list's page: its own address per page, under the profile in the trail. */
export function profileActivityHead({
  kind,
  noun,
  path,
  profile,
  profileSlug,
  search,
  match,
}: {
  /** The list's name in the title: "Answers", "Questions". */
  kind: string;
  /** The list's rows in the description: "answers", "questions". */
  noun: string;
  /** The last segment of the list's address: "answers", "questions". */
  path: string;
  profile: { username: string | null } | undefined;
  profileSlug: string;
  search: Record<string, unknown>;
  match: { status: string };
}) {
  const { page } = parseProfileActivitySearch(search);
  const profilePath = `/profiles/${encodeURIComponent(profileSlug)}`;
  const name = profile?.username ?? 'Unknown';
  return publicPageHead({
    name: profileActivityName(profile?.username ?? null, kind, page),
    kind: profile && 'Profile',
    pathname: page ? `${profilePath}/${path}?page=${page}` : `${profilePath}/${path}`,
    description: profile ? `The ${noun} ${name} has contributed to community FAQs on Dune Zone.` : '',
    social: { shape: 'round' },
    trail: [{ name: 'Profiles', pathname: '/profiles' }, ...(profile ? [{ name, pathname: profilePath }] : [])],
    match,
  });
}
