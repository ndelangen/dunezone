import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';

export interface AssetLinkProps {
  /** The asset's type slug, a route param. Plain string because the page contracts carry it that way. */
  type: string;
  slug: string;
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * An asset, as a link: its glyph and name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the asset kind.
 * Callers hand it the fields;
 * this owns how an asset is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const AssetLink = ({ type, slug, name, className, style, title }: AssetLinkProps) => (
  <Link
    to="/assets/$type/$slug"
    params={{ type, slug }}
    className={clsx(styles.link, className)}
    style={style}
    title={title}
  >
    <TopicIcon topic="assets" size={18} className={styles.icon} />
    <span className={styles.name}>{name}</span>
  </Link>
);
