import { Tooltip } from '@mantine/core';

import chat from './ChatBar.module.css';
import type { CompassPlayer } from './compassTable';
import styles from './FactionTokens.module.css';
import { PlayerToken } from './PlayerToken';

/** The seat the faction information shows: the one asked for while it is at the table, else the viewer's own, else the first. */
export function factionSeat(players: readonly CompassPlayer[], seat: string | undefined) {
  const asked = players.find((player) => player.seat === seat);
  return (asked ?? players.find((player) => player.own) ?? players[0])?.seat;
}

/* A player's name with their faction; a vacant seat goes by its faction already, so it says it once. */
function named(name: string, player: CompassPlayer) {
  return [name, player.factionName !== player.name && player.factionName].filter(Boolean);
}

type FactionTokensProps = Readonly<{
  players: readonly CompassPlayer[];
  seat: string | undefined;
  onSeat: (seat: string) => void;
}>;

/** Every faction at the table as its token over its player's name, marked while a vote or a seat request waits; the pressed one is shown below. */
export function FactionTokens({ players, seat, onSeat }: FactionTokensProps) {
  return (
    <div className={styles.picker} role="group" aria-label="Factions">
      {players.map((player) => (
        <Tooltip key={player.seat} label={named(player.name, player).join(' · ')} withinPortal>
          <button
            type="button"
            className={styles.faction}
            aria-pressed={player.seat === seat}
            aria-label={named(player.own ? 'You' : player.name, player).join(', ')}
            onClick={() => onSeat(player.seat)}
          >
            <span className={styles.token}>
              <PlayerToken player={player} size={34} />
              {player.attention && <span className={chat.attention} aria-hidden="true" />}
            </span>
            <span className={styles.name}>{player.own ? 'You' : player.name}</span>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
