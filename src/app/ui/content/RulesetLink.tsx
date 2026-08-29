import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';

export interface RulesetLinkProps {
  slug: string;
  name: string;
  /** The ruleset's cover, the family's `image`. Omit it where a projection carries no cover and the glyph stands in. */
  image?: string | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * A ruleset, as a link: its cover and its name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the ruleset kind.
 * Callers hand it the fields;
 * this owns how a ruleset is cited inline anywhere in the app, so every mention looks and navigates identically.
 * A caller whose projection carries no cover gets the shared glyph instead, which is why the cover is optional rather than required.
 * The destination is hardcoded because it is the component's name.
 */
export const RulesetLink = ({ slug, name, image = null, className, style, title }: RulesetLinkProps) => (
  <Link
    to="/rulesets/$rulesetSlug"
    params={{ rulesetSlug: slug }}
    className={clsx(styles.link, className)}
    style={style}
    title={title}
  >
    {image ? (
      <span className={styles.media}>
        <img src={image} alt="" className={styles.cover} />
      </span>
    ) : (
      <TopicIcon topic="rulesets" size={18} className={styles.icon} />
    )}
    <span className={styles.name}>{name}</span>
  </Link>
);
