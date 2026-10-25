import { Stack } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { HelpMark } from '@ui/content/HelpMark';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext } from 'react';
import type { ReactNode } from 'react';

import type { PanelTab } from '../GameTable';
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

/** One window the compass can open: a dock tab, the table chat, or a player. */
export type TableWindow = Readonly<{
  key: string;
  label: string;
  group: string;
  topic: TopicIconTopic;
  /** One line on the window, as the search's hint. */
  description?: string;
  /** What the window is for, behind its (?); a player's depends on the tab shown. */
  help?: string;
  content: ReactNode;
  /** The content runs to the window's sides and insets its own text. */
  flush: boolean;
  player?: CompassPlayer;
}>;

/* The dock's tabs one by one: a tab with no children, or each child of a group. */
function tabWindows(tabs: readonly PanelTab[]): TableWindow[] {
  return tabs.flatMap((tab) =>
    (tab.subtabs ?? [tab]).map((item) => ({
      key: item.key,
      label: item.label,
      group: tab.label,
      topic: item.topic,
      description: item.description,
      help: item.description,
      content: item.content,
      flush: item.padding === false,
    }))
  );
}

/** Every window: the dock's tabs with Hand and Spice as one, then the table chat and each player. */
export function useTableWindows(tabs: readonly PanelTab[]): TableWindow[] {
  const table = useContext(CompassTableContext);
  const items = tabWindows(tabs);
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
            help: 'Your cards, leaders and spice reserve. Only you see them.',
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
      description: 'Everyone at the table',
      help: TABLE_CONVERSATION_GUIDANCE.description,
      content: table.render(TABLE_CONVERSATION, 'conversation'),
      flush: false,
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
      flush: false,
      player,
    });
  }
  return windows;
}

/* What a player's window is for: the conversation with them, their public details, or the viewer's own. */
function playerHelp(player: CompassPlayer, tab: PlayerTab): string {
  if (player.own) {
    return 'Your faction and seat, and any removal vote against you.';
  }
  return tab === 'conversation' && player.canConverse
    ? PLAYER_CONVERSATION_GUIDANCE.description
    : PLAYER_INFO_GUIDANCE.description;
}

/** The (?) beside a window's name, when the window has words for what it is for. */
export function WindowHelp({ entry, tab }: Readonly<{ entry: TableWindow; tab: PlayerTab }>) {
  const help = entry.player ? playerHelp(entry.player, tab) : entry.help;
  return help ? <HelpMark text={help} /> : null;
}

/** A window's content: as the tab laid it out, or in the dock's rhythm. */
export function WindowBody({ flush, children }: Readonly<{ flush: boolean; children: ReactNode }>) {
  return (
    <div className={clsx(styles.body, flush && styles.bodyFlush)}>
      {flush ? children : <Stack gap="lg">{children}</Stack>}
    </div>
  );
}
