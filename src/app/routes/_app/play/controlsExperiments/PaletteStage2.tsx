import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { useContext } from 'react';

import { groupsOf } from './ControlsExperiments';
import type { Destination, ExperimentProps } from './ControlsExperiments';
import { ExperimentPlayersContext } from './experiment';
import type { ExperimentPlayer } from './experiment';
import styles from './PaletteStage2.module.css';

/*
 * The command palette's second stage (Norbert, 2026-10-24):
 * Space opens it, and Space held with a window's key opens that window straight away;
 * every player is a window of their own; Hand and Spice share one window without the "take into hand" button;
 * and a chat bar of faction tokens stays beside the palette's button, with each player's unread count.
 */

export type PlayerTab = 'public' | 'conversation';

export type PaletteWindow = Destination &
  Readonly<{
    player?: ExperimentPlayer;
    chat?: boolean;
  }>;

export function PlayerToken({ player, size = 30 }: Readonly<{ player: ExperimentPlayer; size?: number }>) {
  return player.token ? (
    <img className={styles.token} src={player.token} alt="" width={size} height={size} />
  ) : (
    <span className={styles.token} style={{ width: size, height: size }} aria-hidden="true">
      {player.name.slice(0, 1)}
    </span>
  );
}

export function useWindows(props: ExperimentProps): PaletteWindow[] {
  const players = useContext(ExperimentPlayersContext);
  const items = groupsOf(props.tabs, null).flatMap((group) => group.items);
  const hand = items.find((item) => item.key === 'hand');
  const spice = items.find((item) => item.key === 'spice');
  const controls = items
    .filter((item) => item.key !== 'spice')
    .map((item) =>
      item.key === 'hand' && hand && spice
        ? {
            ...item,
            label: 'Hand & spice',
            description: 'Your cards, leaders and spice reserve.',
            content: (
              <>
                {hand.content}
                {spice.content}
              </>
            ),
          }
        : item
    );
  const windows: PaletteWindow[] = [...controls];
  if (players?.tableChat) {
    windows.push({
      key: 'table-chat',
      label: 'Table chat',
      group: 'Players',
      groupKey: 'players',
      topic: 'planet',
      description: 'Everyone at the table',
      content: players.render(TABLE_CONVERSATION, 'conversation'),
      flush: false,
      chat: true,
    });
  }
  for (const player of players?.players ?? []) {
    windows.push({
      key: `player:${player.seat}`,
      label: player.own ? `You (${player.factionName ?? player.name})` : player.name,
      group: 'Players',
      groupKey: 'players',
      topic: 'factions',
      description: player.factionName ?? undefined,
      content: null,
      flush: false,
      player,
    });
  }
  return windows;
}
