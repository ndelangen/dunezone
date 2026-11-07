import { Text } from '@mantine/core';
import clsx from 'clsx';

import styles from './Eyebrow.module.css';

export interface EyebrowProps {
  /** The label itself. A string, not a node: the words are the data this renders. */
  children: string;
  /**
   * `accent` ties the label to the brand, `muted` lets it recede behind the content it names, and `inverse` is pure white with a drop shadow, the one treatment for text over header artwork, so it stays legible on light and dark patches alike.
   */
  tone?: 'muted' | 'accent' | 'inverse';
  /** `center` for a caption over a centred preview, such as a token or card tile. */
  align?: 'start' | 'center';
  id?: string;
}

/**
 * Names the category of the content directly beneath it.
 *
 * Callers own the words and what follows them;
 * this component owns the single small-caps, letter-spaced treatment every such label shares.
 * Without it a section kicker, a field caption and a placeholder marker each grow their own near-identical uppercase style.
 */
export function Eyebrow({ children, tone = 'muted', align = 'start', id }: EyebrowProps) {
  return (
    <Text
      id={id}
      component="p"
      className={clsx(styles.eyebrow, tone === 'inverse' && styles.inverse)}
      ta={align === 'center' ? 'center' : undefined}
      c={tone === 'accent' ? 'var(--color-link)' : tone === 'muted' ? 'dimmed' : undefined}
    >
      {children}
    </Text>
  );
}
