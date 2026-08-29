import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { ComponentProps, CSSProperties } from 'react';

import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from './EntityLink.module.css';

type FactionTokenProps = ComponentProps<typeof FactionToken>;

export interface FactionLinkProps {
  factionId: string;
  name: string;
  /** The faction's own mark, the same pair its detail page renders. */
  logo: FactionTokenProps['logo'];
  background: FactionTokenProps['background'];
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
export const FactionLink = ({ factionId, name, logo, background, className, style, title }: FactionLinkProps) => (
  <Link
    to="/factions/$factionId"
    params={{ factionId }}
    className={clsx(styles.link, className)}
    style={style}
    title={title}
  >
    <span className={styles.media} aria-hidden>
      <FactionToken logo={logo} background={background} />
    </span>
    <span className={styles.name}>{name}</span>
  </Link>
);
