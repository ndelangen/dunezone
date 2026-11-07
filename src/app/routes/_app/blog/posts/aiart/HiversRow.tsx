import styles from './HiversRow.module.css';
import { Portrait } from './Portrait';

/*
 * The five Hivers portraits, in the order of `docs/technical/stock-artwork.md`.
 * The file names describe the artwork, not characters or roles, so the alt text describes the artwork too; no names, no strengths.
 */
const HIVERS: readonly { file: string; wearing: string }[] = [
  { file: 'hiver-amber-pendant', wearing: 'an amber pendant' },
  { file: 'hiver-fur-mantle', wearing: 'a fur mantle' },
  { file: 'hiver-high-crown', wearing: 'a high crown' },
  { file: 'hiver-horned-mask', wearing: 'a horned mask' },
  { file: 'hiver-black-ruff', wearing: 'a black neck ruff' },
];

/**
 * The five portraits in one row, as discs, wrapping to two rows where the column is too narrow for five.
 * Spans rather than a list: `postBodies.test.tsx` reads every `li` as the post's text, and this figure closes the post.
 */
export function HiversRow() {
  return (
    <div className={styles.root}>
      <div className={styles.row}>
        {HIVERS.map(({ file, wearing }) => (
          <span key={file} className={styles.portrait}>
            <Portrait
              imageKey={`/image/leader/hivers/${file}.png`}
              alt={`A Hiver: an insect-like figure with antennae and large compound eyes, wearing ${wearing}`}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
