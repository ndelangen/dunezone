import styles from './Emblem.module.css';

/**
 * A faction emblem in a disc the size of a portrait's, drawn from its vector the way the token renderer draws it: the file's `#root` in `currentColor`, at 60 units of a 100 unit square.
 * The figure sets the disc's size through `--disc`.
 */
export function Emblem({ vectorKey, alt }: Readonly<{ vectorKey: string; alt: string }>) {
  return (
    <span className={styles.mark}>
      <svg className={styles.emblem} viewBox="0 0 100 100" role="img" aria-label={alt}>
        <use href={`${vectorKey}#root`} x={20} y={20} width={60} height={60} fill="currentColor" />
      </svg>
    </span>
  );
}
