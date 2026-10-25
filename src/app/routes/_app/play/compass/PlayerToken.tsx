import styles from './ChatBar.module.css';
import type { CompassPlayer } from './compassTable';

/** A player's faction token, or their initial where the table has no token for them yet. */
export function PlayerToken({ player, size = 30 }: Readonly<{ player: CompassPlayer; size?: number }>) {
  return player.token ? (
    <img className={styles.token} src={player.token} alt="" width={size} height={size} />
  ) : (
    <span className={styles.token} style={{ width: size, height: size }} aria-hidden="true">
      {player.name.slice(0, 1)}
    </span>
  );
}
