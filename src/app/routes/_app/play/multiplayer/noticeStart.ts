import type { GameSnapshot } from '@shared/play/protocol';
import { reviewRunning } from '@shared/play/review';
import { useState } from 'react';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { actingFaction, stageInPlay } from './tableFactions';

/** The live table the soft notices compare later tables with, and the faction the viewer acts for at it (#2981). */
export type NoticeStart = Readonly<{ own: string; snapshot: GameSnapshot }>;

/*
 * The faction the viewer acts for, while the live table is set up or in play: no notices while a past table, a recall or another stage shows.
 * Nor while the connection is restored: the table shown then is the last one kept, perhaps from an earlier visit, so the fresh table that follows starts afresh rather than counting everything since as news.
 */
function noticedFaction(table: TableProjection): string | undefined {
  const stage = table.snapshot.stage;
  if (table.reconnecting || !(stage === 'setup' || stageInPlay(stage)) || reviewRunning(table.review?.current)) {
    return undefined;
  }
  return actingFaction(table);
}

/**
 * The first live table the viewer saw while acting for their faction, kept until that changes.
 * The table holds it outside the notices' own lazily loaded code, so what happens before that code arrives is still news.
 * It is the room's own table, not the viewer's pending drag of the movement order, so a turn the room never gave is never announced.
 */
export function useNoticeStart(table: TableProjection): NoticeStart | null {
  const own = noticedFaction(table);
  const [start, setStart] = useState<NoticeStart | null>(null);
  if (start?.own === own) {
    return start;
  }
  const next = own ? { own, snapshot: table.confirmedSnapshot ?? table.snapshot } : null;
  setStart(next);
  return next;
}
