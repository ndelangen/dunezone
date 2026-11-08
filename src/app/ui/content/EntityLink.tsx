import { Tooltip } from '@mantine/core';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';
import type { TopicIconProps } from './TopicIcon';

type EntityMedia =
  /** A round picture or colour: a person's avatar, a faction's symbol, a ruleset's cover, a group's colour. */
  | { disc: ReactNode; color?: string }
  /** The topic glyph, where the thing carries no picture of its own. */
  | { glyph: TopicIconProps['topic'] };

export type EntityLinkProps = EntityMedia & {
  name: string;
  className?: string;
  style?: CSSProperties;
  /** Hides the name and keeps only the picture; the root is then named by `label`, since a decorative picture names nothing. */
  showName?: boolean;
  /** The root's accessible name when the name is hidden. */
  label?: string;
  /** Shown on hover, wrapped around the root, which takes the hover handlers and ref. */
  tooltip?: string;
  /** `inverse` sets the name in pure white with a drop shadow, for a link laid over header artwork. */
  tone?: 'default' | 'inverse';
  /** A row with its own hover treatment can keep the name undecorated. */
  underline?: 'hover' | 'never';
  /** A smaller name, for list bylines. */
  density?: 'default' | 'compact';
  /** `contributor` sets a large picture with the name below it in a wide container, for a forum identity. */
  presentation?: 'citation' | 'contributor';
  /** The router link to the thing's page, handed the class, style, accessible name and contents to render. */
  renderRoot: (props: {
    className: string;
    style?: CSSProperties;
    'aria-label'?: string;
    children: ReactNode;
  }) => ReactNode;
};

/**
 * The organ under `ProfileLink`, `FactionLink`, `GroupLink`, `RulesetLink` and `AssetLink`: a small round picture or a glyph, then the name, as one inline link.
 * Each kind owns its destination and its picture;
 * this owns the arrangement, the sizes and the hover, so every kind reads as one family.
 * A caller sizes the picture through `--entity-link-media-size`, as the drafting ledger does.
 * Not for pages to use directly: cite a thing through its kind's link.
 */
export function EntityLink({
  name,
  className,
  style,
  renderRoot,
  showName = true,
  label,
  tooltip,
  tone = 'default',
  underline = 'hover',
  density = 'default',
  presentation = 'citation',
  ...media
}: EntityLinkProps) {
  const root = renderRoot({
    className: clsx(
      styles.link,
      underline === 'hover' && styles.underlined,
      density === 'compact' && styles.compact,
      presentation === 'contributor' && styles.contributor,
      className
    ),
    style,
    'aria-label': showName ? undefined : label,
    children: (
      <>
        {'glyph' in media ? (
          <TopicIcon topic={media.glyph} size={18} className={styles.icon} />
        ) : (
          <span className={styles.media} style={media.color ? { backgroundColor: media.color } : undefined} aria-hidden>
            {media.disc}
          </span>
        )}
        {showName ? <span className={clsx(styles.name, tone === 'inverse' && styles.inverse)}>{name}</span> : null}
      </>
    ),
  });
  return tooltip ? <Tooltip label={tooltip}>{root}</Tooltip> : root;
}
