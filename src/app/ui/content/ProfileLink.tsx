import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import type { ProfileEntry } from '@db/profiles';

import styles from './ProfileLink.module.css';

export type ProfileLinkProps = {
  slug: ProfileEntry['slug'];
  /** The person's display name, the family's `name`. */
  name: ProfileEntry['username'];
  /** Their avatar, the family's `image`. Absent or null falls back to their initials. */
  image?: ProfileEntry['avatar_url'];
  className?: string;
  style?: CSSProperties;
  title?: string;
  showName?: boolean;
};

/**
 * A person, as a link: their avatar and name, leading to their profile.
 *
 * Content.
 * Callers hand it the profile fields;
 * this owns how a person is cited anywhere in the app: the avatar (or its initials fallback) always present, the name beside it unless the context is too tight (`showName`), the whole thing one link.
 * It exists so every mention of a contributor looks and navigates identically.
 */
export const ProfileLink = ({ slug, name, image, className, style, title, showName = true }: ProfileLinkProps) => {
  const afterAvatar = showName ? <span className={styles.username}>{name}</span> : null;

  return (
    <Link
      to="/profiles/$profileSlug"
      params={{ profileSlug: slug }}
      className={clsx(styles.link, className)}
      style={style}
      title={title}
    >
      {image ? (
        <img src={image} alt={name ?? 'Avatar'} className={styles.avatar} />
      ) : (
        <span className={styles.avatarPlaceholder}>{name?.slice(0, 2).toUpperCase()}</span>
      )}
      {afterAvatar}
    </Link>
  );
};
