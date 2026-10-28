import { Stack } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { helpLines } from '@ui/content/helpLines';
import { HelpMark } from '@ui/content/HelpMark';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext } from 'react';
import type { ReactNode } from 'react';

import type { TablePanel } from '../GameTable';
import { HAND_AND_SPICE_GUIDANCE } from '../multiplayer/panelGuidance';
import { PANEL_WINDOWS } from '../panels/panelWindows';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import styles from './Windows.module.css';

/** The one window that shows a faction's information, set on whichever faction was asked for. */
export const FACTION_INFO = PANEL_WINDOWS.factionInfo.key;

export type WindowLayout = 'stack' | 'flush' | 'fill';

/** One window the compass can open: a panel of the table's controls, the table chat, a player's chat, or the faction information. */
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
  /** The window's own buttons, in its title bar ahead of the frame's. */
  actions?: ReactNode;
  /** The player a chat window talks to. */
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
      layout: item.fill ? 'fill' : item.padding === false ? 'flush' : 'stack',
      peek: item.peek,
      actions: item.actions,
    }))
  );
}

/** Every window: the panels with Hand and Spice as one, then the table chat, a chat with each player, and the faction information. */
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
            ...HAND_AND_SPICE_GUIDANCE,
            content: (
              <>
                {spice.content}
                {hand.content}
              </>
            ),
          }
        : item
    );
  if (table?.tableChat) {
    windows.push({
      ...PANEL_WINDOWS.tableChat,
      group: 'Players',
      content: table.chat(TABLE_CONVERSATION),
      layout: 'fill',
    });
  }
  for (const player of table?.players.filter(chattable) ?? []) {
    windows.push({
      ...PANEL_WINDOWS.playerChat,
      key: `player:${player.seat}`,
      label: player.name,
      group: 'Players',
      content: null,
      layout: 'fill',
      player,
    });
  }
  if (table?.players.length) {
    windows.push({
      ...PANEL_WINDOWS.factionInfo,
      group: 'Players',
      content: null,
      layout: 'stack',
    });
  }
  return windows;
}

/** Another player the viewer can chat with, so they have a chat window. */
export function chattable(player: CompassPlayer) {
  return !player.own && player.canConverse;
}

/** The (?) beside a window's name: one line on what the window is for, and its full guidance under it where there is one. */
export function WindowHelp({ entry }: Readonly<{ entry: TableWindow }>) {
  const { description, help } = entry;
  const text = helpLines(description, help);
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
