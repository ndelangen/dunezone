import { TABLE_CONVERSATION } from '@shared/play/conversations';
import type { PieceAction, ServerMessage } from '@shared/play/protocol';
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

  test('confirms a message sent again without saving or answering it twice', () => {
    const request = {
      type: 'conversation-send' as const,
      requestId: 'request-1',
      factionId: factionAt(table.seat),
      peerId: TABLE_CONVERSATION,
      text: 'Hello all',
    };
    conversations.receive(request);
    conversations.receive(request);
    vi.advanceTimersByTime(REPLY_AFTER_MS);
    expect(saved().map(({ message }) => message.sequence)).toEqual([1, 1, 2]);
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

  test('recall chat is discarded on close and delayed replies cannot reopen it', () => {
    let sequence = 0;
    const act = (action: PieceAction, seat = table.seat) =>
      table.receive(
        { type: 'command', commandId: `recall-${++sequence}`, expectedRevision: table.room.snapshot.revision, action },
        seat
      );
    const begin = () => {
      act({ kind: 'review-propose', step: 0 });
      for (const seat of table.seats()) {
        const current = table.frame().snapshot.review!;
        if (seat !== table.seat && current.startedAt === null) {
          act({ kind: 'review-ballot', reviewId: current.id, choice: 'review' }, seat);
        }
      }
      conversations.authority();
      return `@recall:${table.frame().snapshot.review!.id}`;
    };
    const peerId = begin();
    const factionId = factionAt(table.seat);
    conversations.receive({
      type: 'conversation-send',
      requestId: 'temporary',
      factionId,
      peerId,
      text: 'This checkpoint',
    });
    expect(saved().at(-1)?.message.text).toBe('This checkpoint');
    conversations.receive({
      type: 'conversation-send',
      requestId: 'normal',
      factionId,
      peerId: TABLE_CONVERSATION,
      text: 'Wrong chat',
    });
    expect(sent.at(-1)).toMatchObject({ type: 'rejected', requestId: 'normal' });
    act({ kind: 'review-end', reviewId: table.frame().snapshot.review!.id });
    conversations.authority();
    const next = begin();
    sent = [];
    vi.advanceTimersByTime(REPLY_AFTER_MS);
    expect(saved()).toEqual([]);
    conversations.receive({ type: 'conversation-history', requestId: 'closed', factionId, peerId, before: 99 });
    expect(sent.at(-1)).toMatchObject({ type: 'rejected', requestId: 'closed' });
    conversations.receive({ type: 'conversation-history', requestId: 'fresh', factionId, peerId: next, before: 99 });
    expect(sent.at(-1)).toMatchObject({ type: 'conversation-history', entries: [] });
  });

  test('a chapter reset discards recall messages even when the new table reuses the recall ID', () => {
    let command = 0;
    const act = (action: PieceAction, seat = table.seat) =>
      table.receive(
        { type: 'command', commandId: `reset-${++command}`, expectedRevision: table.room.snapshot.revision, action },
        seat
      );
    const begin = () => {
      act({ kind: 'review-propose', step: 0 });
      for (const seat of table.seats()) {
        const review = table.frame().snapshot.review!;
        if (seat !== table.seat && review.startedAt === null) {
          act({ kind: 'review-ballot', reviewId: review.id, choice: 'review' }, seat);
        }
      }
      conversations.authority();
      return `@recall:${table.frame().snapshot.review!.id}`;
    };
    const peerId = begin();
    const factionId = factionAt(table.seat);
    conversations.receive({
      type: 'conversation-send',
      requestId: 'old-recall',
      factionId,
      peerId,
      text: 'Before reset',
    });
    table.dispose();
    table = new LocalTable(startAt(setup as unknown as TutorialSetup, 'turn-1-storm', 'https://dune.zone'));
    expect(begin()).toBe(peerId);
    sent = [];
    vi.advanceTimersByTime(REPLY_AFTER_MS);
    expect(saved()).toEqual([]);
    conversations.receive({ type: 'conversation-history', requestId: 'after-reset', factionId, peerId, before: 99 });
    expect(sent.at(-1)).toMatchObject({ type: 'conversation-history', entries: [] });
  });
});
