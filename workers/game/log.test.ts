/// <reference types="node/sqlite" />
import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { PublicLog } from './log';
import type { StoredSnapshot } from './state';

/* The part of Durable Object storage the log uses, over an in-memory SQLite database. */
function memoryStorage() {
  const database = new DatabaseSync(':memory:');
  return {
    sql: {
      exec: (query: string, ...bindings: (string | number | null)[]) => {
        const statement = database.prepare(query);
        const rows = /^\s*SELECT/i.test(query) ? statement.all(...bindings) : (statement.run(...bindings), []);
        return { toArray: () => rows };
      },
    },
  } as unknown as DurableObjectStorage;
}

const viewer = { userId: 'user-alice', displayName: 'Alice', connectionId: 'c', viewerSeat: 'seat-1', color: '#fff' };

/* A table in play whose two factions carry names a person could publish, braces included. */
function snapshot(revision: number, extra: Partial<StoredSnapshot> = {}) {
  return {
    stage: 'play',
    phase: 1,
    revision,
    battleResults: [],
    privatePredictions: {},
    roster: {
      seats: [
        { seat: 'seat-1', faction: { id: 'house', name: 'House {0}' } },
        { seat: 'seat-2', faction: { id: 'fremen', name: 'Fremen {1}' } },
      ],
    },
    ...extra,
  } as unknown as StoredSnapshot;
}

describe('the public log', () => {
  it('keeps the braces in a faction name instead of reading them as player slots', () => {
    const log = new PublicLog(memoryStorage(), () => 'Turn 1');
    log.enabled = true;
    const message = { type: 'command', action: { kind: 'battle-reveal' } } as never;
    log.recordCommit({
      before: snapshot(1),
      next: snapshot(2, {
        battleResults: [{ id: 'b', revision: 2, outcome: 'left', factions: ['house', 'fremen'] }],
      } as never),
      message,
      viewer: viewer as never,
    });
    log.recordCommit({
      before: snapshot(2),
      next: snapshot(3),
      message,
      viewer: viewer as never,
      transfer: { kind: 'withdrawal', amount: 3, source: 'fremen', revision: 3 } as never,
    });
    expect(log.page('game', Number.MAX_SAFE_INTEGER).entries.map((entry) => entry.text)).toEqual([
      'Alice withdrew 3 spice from the Fremen {1} bank to the table.',
      'House {0} defeated Fremen {1}.',
    ]);
  });
});
