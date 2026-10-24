import { Stack } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext } from 'react';
import type { ReactNode } from 'react';

import type { PanelTab } from '../GameTable';
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
  description?: string;
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

/** A window's content: as the tab laid it out, or in the dock's rhythm. */
export function WindowBody({ flush, children }: Readonly<{ flush: boolean; children: ReactNode }>) {
  return (
    <div className={clsx(styles.body, flush && styles.bodyFlush)}>
      {flush ? children : <Stack gap="lg">{children}</Stack>}
    </div>
  );
}
