import { Tooltip } from '@mantine/core';
import { Kbd } from '@ui/content/Kbd';
import clsx from 'clsx';
import { MessagesSquare } from 'lucide-react';
import { useContext } from 'react';

import styles from './ChatBar.module.css';
import base from './CompassControls.module.css';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import { PlayerToken } from './PlayerToken';
import { chattable, FACTION_INFO } from './windows';

/* The bar at the bottom of the table: the viewer's own token, the Controls button that opens the compass, and a token for each chat. */

type ChatBarProps = Readonly<{
  inert: boolean;
  /** Whether the table has a Hand & spice window yet, which the own token opens. */
  hasHand: boolean;
  /** Whether a window is open anywhere, so its token shows pressed. */
  isOpen: (key: string, seat?: string) => boolean;
  onOpenCompass: () => void;
  /** Opens a window, the faction information on the seat given. */
  onShow: (key: string, seat?: string) => void;
}>;

/* The words that name a chat token, joined for its accessible name and its tip. */
function words(...parts: (string | null | false | 0 | undefined)[]) {
  return parts.filter(Boolean);
}

export function ChatBar({ inert, hasHand, isOpen, onOpenCompass, onShow }: ChatBarProps) {
  const table = useContext(CompassTableContext);
  /* The other players to talk to, and the viewer too while a removal vote stands against them. */
  const others = table?.players.filter((player) => !player.own || player.vote) ?? [];
  const tableChat = table?.tableChat;
  const own = table?.players.find((player) => player.own);
  return (
    <div className={styles.bar} inert={inert} data-hides-cursor data-compass-bar>
      {hasHand && own?.factionName && <OwnToken player={own} open={isOpen('hand')} onOpen={() => onShow('hand')} />}
      <button type="button" className={styles.launcher} data-compass-launcher onClick={onOpenCompass}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={base.glyph}>
          <circle cx="12" cy="12" r="8" />
          <path d="m12 7 2 5-2 5-2-5z" />
        </svg>
        Controls
        <Kbd>Space</Kbd>
      </button>
      {(tableChat || others.length > 0) && (
        <nav className={styles.chats} aria-label="Chats">
          {tableChat && (
            <TableChatToken unread={tableChat.unread} open={isOpen('table-chat')} onOpen={() => onShow('table-chat')} />
          )}
          {/* A token opens the chat with its player, or their faction's information when there is no chat to have. */}
          {others.map((player) => (
            <ChatToken
              key={player.seat}
              player={player}
              open={chattable(player) ? isOpen(`player:${player.seat}`) : isOpen(FACTION_INFO, player.seat)}
              onOpen={() => (chattable(player) ? onShow(`player:${player.seat}`) : onShow(FACTION_INFO, player.seat))}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

/* The viewer's own faction, which opens their Hand & spice as H does; a spectator has no seat and no token. */
function OwnToken({ player, open, onOpen }: Readonly<{ player: CompassPlayer; open: boolean; onOpen: () => void }>) {
  return (
    <Tooltip label={`You are playing as ${player.factionName}`}>
      <button
        type="button"
        className={clsx(styles.chat, styles.own)}
        aria-pressed={open}
        aria-label={`Hand & spice, you are playing as ${player.factionName}`}
        data-own-token
        onClick={onOpen}
      >
        <PlayerToken player={player} size={34} />
      </button>
    </Tooltip>
  );
}

function TableChatToken({ unread, open, onOpen }: Readonly<{ unread: number; open: boolean; onOpen: () => void }>) {
  return (
    <Tooltip label="Table chat · Space →">
      <button
        type="button"
        className={styles.chat}
        aria-pressed={open}
        aria-label={words('Table chat', unread && `${unread} unread`).join(', ')}
        onClick={onOpen}
      >
        <span className={clsx(styles.token, styles.planet)}>
          <MessagesSquare size={17} />
        </span>
        {unread > 0 && <span className={styles.badge}>{unread}</span>}
      </button>
    </Tooltip>
  );
}

/* What waits on a player, said with their name: a vote to remove them, or a request for their empty seat. */
function waiting(player: CompassPlayer) {
  if (player.vote) {
    return 'removal vote';
  }
  return player.attention ? 'seat request' : null;
}

function ChatToken({ player, open, onOpen }: Readonly<{ player: CompassPlayer; open: boolean; onOpen: () => void }>) {
  const reason = waiting(player);
  return (
    <Tooltip label={words(player.name, player.factionName, reason, player.ally && 'ally · Space → →').join(' · ')}>
      <button
        type="button"
        className={styles.chat}
        aria-pressed={open}
        aria-label={words(player.name, player.factionName, reason, player.unread && `${player.unread} unread`).join(
          ', '
        )}
        data-ally={player.ally || undefined}
        onClick={onOpen}
      >
        <PlayerToken player={player} />
        {player.unread > 0 && <span className={styles.badge}>{player.unread}</span>}
        {player.attention && <span className={styles.attention} data-attention aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}
