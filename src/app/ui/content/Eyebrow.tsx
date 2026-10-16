import { Text } from '@mantine/core';

/** The drop shadow under white text on header artwork; `ProfileLink.module.css` repeats it for an inverse name. */
const INVERSE_TEXT_SHADOW = '0 2px 8px rgb(0 0 0 / 85%)';

export interface EyebrowProps {
  /** The label itself. A string, not a node: the words are the data this renders. */
  children: string;
  /**
   * `accent` ties the label to the brand, `muted` lets it recede behind the content it names, and `inverse` is pure white with a drop shadow, the one treatment for text over header artwork, so it stays legible on light and dark patches alike.
   */
  tone?: 'muted' | 'accent' | 'inverse';
  id?: string;
}

/**
 * Names the category of the content directly beneath it.
 *
 * Callers own the words and what follows them;
 * this component owns the single small-caps, letter-spaced treatment every such label shares.
 * Without it a section kicker, a field caption and a placeholder marker each grow their own near-identical uppercase style.
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
      c={tone === 'accent' ? 'var(--color-link)' : tone === 'inverse' ? 'white' : 'dimmed'}
      style={tone === 'inverse' ? { textShadow: INVERSE_TEXT_SHADOW } : undefined}
    >
      {children}
    </Text>
  );
}
