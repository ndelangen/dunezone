import type { LinkProps } from '@tanstack/react-router';

export interface NavLinkItem {
  label: string;
  to: LinkProps['to'];
  /** Active only on this exact address, for a link whose path is the parent of its siblings' paths. */
  exact?: boolean;
}

export type NavSegmentId = 'play' | 'create';

export interface NavSegment {
  id: NavSegmentId;
  /** The segment's name in the switch, at widths with room for it. */
  label: string;
  /** The same name at phone widths. */
  shortLabel: string;
  /** Where the switch takes the reader. */
  to: LinkProps['to'];
  links: readonly NavLinkItem[];
}

/* The link sets are content, not structure: the row renders whatever list it is given, at any
   count and any label length, so editing these arrays is the whole job of changing the navigation. */
export const PLAY_LINKS: readonly NavLinkItem[] = [
  { label: 'Factions', to: '/factions' },
  { label: 'Rulesets', to: '/rulesets' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Profiles', to: '/profiles' },
  { label: 'Assets', to: '/assets' },
  { label: 'Blog', to: '/blog' },
];

export const CREATE_LINKS: readonly NavLinkItem[] = [
  { label: 'Start here', to: '/create', exact: true },
  { label: 'Faction tutorial', to: '/create/faction' },
  { label: 'Faction creator', to: '/factions/create' },
  { label: 'Media library', to: '/media' },
];

/**
 * The site's two halves.
 * Everything a player reads lives under Playing Dune;
 * the guides, the editors and the artwork they draw from live under Creating content.
 */
export const NAV_SEGMENTS: readonly NavSegment[] = [
  { id: 'play', label: 'Playing Dune', shortLabel: 'Play', to: '/', links: PLAY_LINKS },
  { id: 'create', label: 'Creating content', shortLabel: 'Create', to: '/create', links: CREATE_LINKS },
];

/* Roots whose own `create` and `edit` pages belong to playing: starting a game, the Play tutorial, signing in, editing your own profile. */
const PLAYING_ROOTS = new Set(['play', 'tutorial', 'auth', 'profiles', 'admin']);

/**
 * Which half of the site a path belongs to.
 * The guides and the media library are Creating content, and so is every editor: a path whose last segment is `create`, or that passes through an `edit` segment.
 * Asking an FAQ question is a reader's act, so its `create` page stays with Playing Dune.
 */
export function navSegmentFor(pathname: string): NavSegmentId {
  const segments = pathname.split('/').filter(Boolean);
  const [root] = segments;
  if (root === undefined || PLAYING_ROOTS.has(root)) {
    return 'play';
  }
  if (root === 'create' || root === 'media' || root === 'imports') {
    return 'create';
  }
  const last = segments.at(-1);
  if (last === 'create' && segments.at(-2) !== 'faq') {
    return 'create';
  }
  return segments.includes('edit') ? 'create' : 'play';
}
