import { createPortal } from 'react-dom';

import styles from './DepartureCover.module.css';

/** Covers the page while it departs for a table, so the fading page takes no clicks. */
export function DepartureCover() {
  return createPortal(<div className={styles.cover} data-voyage="departing" aria-hidden />, document.body);
}
