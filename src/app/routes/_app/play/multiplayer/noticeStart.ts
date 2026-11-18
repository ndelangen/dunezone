import type { GameSnapshot } from '@shared/play/protocol';
import { reviewRunning } from '@shared/play/review';
import { useContext, useEffect, useRef, useState } from 'react';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { CompassEpochContext } from '../compass/compassEpoch';
import { actingFaction, stageInPlay } from './tableFactions';

/**
 * The live table the soft notices compare later tables with, and the faction the viewer acts for at it (#2981).
 * `epoch` is the tutorial run it belongs to: a reset starts the notices afresh.
 */
export type NoticeStart = Readonly<{ own: string; snapshot: GameSnapshot; epoch: number }>;

/** The table last shown with the viewer's own drag of the movement order still pending, or null when none was. */
export type ShownTable = Readonly<{ current: GameSnapshot | null }>;

/**
 * Keeps the table as last shown while the viewer's own drag of the movement order waited for the room, from the first render on,
 * outside the notices' own lazily loaded code, so a drag made before it arrives still counts as seen.
 * Only the viewer's own pending drag is kept: a reorder another player made was never shown ahead of the room, so it stays news.
 * Updated after the notices' own effects, so while they compare a change it still holds the table shown before it.
 */
export function useShownTable(table: TableProjection): ShownTable {
  const shown = useRef<GameSnapshot | null>(null);
  const pending = table.confirmedSnapshot ? table.snapshot : null;
  useEffect(() => {
    shown.current = pending;
  }, [pending]);
  return shown;
}

/*
 * The faction the viewer acts for, while the live table is set up or in play: no notices while a past table, a recall or another stage shows.
 * Nor while the connection is restored: the table shown then is the last one kept, perhaps from an earlier visit, so the fresh table that follows starts afresh rather than counting everything since as news.
 */
function noticedFaction(table: TableProjection): string | undefined {
  const stage = table.snapshot.stage;
  const live = !table.reconnecting && !reviewRunning(table.review?.current);
  return live && (stage === 'setup' || stageInPlay(stage)) ? actingFaction(table) : undefined;
}

/**
 * The first live table the viewer saw while acting for their faction, kept until that changes.
 * The table holds it outside the notices' own lazily loaded code, so what happens before that code arrives is still news.
 * It is the room's own table, not the viewer's pending drag of the movement order, so a turn the room never gave is never announced.
 */
export function useNoticeStart(table: TableProjection): NoticeStart | null {
  const own = noticedFaction(table);
  const epoch = useContext(CompassEpochContext);
  const [start, setStart] = useState<NoticeStart | null>(null);
  if (start === null ? own === undefined : start.own === own && start.epoch === epoch) {
    return start;
  }
  const next = own ? { own, snapshot: table.confirmedSnapshot ?? table.snapshot, epoch } : null;
  setStart(next);
  return next;
}
