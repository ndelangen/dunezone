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

/** For tight contexts, an avatar group, a table cell. `title` keeps the name reachable. */
export const AvatarOnly = meta.story({
  args: { avatar_url: '/web/logo.svg', showUsername: false, title: 'Central' },
});
