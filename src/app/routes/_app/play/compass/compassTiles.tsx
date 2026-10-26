import { EyeOff, Hand, Handshake, MessagesSquare, Swords } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TileSpot } from './compassSpots';
import type { CompassPlayer, CompassTable } from './compassTable';
import { PlayerToken } from './PlayerToken';
import { SHORTCUTS } from './shortcuts';
import type { TableWindow } from './windows';

/** One tile at the end of a compass arm: the window it opens, and what it says while that window is missing. */
export type Tile = Readonly<{
  spot: TileSpot;
  window?: TableWindow;
  label: string;
  detail: ReactNode;
  icon: ReactNode;
  keys: string;
  /** The letter that opens the window with the compass shut. */
  shortcut: string;
  disabled?: boolean;
  badge?: number;
}>;

const ICON = { size: 30, strokeWidth: 1.6 };

type Windows = (key: string) => TableWindow | undefined;

function handTile(windowOf: Windows): Tile {
  const window = windowOf('hand');
  return {
    spot: 'hand',
    window,
    label: window?.label ?? 'Hand',
    detail: 'Cards, leaders and spice',
    icon: <Hand {...ICON} />,
    keys: '←',
    shortcut: SHORTCUTS.hand,
    disabled: !window,
  };
}

function hiddenTile(windowOf: Windows): Tile {
  const window = windowOf('hidden-zone');
  return {
    spot: 'hidden',
    window,
    label: 'Private side-table',
    detail: 'Pieces only you see',
    icon: <EyeOff {...ICON} />,
    keys: '← ←',
    shortcut: SHORTCUTS.hidden,
    disabled: !window,
  };
}

function tableTile(windowOf: Windows, unread: number | undefined): Tile {
  const window = windowOf('table-chat');
  return {
    spot: 'table',
    window,
    label: 'Table chat',
    detail: unread ? `${unread} unread` : 'Everyone at the table',
    icon: <MessagesSquare {...ICON} />,
    keys: '→',
    shortcut: SHORTCUTS.table,
    badge: unread,
    disabled: !window,
  };
}

function allyTile(windowOf: Windows, ally: CompassPlayer | undefined): Tile {
  const window = ally ? windowOf(`player:${ally.seat}`) : undefined;
  return {
    spot: 'ally',
    window,
    label: 'Ally chat',
    detail: ally ? [ally.name, ally.factionName].filter(Boolean).join(' · ') : 'No ally yet',
    icon: ally ? <PlayerToken player={ally} size={34} /> : <Handshake {...ICON} />,
    keys: '→ →',
    shortcut: SHORTCUTS.ally,
    badge: ally?.unread,
    disabled: !window,
  };
}

function battleTile(windowOf: Windows): Tile {
  const window = windowOf('battle');
  return {
    spot: 'battle',
    window,
    label: 'Battle plan',
    detail: window ? 'Your plan for this battle' : 'No battle right now',
    icon: <Swords {...ICON} />,
    keys: '↑',
    shortcut: SHORTCUTS.battle,
    disabled: !window,
  };
}

/** The five tiles, from the windows the table has right now. */
export function tilesOf(windows: readonly TableWindow[], table: CompassTable | null): Record<TileSpot, Tile> {
  const windowOf: Windows = (key) => windows.find((entry) => entry.key === key);
  return {
    hand: handTile(windowOf),
    hidden: hiddenTile(windowOf),
    table: tableTile(windowOf, table?.tableChat?.unread),
    ally: allyTile(
      windowOf,
      table?.players.find((player) => player.ally)
    ),
    battle: battleTile(windowOf),
  };
}
