import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';

export interface RulesetLinkProps {
  slug: string;
  name: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/**
 * A ruleset, as a link: its glyph and name, leading to its page.
 *
 * Content, `ProfileLink`'s sibling for the ruleset kind.
 * Callers hand it the fields;
 * this owns how a ruleset is cited inline anywhere in the app, so every mention looks and navigates identically.
 * The destination is hardcoded because it is the component's name.
 */
export const RulesetLink = ({ slug, name, className, style, title }: RulesetLinkProps) => (
  <Link
    to="/rulesets/$rulesetSlug"
    params={{ rulesetSlug: slug }}
    className={clsx(styles.link, className)}
    style={style}
    title={title}
  >
    <TopicIcon topic="rulesets" size={18} className={styles.icon} />
    <span className={styles.name}>{name}</span>
  </Link>
);
