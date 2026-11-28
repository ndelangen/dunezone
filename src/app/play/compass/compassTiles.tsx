import { Armchair, Clock3, EyeOff, Hand, Handshake, MessagesSquare, Swords } from 'lucide-react';
import type { ReactNode } from 'react';

import type { TileSpot } from './compassSpots';
import type { CompassPlayer, CompassTable } from './compassTable';
import type { CompassPanel } from './panels';
import { PlayerToken } from './PlayerToken';
import { SHORTCUTS } from './shortcuts';

/** One tile at the end of a compass arm: the panel it opens, and what it says while that panel is missing. */
export type Tile = Readonly<{
  spot: TileSpot;
  panel?: CompassPanel;
  label: string;
  detail: ReactNode;
  icon: ReactNode;
  keys: string;
  /** The letter that opens the panel with the compass shut. */
  shortcut: string;
  disabled?: boolean;
  hidden?: boolean;
  badge?: number;
}>;

const ICON = { size: 30, strokeWidth: 1.6 };

type PanelLookup = (key: string) => CompassPanel | undefined;

function handTile(panelOf: PanelLookup): Tile {
  const panel = panelOf('hand');
  return {
    spot: 'hand',
    panel,
    label: panel?.label ?? 'Hand',
    detail: 'Cards, leaders and spice',
    icon: <Hand {...ICON} />,
    keys: '←',
    shortcut: SHORTCUTS.hand,
    disabled: !panel,
  };
}

function hiddenTile(panelOf: PanelLookup): Tile {
  const panel = panelOf('hidden-zone');
  return {
    spot: 'hidden',
    panel,
    label: 'Private side-table',
    detail: 'Pieces only you see',
    icon: <EyeOff {...ICON} />,
    keys: '← ←',
    shortcut: SHORTCUTS.hidden,
    disabled: !panel,
  };
}

function tableTile(panelOf: PanelLookup, unread: number | undefined): Tile {
  const panel = panelOf('table-chat');
  return {
    spot: 'table',
    panel,
    label: 'Table chat',
    detail: unread ? `${unread} unread` : 'Everyone at the table',
    icon: <MessagesSquare {...ICON} />,
    keys: '→',
    shortcut: SHORTCUTS.table,
    badge: unread,
    disabled: !panel,
  };
}

function allyTile(panelOf: PanelLookup, ally: CompassPlayer | undefined): Tile {
  const panel = ally ? panelOf(`player:${ally.seat}`) : undefined;
  return {
    spot: 'ally',
    panel,
    label: 'Ally chat',
    detail: ally ? [ally.name, ally.factionName].filter(Boolean).join(' · ') : 'No ally yet',
    icon: ally ? <PlayerToken player={ally} size={34} /> : <Handshake {...ICON} />,
    keys: '→ →',
    shortcut: SHORTCUTS.ally,
    badge: ally?.unread,
    disabled: !panel,
  };
}

function battleTile(panelOf: PanelLookup): Tile {
  const panel = panelOf('battle');
  return {
    spot: 'battle',
    panel,
    label: 'Battle plan',
    detail: panel ? 'Your plan for this battle' : 'No battle right now',
    icon: <Swords {...ICON} />,
    keys: '↑',
    shortcut: SHORTCUTS.battle,
    disabled: !panel,
  };
}

/*
 * While a spectator asks for a seat, the top arm leads to Seats & spectators instead of the battle plan (Norbert, 2026-11-05),
 * so a player sees the request the next time they open the compass. The arm keeps its key and letter.
 */
function seatsTile(panelOf: PanelLookup, requests: number): Tile {
  return {
    spot: 'battle',
    panel: panelOf('seats'),
    label: 'Seats & spectators',
    detail: requests === 1 ? 'A spectator asks for a seat' : `${requests} spectators ask for a seat`,
    icon: <Armchair {...ICON} />,
    keys: '↑',
    shortcut: SHORTCUTS.battle,
    badge: requests,
    disabled: !panelOf('seats'),
  };
}

/** The five tiles, from the panels the table has right now. */
export function tilesOf(panels: readonly CompassPanel[], table: CompassTable | null): Record<TileSpot, Tile> {
  const panelOf: PanelLookup = (key) => panels.find((entry) => entry.key === key);
  return {
    hand: handTile(panelOf),
    hidden: hiddenTile(panelOf),
    table: table?.recall
      ? {
          spot: 'table',
          panel: panelOf('recall-chat'),
          label: 'Recall chat',
          detail: 'Discarded when recall closes',
          icon: <MessagesSquare {...ICON} />,
          keys: '→',
          shortcut: SHORTCUTS.table,
          disabled: !panelOf('recall-chat'),
        }
      : tableTile(panelOf, table?.tableChat?.unread),
    ally: table?.recall
      ? { spot: 'ally', label: '', detail: '', icon: null, keys: '', shortcut: '', disabled: true, hidden: true }
      : allyTile(
          panelOf,
          table?.players.find((player) => player.ally)
        ),
    battle: table?.recall
      ? {
          spot: 'battle',
          panel: panelOf('recall-history'),
          label: 'Shared history',
          detail: 'One checkpoint for everyone',
          icon: <Clock3 {...ICON} />,
          keys: '↑',
          shortcut: SHORTCUTS.battle,
        }
      : table?.seatRequests
        ? seatsTile(panelOf, table.seatRequests)
        : battleTile(panelOf),
  };
}
