import { Stack } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { HelpMark } from '@ui/content/HelpMark';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext } from 'react';
import type { ReactNode } from 'react';

import type { TablePanel } from '../GameTable';
import {
  PLAYER_CONVERSATION_GUIDANCE,
  PLAYER_INFO_GUIDANCE,
  TABLE_CONVERSATION_GUIDANCE,
} from '../multiplayer/panelGuidance';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import styles from './Windows.module.css';

/** A player's window shows what they show everyone, or the conversation with them. */
export type PlayerTab = 'public' | 'conversation';

export type WindowLayout = 'stack' | 'flush' | 'fill';

/** One window the compass can open: a panel of the table's controls, the table chat, or a player. */
export type TableWindow = Readonly<{
  key: string;
  label: string;
  group: string;
  topic: TopicIconTopic;
  /** One line on the window, as the search's hint. */
  description?: string;
  /** The window's full guidance, behind its (?) under the description. */
  help?: string;
  content: ReactNode;
  /** How the content sits in the window: stacked and padded, flush to the window's sides, or filling the window as a chat does. */
  layout: WindowLayout;
  /** The content may peek over the window's top edge, as the Battle plan's cards do; it then scrolls its own parts. */
  peek?: boolean;
  player?: CompassPlayer;
}>;

/* The panels one by one: a panel outside any group, or each panel of a group. */
function panelWindows(panels: readonly TablePanel[]): TableWindow[] {
  return panels.flatMap((group) =>
    (group.panels ?? [group]).map((item) => ({
      key: item.key,
      label: item.label,
      group: group.label,
      topic: item.topic,
      description: item.description,
      help: item.help,
      content: item.content,
      layout: item.padding === false ? 'flush' : 'stack',
    }))
  );
}

/** Every window: the panels with Hand and Spice as one, then the table chat and each player. */
export function useTableWindows(panels: readonly TablePanel[]): TableWindow[] {
  const table = useContext(CompassTableContext);
  const items = panelWindows(panels);
  const hand = items.find((item) => item.key === 'hand');
  const spice = items.find((item) => item.key === 'spice');
  const windows: TableWindow[] = items
    .filter((item) => item.key !== 'spice')
    .map((item) =>
      item.key === 'hand' && hand && spice
        ? {
            ...item,
            label: 'Hand & spice',
            description: 'Your cards, leaders and spice reserve.',
            help: [hand.help, spice.help].filter(Boolean).join(' '),
            content: (
              <>
                {hand.content}
                {spice.content}
              </>
            ),
          }
        : item
    );
  if (table?.tableChat) {
    windows.push({
      key: 'table-chat',
      label: 'Table chat',
      group: 'Players',
      topic: 'planet',
      description: TABLE_CONVERSATION_GUIDANCE.description,
      help: TABLE_CONVERSATION_GUIDANCE.help,
      content: table.render(TABLE_CONVERSATION, 'conversation'),
      layout: 'fill',
    });
  }
  for (const player of table?.players ?? []) {
    windows.push({
      key: `player:${player.seat}`,
      label: player.own ? `You (${player.factionName ?? player.name})` : player.name,
      group: 'Players',
      topic: 'factions',
      description: player.factionName ?? undefined,
      content: null,
      layout: 'stack',
      player,
    });
  }
  return windows;
}

/* What a player's window is for: the conversation with them, their public details, or the viewer's own. */
function playerGuidance(player: CompassPlayer, tab: PlayerTab): Pick<TableWindow, 'description' | 'help'> {
  if (player.own) {
    return { description: 'Your faction and seat, and any removal vote against you.' };
  }
  return tab === 'conversation' && player.canConverse ? PLAYER_CONVERSATION_GUIDANCE : PLAYER_INFO_GUIDANCE;
}

/* Every window can be pinned from the centre, by its buttons or by key. */
const PIN_HINT = 'Open in the centre, [ pins it bottom left and ] bottom right.';

/** The (?) beside a window's name: one line on what the window is for, and its full guidance under it where there is one. */
export function WindowHelp({ entry, tab }: Readonly<{ entry: TableWindow; tab: PlayerTab }>) {
  const { description, help } = entry.player ? playerGuidance(entry.player, tab) : entry;
  const text = [description, help, PIN_HINT].filter(Boolean).join(' ');
  return text ? <HelpMark text={text} /> : null;
}

/** A window's content: as the panel laid it out, or in the windows' shared rhythm. */
/** The window's content under its title: a chat fills the window so its history scrolls and its composer stays in reach. */
export function WindowBody({ layout, children }: Readonly<{ layout: WindowLayout; children: ReactNode }>) {
  return (
    <div className={clsx(styles.body, layout === 'flush' && styles.bodyFlush, layout === 'fill' && styles.bodyFill)}>
      {layout === 'stack' ? <Stack gap="lg">{children}</Stack> : children}
    </div>
  );
}
