import styles from './CompassControls.module.css';

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={styles.glyph}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
