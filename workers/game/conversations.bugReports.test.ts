import { DatabaseSync } from 'node:sqlite';

import { expect, test } from 'vite-plus/test';

import type { BugReportBrowser } from '../../src/shared/play/bugReports';
import type { ActorDirectory } from './actors';
import { Conversations } from './conversations';

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
    snapshot: {},
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
    conversations: {
      pending: [{ request: { text: '-redacted message, original length: 22-' }, delivery: { state: 'failed' } }],
    },
  });
  expect(JSON.stringify(report)).not.toContain('Trade me two spice');
  expect(JSON.stringify(report)).not.toContain('Unsent private message');
});
