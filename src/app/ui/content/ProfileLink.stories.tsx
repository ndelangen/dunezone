import preview from '@sb/preview';

import { ProfileLink } from './ProfileLink';

const meta = preview.meta({
  component: ProfileLink,
  parameters: { layout: 'centered' },
  args: {
    slug: 'central',
    username: 'Central',
    avatar_url: null,
  },
});

/** Without an avatar image, the initials stand in; the shape never collapses to bare text. */
export const InitialsFallback = meta.story({});

/** The usual citation: avatar and name, one link. */
export const WithAvatar = meta.story({
  args: { avatar_url: '/web/logo.svg' },
});

/** For tight contexts: an avatar group, a table cell. `title` keeps the name reachable. */
export const AvatarOnly = meta.story({
  args: { avatar_url: '/web/logo.svg', showUsername: false, title: 'Central' },
});

/**
 * When the citation is naming the person's role in a sentence rather than just citing them.
 * `label` replaces the plain username, and it is a string: the caller owns the words, not a slot to render into.
 */
export const Labelled = meta.story({
  args: { avatar_url: '/web/logo.svg', label: 'Question by Central' },
});
