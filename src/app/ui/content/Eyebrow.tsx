import { Text } from '@mantine/core';

export interface EyebrowProps {
  /** The label itself. A string, not a node: the words are the data this renders. */
  children: string;
  /**
   * `accent` ties the label to the brand, `muted` lets it recede behind the content it names, and
   * `inverse` keeps it legible on the dark hero artwork.
   */
  tone?: 'muted' | 'accent' | 'inverse';
  id?: string;
}

/**
 * Names the category of the content directly beneath it.
 *
 * Callers own the words and what follows them; this component owns the single small-caps,
 * letter-spaced treatment every such label shares. Without it a section kicker, a field caption and
 * a placeholder marker each grow their own near-identical uppercase style.
 */
export function Eyebrow({ children, tone = 'muted', id }: EyebrowProps) {
  return (
    <Text
      id={id}
      component="p"
      size="xs"
      fw={800}
      tt="uppercase"
      lts="0.14em"
      lh={1.4}
      c={tone === 'accent' ? 'var(--color-link)' : tone === 'inverse' ? 'dune.2' : 'dimmed'}
    >
      {children}
    </Text>
  );
}
