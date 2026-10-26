import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { ServerMessage } from '@shared/play/protocol';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import setup from '../setup/setup.json';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import { LocalConversations, REPLY_AFTER_MS } from './localConversations';
import { LocalTable } from './localTable';

/* The tutorial's chats answer: the learner's message is confirmed at once, and the player it went to replies by name. */
describe('a tutorial table’s conversations', () => {
  let table: LocalTable;
  let sent: ServerMessage[];
  let conversations: LocalConversations;
  const seats = () => table.room.snapshot.roster!.seats;
  const factionAt = (seat: string) => seats().find((entry) => entry.id === seat)!.faction!.id;
  const saved = () => sent.flatMap((message) => (message.type === 'conversation-message' ? [message] : []));

  beforeEach(() => {
    vi.useFakeTimers();
    table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    sent = [];
    conversations = new LocalConversations(
      () => table,
      (message) => sent.push(message)
    );
    conversations.learnerName = 'Norbert';
  });

  afterEach(() => {
    conversations.dispose();
    table.dispose();
    vi.useRealTimers();
  });

  test('the first other player answers the table chat', () => {
    const learner = factionAt(table.seat);
    conversations.receive({
      type: 'conversation-send',
      requestId: 'request-1',
      factionId: learner,
      peerId: TABLE_CONVERSATION,
      text: 'Hello all',
    });
    expect(saved().map(({ message }) => message.requestId)).toEqual(['request-1']);
    vi.advanceTimersByTime(REPLY_AFTER_MS);
    const reply = saved()[1]!;
    const first = seats().find((entry) => entry.faction && entry.faction.id !== learner)!;
    expect(reply).toMatchObject({ peerId: TABLE_CONVERSATION, factionId: learner });
    expect(reply.message).toMatchObject({
      senderFactionId: first.faction!.id,
      author: table.viewer(first.id).displayName,
      text: 'Hey, nice of you to message me, Norbert!',
    });
  });

  test('the player a message went to answers it in the pair’s own conversation, unread until read', () => {
    const learner = factionAt(table.seat);
    const peer = seats().find((entry) => entry.faction && entry.faction.id !== learner && entry.position > 2)!;
    conversations.receive({
      type: 'conversation-send',
      requestId: 'request-1',
      factionId: learner,
      peerId: peer.faction!.id,
      text: 'Ally?',
    });
    vi.advanceTimersByTime(REPLY_AFTER_MS);
    expect(saved()[1]).toMatchObject({ peerId: peer.faction!.id, message: { senderFactionId: peer.faction!.id } });
    const summary = () =>
      sent
        .findLast((message) => message.type === 'conversations')!
        .entries.find((entry) => entry.peerId === peer.faction!.id);
    expect(summary()).toMatchObject({ latest: 2, unread: 1 });
    conversations.receive({
      type: 'conversation-read',
      requestId: 'read-1',
      factionId: learner,
      peerId: peer.faction!.id,
      through: 2,
    });
    expect(summary()).toMatchObject({ latest: 2, unread: 0 });
    sent = [];
    conversations.receive({
      type: 'conversation-history',
      requestId: 'page-1',
      factionId: learner,
      peerId: peer.faction!.id,
      before: 99,
    });
    expect(sent[0]).toMatchObject({ type: 'conversation-history', more: false });
    expect(sent[0]!.type === 'conversation-history' && sent[0]!.entries.map((entry) => entry.text)).toEqual([
      'Ally?',
      'Hey, nice of you to message me, Norbert!',
    ]);
  });

  test('refuses a conversation the learner is not in', () => {
    conversations.receive({
      type: 'conversation-send',
      requestId: 'request-1',
      factionId: factionAt('seat-2'),
      peerId: TABLE_CONVERSATION,
      text: 'Hello',
    });
    expect(sent).toEqual([
      { type: 'rejected', requestId: 'request-1', message: 'This conversation is not available.' },
    ]);
  });
});
