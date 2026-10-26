import { Kbd } from '@ui/content/Kbd';
import clsx from 'clsx';
import { MessagesSquare } from 'lucide-react';
import { useContext } from 'react';

import styles from './ChatBar.module.css';
import base from './CompassControls.module.css';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import { PlayerToken } from './PlayerToken';
import type { PlayerTab } from './windows';

/* The bar at the bottom of the table: the Controls button that opens the compass, a token for each chat, and the viewer's own. */

type ChatBarProps = Readonly<{
  inert: boolean;
  /** Whether a window is open anywhere, so its token shows pressed. */
  isOpen: (key: string) => boolean;
  onOpenCompass: () => void;
  onShow: (key: string, tab: PlayerTab) => void;
}>;

/* The words that name a chat token, joined for its accessible name and its tip. */
function words(...parts: (string | null | false | 0 | undefined)[]) {
  return parts.filter(Boolean);
}

export function ChatBar({ inert, isOpen, onOpenCompass, onShow }: ChatBarProps) {
  const table = useContext(CompassTableContext);
  /* The other players to talk to, then the viewer's own token, which opens their faction's information. */
  const others = table?.players.filter((player) => !player.own) ?? [];
  const own = table?.players.find((player) => player.own);
  const tableChat = table?.tableChat;
  return (
    <div className={styles.bar} inert={inert} data-hides-cursor data-compass-bar>
      <button type="button" className={styles.launcher} data-compass-launcher onClick={onOpenCompass}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={base.glyph}>
          <circle cx="12" cy="12" r="8" />
          <path d="m12 7 2 5-2 5-2-5z" />
        </svg>
        Controls
        <Kbd>Space</Kbd>
      </button>
      {(tableChat || others.length > 0 || own) && (
        <nav className={styles.chats} aria-label="Chats">
          {tableChat && (
            <TableChatToken
              unread={tableChat.unread}
              open={isOpen('table-chat')}
              onOpen={() => onShow('table-chat', 'conversation')}
            />
          )}
          {others.map((player) => (
            <ChatToken
              key={player.seat}
              player={player}
              open={isOpen(`player:${player.seat}`)}
              onOpen={() => onShow(`player:${player.seat}`, player.canConverse ? 'conversation' : 'public')}
            />
          ))}
          {own && (
            <>
              {(tableChat || others.length > 0) && <span className={styles.divider} aria-hidden="true" />}
              <ChatToken
                player={own}
                open={isOpen(`player:${own.seat}`)}
                onOpen={() => onShow(`player:${own.seat}`, 'public')}
              />
            </>
          )}
        </nav>
      )}
    </div>
  );
}

function TableChatToken({ unread, open, onOpen }: Readonly<{ unread: number; open: boolean; onOpen: () => void }>) {
  return (
    <button
      type="button"
      className={styles.chat}
      aria-pressed={open}
      aria-label={words('Table chat', unread && `${unread} unread`).join(', ')}
      data-tip="Table chat · Space →"
      onClick={onOpen}
    >
      <span className={clsx(styles.token, styles.planet)}>
        <MessagesSquare size={17} />
      </span>
      {unread > 0 && <span className={styles.badge}>{unread}</span>}
    </button>
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
    <button
      type="button"
      className={styles.chat}
      aria-pressed={open}
      aria-label={words(
        player.own ? `You (${player.factionName ?? player.name})` : player.name,
        !player.own && player.factionName,
        reason,
        player.unread && `${player.unread} unread`
      ).join(', ')}
      data-tip={words(
        player.own ? 'You' : player.name,
        player.factionName,
        reason,
        player.ally && 'ally · Space → →'
      ).join(' · ')}
      data-ally={player.ally || undefined}
      onClick={onOpen}
    >
      <PlayerToken player={player} />
      {player.unread > 0 && <span className={styles.badge}>{player.unread}</span>}
      {player.attention && <span className={styles.attention} data-attention aria-hidden="true" />}
    </button>
  );
}
