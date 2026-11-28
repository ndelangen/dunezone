import { NameDisc } from '@ui/content/NameDisc';

import styles from './ChatBar.module.css';
import type { CompassPlayer } from './compassTable';

/** A player's faction token, or their initial where the table has no token for them yet. */
export function PlayerToken({ player, size = 30 }: Readonly<{ player: CompassPlayer; size?: number }>) {
  return <NameDisc className={styles.token} name={player.name} src={player.token} size={size} />;
}
