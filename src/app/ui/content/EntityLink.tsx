import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

import styles from './EntityLink.module.css';
import { TopicIcon } from './TopicIcon';
import type { TopicIconProps } from './TopicIcon';

type EntityMedia =
  /** A round picture or colour: a faction's symbol, a ruleset's cover, a group's colour. */
  | { disc: ReactNode; color?: string }
  /** The topic glyph, where the thing carries no picture of its own. */
  | { glyph: TopicIconProps['topic'] };

export type EntityLinkProps = EntityMedia & {
  name: string;
  className?: string;
  style?: CSSProperties;
  /** The router link to the thing's page, handed the class, style and contents to render. */
  renderRoot: (props: { className: string; style?: CSSProperties; children: ReactNode }) => ReactNode;
};

/**
 * The organ under `FactionLink`, `GroupLink`, `RulesetLink` and `AssetLink`: a small round picture or a glyph, then the name, as one inline link.
 * Each kind owns its destination and its picture;
 * this owns the arrangement and the hover, so every kind reads as one family.
 * Not for pages to use directly: cite a thing through its kind's link.
 */
export function EntityLink({ name, className, style, renderRoot, ...media }: EntityLinkProps) {
  return renderRoot({
    className: clsx(styles.link, className),
    style,
    children: (
      <>
        {'glyph' in media ? (
          <TopicIcon topic={media.glyph} size={18} className={styles.icon} />
        ) : (
          <span className={styles.media} style={media.color ? { backgroundColor: media.color } : undefined} aria-hidden>
            {media.disc}
          </span>
        )}
        <span className={styles.name}>{name}</span>
      </>
    ),
  });
}
