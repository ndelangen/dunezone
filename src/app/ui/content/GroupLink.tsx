import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './EntityLink.module.css';
import { nameDiscColor } from './nameDisc';

export interface GroupLinkProps {
  slug: string;
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * A group, as a link: a disc in its own colour and its name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the group kind.
 * A colour disc rather than a picture because the groups table carries no image;
 * the colour comes from the name, so the same group is the same colour everywhere.
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
    <span className={styles.media} style={{ backgroundColor: nameDiscColor(name) }} aria-hidden />
    <span className={styles.name}>{name}</span>
  </Link>
);
