import { Stack } from '@mantine/core';
import { TABLE_CONVERSATION } from '@shared/play/conversations';
import { helpLines } from '@ui/content/helpLines';
import { HelpMark } from '@ui/content/HelpMark';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import clsx from 'clsx';
import { useContext } from 'react';
import type { ReactNode } from 'react';

import { HAND_AND_SPICE_GUIDANCE } from '../panels/panelGuidance';
import { PANEL_INFO } from '../panels/panelInfo';
import type { TablePanel } from '../table/GameTable';
import { CompassTableContext } from './compassTable';
import type { CompassPlayer } from './compassTable';
import styles from './Panels.module.css';

/** The one panel that shows a faction's information, set on whichever faction was asked for. */
export const FACTION_INFO = PANEL_INFO.factionInfo.key;

/** The keyboard shortcuts cheat sheet, which ? and the bar's key button show and hide. */
export const KEYBOARD_SHORTCUTS = PANEL_INFO.shortcuts.key;

export type PanelLayout = 'stack' | 'flush' | 'fill';

/** One panel the compass can open: a panel of the table's controls, the table chat, a player's chat, or the faction information. */
export type CompassPanel = Readonly<{
  key: string;
  label: string;
  group: string;
  topic: TopicIconTopic;
  /** One line on the panel, as the search's hint. */
  description?: string;
  /** The panel's full guidance, behind its (?) under the description. */
  help?: string;
  /** Further words the search finds the panel by, beside its name. */
  keywords?: string;
  content: ReactNode;
  /** How the content sits in the panel: stacked and padded, flush to the panel's sides, or filling the panel as a chat does. */
  layout: PanelLayout;
  /** The content may peek over the panel's top edge, as the Battle plan's cards do; it then scrolls its own parts. */
  peek?: boolean;
  /** The panel's own buttons, in its title bar ahead of the frame's. */
  actions?: ReactNode;
  /** The player a chat panel talks to. */
  player?: CompassPlayer;
}>;

/* The panels one by one: a panel outside any group, or each panel of a group. */
function flatPanels(panels: readonly TablePanel[]): CompassPanel[] {
  return panels.flatMap((group) =>
    (group.panels ?? [group]).map((item) => ({
      key: item.key,
      label: item.label,
      group: group.label,
      topic: item.topic,
      description: item.description,
      help: item.help,
      keywords: item.keywords,
      content: item.content,
      layout: item.fill ? 'fill' : item.padding === false ? 'flush' : 'stack',
      peek: item.peek,
      actions: item.actions,
    }))
  );
}

/** Every panel: the panels with Hand and Spice as one, then the table chat, a chat with each player, and the faction information. */
export function useCompassPanels(panels: readonly TablePanel[]): CompassPanel[] {
  const table = useContext(CompassTableContext);
  const items = flatPanels(panels);
  const hand = items.find((item) => item.key === 'hand');
  const spice = items.find((item) => item.key === 'spice');
  const openable: CompassPanel[] = items
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
  if (table?.recall) {
    return openable;
  }
  if (table?.tableChat) {
    openable.push({
      ...PANEL_INFO.tableChat,
      group: 'Players',
      content: table.chat(TABLE_CONVERSATION),
      layout: 'fill',
      actions: table.clearChat?.(TABLE_CONVERSATION),
    });
  }
  for (const player of table?.players.filter(chattable) ?? []) {
    openable.push({
      ...PANEL_INFO.playerChat,
      key: `player:${player.seat}`,
      label: player.name,
      group: 'Players',
      content: null,
      layout: 'fill',
      actions: table?.clearChat?.(player.seat),
      player,
    });
  }
  if (table?.players.length) {
    openable.push({
      ...PANEL_INFO.factionInfo,
      group: 'Players',
      content: null,
      layout: 'stack',
    });
  }
  return openable;
}

/** Another player the viewer can chat with, so they have a chat panel. */
export function chattable(player: CompassPlayer) {
  return !player.own && player.canConverse;
}

/** The (?) beside a panel's name: one line on what the panel is for, and its full guidance under it where there is one. */
export function PanelHelp({ description, help }: Readonly<Pick<CompassPanel, 'description' | 'help'>>) {
  const text = helpLines(description, help);
  return text ? <HelpMark text={text} /> : null;
}

/** A panel's content: as the panel laid it out, or in the panels' shared rhythm. */
/** The panel's content under its title: a chat fills the panel so its history scrolls and its composer stays in reach. */
export function PanelBody({ layout, children }: Readonly<{ layout: PanelLayout; children: ReactNode }>) {
  return (
    <div className={clsx(styles.body, layout === 'flush' && styles.bodyFlush, layout === 'fill' && styles.bodyFill)}>
      {layout === 'stack' ? <Stack gap="lg">{children}</Stack> : children}
    </div>
  );
}
