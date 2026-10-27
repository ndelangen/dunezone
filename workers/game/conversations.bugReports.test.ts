import { DatabaseSync } from 'node:sqlite';

import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

import { homepageSnapshot } from '../../src/shared/homepage/setup';
import type { BugReportBrowser } from '../../src/shared/play/bugReports';
import type { ActorDirectory } from './actors';
import { Conversations } from './conversations';
import { RoomProjection, storedSnapshotSchema } from './state';

function conversationStore() {
  const database = new DatabaseSync(':memory:');
  const storage = {
    sql: {
      exec: (query: string, ...bindings: (string | number | null)[]) => {
        const statement = database.prepare(query);
        const rows = statement.columns().length ? statement.all(...bindings) : (statement.run(...bindings), []);
        return { toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() };
      },
    },
  } as unknown as DurableObjectStorage;
  return new Conversations(storage, {} as ActorDirectory);
}

test('exports message lengths, ordering and read positions without chat bodies or sender identities', () => {
  const conversations = conversationStore();
  conversations.save(
    {
      userId: 'private-account',
      displayName: 'Private author',
      connectionId: 'c',
      viewerSeat: 'seat-1',
      color: '#fff',
    },
    {
      type: 'conversation-send',
      requestId: 'request-one',
      factionId: 'atreides',
      peerId: 'fremen',
      text: 'Private words 🌙',
    },
    1234
  );
  conversations.read({
    type: 'conversation-read',
    requestId: 'read-one',
    factionId: 'atreides',
    peerId: 'fremen',
    through: 1,
  });
  expect(conversations.report()).toMatchObject({
    totalMessages: 1,
    omittedMessages: 0,
    messages: [
      { sequence: 1, request_id: 'request-one', saved_at: 1234, text: '-redacted message, original length: 15-' },
    ],
    reads: [{ faction: 'atreides', through: 1 }],
  });
  const exported = JSON.stringify(conversations.report());
  expect(exported).not.toContain('Private words');
  expect(exported).not.toContain('Private author');
  expect(exported).not.toContain('private-account');
});

test('censors a private message copied into browser console output and keeps delivery metadata', () => {
  const conversations = conversationStore();
  const snapshot = new RoomProjection('test-game').snapshot(
    storedSnapshotSchema.parse(homepageSnapshot('https://dune.zone'))
  );
  expect(snapshot.table.pieces.some((piece) => piece.items.some((item) => /^card-[a-f0-9]{64}$/u.test(item.id)))).toBe(
    true
  );
  conversations.save(
    { userId: 'u', displayName: 'Author', connectionId: 'c', viewerSeat: 'seat-1', color: '#fff' },
    {
      type: 'conversation-send',
      requestId: 'request-one',
      factionId: 'atreides',
      peerId: 'fremen',
      text: 'Trade me two spice',
    },
    1234
  );
  const browser: BugReportBrowser = {
    snapshot: z.json().parse(JSON.parse(JSON.stringify({ snapshot }))),
    conversations: {
      pending: [
        { request: { text: 'Unsent private message' }, delivery: { state: 'failed', error: 'No confirmation' } },
      ],
    },
    logs: [{ at: '10ms after navigation', level: 'log', text: 'received Trade me two spice' }],
    droppedLogs: 0,
    diagnostics: {
      clientRevision: 1,
      connection: 'authorized',
      viewport: [1280, 800],
      pixelRatio: 1,
      language: 'en',
      userAgent: 'test',
      online: true,
    },
  };
  const report = conversations.reportBrowser(browser);
  expect(report).toMatchObject({
    snapshot: {
      snapshot: {
        table: {
          pieces: snapshot.table.pieces.map((piece) => ({
            id: piece.id,
            items: piece.items.map((item) => ({ id: item.id })),
          })),
        },
      },
    },
    conversations: {
      pending: [{ request: { text: '-redacted message, original length: 22-' }, delivery: { state: 'failed' } }],
    },
  });
  expect(JSON.stringify(report)).not.toContain('Trade me two spice');
  expect(JSON.stringify(report)).not.toContain('Unsent private message');
});

test('scrubs overlapping saved and unsent chat together, including credential-filtered console copies', () => {
  const conversations = conversationStore();
  const viewer = { userId: 'u', displayName: 'Author', connectionId: 'c', viewerSeat: 'seat-1', color: '#fff' };
  for (const [index, text] of ['hi', 'hi there', 'email me at person@example.com'].entries()) {
    conversations.save(
      viewer,
      {
        type: 'conversation-send',
        requestId: `request-${index}`,
        factionId: 'atreides',
        peerId: 'fremen',
        text,
      },
      1234 + index
    );
  }
  const report = conversations.reportBrowser({
    snapshot: {},
    conversations: { pending: [{ request: { text: 'hi there again' }, delivery: { state: 'failed' } }] },
    logs: [
      {
        at: '10ms after navigation',
        level: 'log',
        text: 'received hi there again; saved hi there; email me at [redacted email]',
      },
    ],
    droppedLogs: 0,
    diagnostics: {
      clientRevision: 1,
      connection: 'authorized',
      viewport: [1280, 800],
      pixelRatio: 1,
      language: 'en',
      userAgent: 'test',
      online: true,
    },
  });
  expect(report).toMatchObject({
    logs: [
      {
        text: 'received -redacted message, original length: 14-; saved -redacted message, original length: 8-; -redacted message, original length: 30-',
      },
    ],
    conversations: {
      pending: [{ request: { text: '-redacted message, original length: 14-' }, delivery: { state: 'failed' } }],
    },
  });
});
