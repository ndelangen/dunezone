import { EyeOff, Hand, Handshake, MessagesSquare, Swords } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TileSpot } from './compassSpots';
import type { CompassTable } from './compassTable';
import { PlayerToken } from './PlayerToken';
import type { PlayerTab, TableWindow } from './windows';

/** One tile at the end of a compass arm: the window it opens, and what it says while that window is missing. */
export type Tile = Readonly<{
  spot: TileSpot;
  window?: TableWindow;
  tab?: PlayerTab;
  label: string;
  detail: ReactNode;
  icon: ReactNode;
  keys: string;
  disabled?: boolean;
  badge?: number;
}>;

const ICON = { size: 30, strokeWidth: 1.6 };

/** The five tiles, from the windows the table has right now. */
export function tilesOf(windows: readonly TableWindow[], table: CompassTable | null): Record<TileSpot, Tile> {
  const byKey = (key: string) => windows.find((entry) => entry.key === key);
  const ally = table?.players.find((player) => player.ally);
  const allyWindow = ally ? byKey(`player:${ally.seat}`) : undefined;
  const battle = byKey('battle');
  const unread = table?.tableChat?.unread;
  return {
    hand: {
      spot: 'hand',
      window: byKey('hand'),
      label: byKey('hand')?.label ?? 'Hand',
      detail: 'Cards, leaders and spice',
      icon: <Hand {...ICON} />,
      keys: '←',
      disabled: !byKey('hand'),
    },
    hidden: {
      spot: 'hidden',
      window: byKey('hidden-zone'),
      label: 'Hidden zone',
      detail: 'Pieces only you see',
      icon: <EyeOff {...ICON} />,
      keys: '← ←',
      disabled: !byKey('hidden-zone'),
    },
    table: {
      spot: 'table',
      window: byKey('table-chat'),
      tab: 'conversation',
      label: 'Table chat',
      detail: unread ? `${unread} unread` : 'Everyone at the table',
      icon: <MessagesSquare {...ICON} />,
      keys: '→',
      badge: unread,
      disabled: !byKey('table-chat'),
    },
    ally: {
      spot: 'ally',
      window: allyWindow,
      tab: 'conversation',
      label: 'Ally chat',
      detail: ally ? [ally.name, ally.factionName].filter(Boolean).join(' · ') : 'No ally yet',
      icon: ally ? <PlayerToken player={ally} size={34} /> : <Handshake {...ICON} />,
      keys: '→ →',
      badge: ally?.unread,
      disabled: !allyWindow,
    },
    battle: {
      spot: 'battle',
      window: battle,
      label: 'Battle plan',
      detail: battle ? 'Your plan for this battle' : 'No battle right now',
      icon: <Swords {...ICON} />,
      keys: '↑',
      disabled: !battle,
    },
  };
}
