import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';

export interface FactionLinkProps {
  factionId: string;
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * A faction, as a link: its glyph and name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the faction kind.
 * Callers hand it the fields;
 * this owns how a faction is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const FactionLink = ({ factionId, name, className, style, title }: FactionLinkProps) => (
  <Link
    to="/factions/$factionId"
    params={{ factionId }}
    className={clsx(styles.link, className)}
    style={style}
    title={title}
  >
    <TopicIcon topic="factions" size={18} className={styles.icon} />
    <span className={styles.name}>{name}</span>
  </Link>
);
