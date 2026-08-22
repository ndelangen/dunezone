import styles from './HeroTitle.module.css';

export interface HeroTitleProps {
  /** The page's name. A string, not a node: the words are the data this renders. */
  children: string;
}

/**
 * The page's name, displayed large over the artwork band.
 *
 * Callers own the words and their alignment;
 * this component owns the one white, shadowed, fluid-size display treatment every band title shares, the faction shields' Desdemona face, set in uppercase like the shields set it.
 * Without it each hero page grows its own near-identical clamp of white text.
 */
export function HeroTitle({ children }: HeroTitleProps) {
  return <h1 className={styles.root}>{children}</h1>;
}
