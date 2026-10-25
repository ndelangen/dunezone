import clsx from 'clsx';
import { MessagesSquare } from 'lucide-react';
import { useContext } from 'react';

import styles from './ChatBar.module.css';
import base from './CompassControls.module.css';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import { Key } from './glyphs';
import { PlayerToken } from './PlayerToken';
import type { PlayerTab } from './windows';

/* The bar at the bottom of the table: the Controls button that opens the compass, and a token for each chat. */

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
  const others = table?.players.filter((player) => !player.own) ?? [];
  const tableChat = table?.tableChat;
  return (
    <div className={styles.bar} inert={inert} data-hides-cursor>
      <button type="button" className={styles.launcher} data-compass-launcher onClick={onOpenCompass}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={base.glyph}>
          <circle cx="12" cy="12" r="8" />
          <path d="m12 7 2 5-2 5-2-5z" />
        </svg>
        Controls
        <Key>Space</Key>
      </button>
      {(tableChat || others.length > 0) && (
        <nav className={styles.chats} aria-label="Chats">
          {tableChat && (
            <button
              type="button"
              className={styles.chat}
              aria-pressed={isOpen('table-chat')}
              aria-label={words('Table chat', tableChat.unread && `${tableChat.unread} unread`).join(', ')}
              data-tip="Table chat · Space →"
              onClick={() => onShow('table-chat', 'conversation')}
            >
              <span className={clsx(styles.token, styles.planet)}>
                <MessagesSquare size={17} />
              </span>
              {tableChat.unread > 0 && <span className={styles.badge}>{tableChat.unread}</span>}
            </button>
          )}
          {others.map((player) => (
            <ChatToken
              key={player.seat}
              player={player}
              open={isOpen(`player:${player.seat}`)}
              onOpen={() => onShow(`player:${player.seat}`, player.canConverse ? 'conversation' : 'public')}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

function ChatToken({ player, open, onOpen }: Readonly<{ player: CompassPlayer; open: boolean; onOpen: () => void }>) {
  return (
    <button
      type="button"
      className={styles.chat}
      aria-pressed={open}
      aria-label={words(player.name, player.factionName, player.unread && `${player.unread} unread`).join(', ')}
      data-tip={words(player.name, player.factionName, player.ally && 'ally · Space → →').join(' · ')}
      data-ally={player.ally || undefined}
      onClick={onOpen}
    >
      <PlayerToken player={player} />
      {player.unread > 0 && <span className={styles.badge}>{player.unread}</span>}
      {player.attention && <span className={styles.attention} data-attention aria-hidden="true" />}
    </button>
  );
}
