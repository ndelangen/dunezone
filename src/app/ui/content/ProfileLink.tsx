import { Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

import type { ProfileEntry } from '@db/profiles';

import { EntityLink } from './EntityLink';
import { NameDisc } from './NameDisc';

type ProfileLinkBase = {
  slug: ProfileEntry['slug'];
  /** The person's display name, the family's `name`. */
  name: ProfileEntry['username'];
  /** Their avatar, the family's `image`. Absent or null falls back to their initials. */
  image?: ProfileEntry['avatar_url'];
  className?: string;
  style?: CSSProperties;
  /** `inverse` sets the name in pure white with a drop shadow, for a link laid over header artwork. */
  tone?: 'default' | 'inverse';
  /** A row with its own hover treatment can keep contributor text undecorated. */
  underline?: 'hover' | 'never';
  /** Smaller contributor names for list bylines. */
  density?: 'default' | 'compact';
  /** Larger forum identity; the full name sits below the avatar in a wide discussion container. */
  presentation?: 'citation' | 'contributor';
};

/*
 * `title` shows in a tooltip on hover. It is required exactly when the name is hidden, because the mark beside it is decorative and
 * a link whose only content is decorative has no accessible name at all. A caller cannot reach that
 * state by forgetting something; the type will not let them.
 */
export type ProfileLinkProps = ProfileLinkBase &
  ({ showName?: true; title?: string } | { showName: false; title: string });

/**
 * A person, as a link: their avatar and name, leading to their profile.
 *
 * Content.
 * Callers hand it the profile fields;
 * this owns how a person is cited anywhere in the app: the avatar (or its initials fallback) always present, the name beside it unless the context is too tight (`showName`), the whole thing one link.
 * It exists so every mention of a contributor looks and navigates identically.
 */
export const ProfileLink = ({
  slug,
  name,
  image,
  className,
  style,
  title,
  showName = true,
  tone,
  underline,
  density,
  presentation,
}: ProfileLinkProps) => {
  const link = (
    <EntityLink
      name={name ?? ''}
      /* Decorative: the name is beside it, or `title` names the link, so announcing the picture too made a link read as "CE Central". */
      disc={<NameDisc name={name ?? ''} src={image} size="var(--entity-link-media-size)" />}
      showName={showName}
      label={title}
      tone={tone}
      underline={underline}
      density={density}
      presentation={presentation}
      className={className}
      style={style}
      renderRoot={(props) => <Link to="/profiles/$profileSlug" params={{ profileSlug: slug }} {...props} />}
    />
  );
  return title ? <Tooltip label={title}>{link}</Tooltip> : link;
};
