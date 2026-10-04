/* Throwaway live renderer inside the approved homepage preview frame. */
import ConnectedDemo from './ConnectedDemo';
import styles from './live.module.css';

export default function LiveDemo() {
  return (
    <div className={styles.demo}>
      <ConnectedDemo member={new URLSearchParams(location.search).get('role') === 'member'} />
    </div>
  );
}
