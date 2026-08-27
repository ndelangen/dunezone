import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';

export interface GroupLinkProps {
  slug: string;
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * A group, as a link: its glyph and name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the group kind.
 * The glyph rather than an avatar because the groups table carries no image.
 * Callers hand it the fields;
 * this owns how a group is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const GroupLink = ({ slug, name, className, style, title }: GroupLinkProps) => (
  <Link
    to="/groups/$groupSlug"
    params={{ groupSlug: slug }}
    className={clsx(styles.link, className)}
    style={style}
    title={title}
  >
    <TopicIcon topic="groups" size={18} className={styles.icon} />
    <span className={styles.name}>{name}</span>
  </Link>
);
