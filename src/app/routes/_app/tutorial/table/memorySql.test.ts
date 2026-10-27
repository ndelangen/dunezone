import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, test } from 'vite-plus/test';

import { ActorDirectory } from '../../../../../../workers/game/actors';
import type { PublicLog } from '../../../../../../workers/game/log';
import { MemorySql } from './memorySql';

const UNLOGGED = { recordSeat: () => {} } as unknown as PublicLog;

/* SQLite hands out copies, so the Worker's classes may change a row they read; the tutorial's storage must behave the same. */
test('a player who leaves is recorded leaving the seat they held, not the spectator seat they moved to', () => {
  const sql = new MemorySql(
    [{ user_id: 'ada', seat: 'seat-2', display_name: 'Ada', deleted: 0, avatar_url: null, profile_slug: null }],
    [{ seat: 'seat-2', position: 0, faction_id: null, faction_name: null, faction_color: null }]
  );
  new ActorDirectory(sql.storage(), UNLOGGED).vacate('ada', { cause: 'departure' });
  expect(sql.seatHistory).toEqual([{ user_id: 'ada', seat: 'seat-2', event: 'vacated' }]);
  expect(sql.actors[0]!.seat).toBe(SPECTATOR_SEAT);
});
