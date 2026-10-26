import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { clientMessageSchema } from '../../src/shared/play/protocol';
import type { ClientMessage } from '../../src/shared/play/protocol';
import { draftingRuntime } from './native-drafting.fixture.ts';
import { messageOf } from './native-runtime.fixture.ts';
import type { NativeMessage } from './native-runtime.fixture.ts';
import type { NativeView, NativeConnection } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, seat, syncView } from './native-runtime.fixture.ts';

describe('Faction conversations in the game database', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix: string) => admitPlayer(runtime, suffix);
  async function setup() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    for (const player of [a, b]) {
      await accepted(player, { kind: 'draft-ready' as const, ready: true });
    }
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    for (const player of [a, b]) {
      const view = await syncView(player);
      await accepted(player, {
        kind: 'swap-ready' as const,
        ready: true,
        round: required(view.snapshot.swapping).round,
        seat: view.viewer.viewerSeat,
      });
    }
    const view = await syncView(a);
    expect(view.snapshot.stage).toBe('setup');
    const faction = (playerView: NativeView) =>
      required(
        required(required(playerView.snapshot.roster).seats.find((entry) => entry.id === playerView.viewer.viewerSeat))
          .faction
      ).id;
    return { a, b, aId: faction(view), bId: faction(await syncView(b)) };
  }
  type ConversationRequest = Extract<
    ClientMessage,
    { type: 'conversation-send' | 'conversation-history' | 'conversation-read' }
  >;
  type RequestInput<K extends ConversationRequest['type']> = Omit<
    Extract<ConversationRequest, { type: K }>,
    'requestId'
  > & { requestId?: string };
  async function request<K extends ConversationRequest['type']>(player: NativeConnection, message: RequestInput<K>) {
    const offset = player.messages.length;
    const requestId = message.requestId ?? randomUUID();
    player.send(clientMessageSchema.parse({ ...message, requestId }));
    type Reply = Extract<
      NativeMessage,
      {
        type: K extends 'conversation-send'
          ? 'conversation-message' | 'rejected'
          : K extends 'conversation-history'
            ? 'conversation-history' | 'rejected'
            : 'rejected';
      }
    >;
    return eventually(
      () =>
        player.messages
          .slice(offset)
          .find(
            (entry): entry is Reply =>
              (entry.type === 'rejected' && entry.requestId === requestId) ||
              (entry.type === 'conversation-history' && entry.requestId === requestId) ||
              (entry.type === 'conversation-message' && entry.message.requestId === requestId)
          ),
      'conversation response'
    );
  }
  const page = (player: NativeConnection, factionId: string, peerId: string, before = Number.MAX_SAFE_INTEGER) =>
    request<'conversation-history'>(player, { type: 'conversation-history' as const, factionId, peerId, before });
  const send = (
    player: NativeConnection,
    factionId: string,
    peerId: string,
    text = 'Private plans',
    requestId?: string
  ) => request<'conversation-send'>(player, { type: 'conversation-send' as const, factionId, peerId, text, requestId });

  it('delivers table talk to every seated faction and never to an observer', async () => {
    const { a, b, aId, bId } = await setup();
    const observer = await admit('observer');
    const offset = b.messages.length;
    const sent = await send(a, aId, '@table', 'Who is bidding?');
    expect(sent).toMatchObject({ type: 'conversation-message' as const, peerId: '@table' });
    const delivered = await eventually(
      () =>
        b.messages
          .slice(offset)
          .find(
            (entry): entry is Extract<NativeMessage, { type: 'conversation-message' }> =>
              entry.type === 'conversation-message'
          ),
      'table message'
    );
    expect(delivered).toMatchObject({ factionId: bId, peerId: '@table', message: { text: 'Who is bidding?' } });
    /* A retry is confirmed to its sender only; the other members already have the message. */
    const retried = await send(
      a,
      aId,
      '@table',
      'Who is bidding?',
      messageOf(sent, 'conversation-message').message.requestId
    );
    expect(messageOf(retried, 'conversation-message').message).toEqual(messageOf(sent, 'conversation-message').message);
    /* A later message reaches B after anything the retry would have sent, so B's frames are complete once it arrives. */
    await send(a, aId, '@table', 'Then I bid 2.');
    const texts = () =>
      b.messages
        .slice(offset)
        .filter(
          (entry): entry is Extract<NativeMessage, { type: 'conversation-message' }> =>
            entry.type === 'conversation-message'
        )
        .map((entry) => entry.message.text);
    await eventually(() => texts().includes('Then I bid 2.'), 'later table message');
    expect(texts()).toEqual(['Who is bidding?', 'Then I bid 2.']);
    expect(messageOf(await page(b, bId, '@table'), 'conversation-history').entries.map((entry) => entry.text)).toEqual([
      'Who is bidding?',
      'Then I bid 2.',
    ]);
    expect(observer.messages.filter((entry) => entry.type.startsWith('conversation'))).toEqual([]);
    expect((await page(observer, aId, '@table')).type).toBe('rejected');
  });

  it('opens at setup, saves once, retains every page through visits and cold restore, and stays out of public deliveries', async () => {
    const drafting = await admit('a');
    expect((await send(drafting, 'atreides', 'harkonnen')).type).toBe('rejected');
    const { a, b, aId, bId } = await setup();
    const observer = await admit('observer');
    const first = await send(a, aId, bId, 'Private plans', 'one-message');
    expect(first.type).toBe('conversation-message');
    expect((await send(a, aId, bId, 'Private plans', 'one-message')).message).toEqual(
      messageOf(first, 'conversation-message').message
    );
    expect((await send(a, aId, bId, 'Changed plans', 'one-message')).type).toBe('rejected');
    for (let index = 0; index < 53; index++) {
      await send(a, aId, bId, `Retained ${index}`);
    }
    const recent = await page(b, bId, aId);
    expect(messageOf(recent, 'conversation-history').entries).toHaveLength(50);
    expect(messageOf(recent, 'conversation-history').more).toBe(true);
    const earlier = await page(b, bId, aId, messageOf(recent, 'conversation-history').entries[0].sequence);
    expect(messageOf(earlier, 'conversation-history').entries).toHaveLength(4);
    expect(messageOf(earlier, 'conversation-history').more).toBe(false);
    expect(messageOf(earlier, 'conversation-history').entries[0]).toEqual(
      messageOf(first, 'conversation-message').message
    );
    expect(JSON.stringify(await syncView(b))).not.toContain('Private plans');
    expect(observer.messages.filter((entry) => entry.type.startsWith('conversation'))).toEqual([]);
    expect((await page(observer, aId, bId)).type).toBe('rejected');
    expect((await page(a, bId, aId)).type).toBe('rejected');
    expect((await page(a, aId, 'guessed-faction')).type).toBe('rejected');
    expect(JSON.stringify(await runtime.exec<{ data: string }>('SELECT data FROM history'))).not.toContain(
      'Private plans'
    );
    expect(JSON.stringify(await runtime.exec<{ data: string }>('SELECT data FROM current_state'))).not.toContain(
      'Private plans'
    );
    await runtime.restart();
    expect(messageOf(await page(await admit('b'), bId, aId), 'conversation-history').entries).toEqual(
      messageOf(recent, 'conversation-history').entries
    );
    expect(
      messageOf(
        await page(await admit('b'), bId, aId, messageOf(recent, 'conversation-history').entries[0].sequence),
        'conversation-history'
      ).entries
    ).toEqual(messageOf(earlier, 'conversation-history').entries);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM conversation_messages')).toEqual([{ count: 54 }]);
  });

  it('delivers conversation messages to a tab that admits and syncs without asking for them', async () => {
    const { a, aId, bId } = await setup();
    const tab = await admit('b');
    await syncView(tab);
    const sent = await send(a, aId, bId, 'Plans for every tab', 'every-tab');
    /* The room answers in order, so a view asked for after the send arrives behind anything the send pushed. */
    await syncView(tab);
    expect(
      tab.messages.find(
        (entry): entry is Extract<NativeMessage, { type: 'conversation-message' }> =>
          entry.type === 'conversation-message'
      )
    ).toEqual({
      type: 'conversation-message' as const,
      factionId: bId,
      peerId: aId,
      message: messageOf(sent, 'conversation-message').message,
      serverNow: expect.any(Number),
    });
    expect(
      tab.messages.findLast(
        (entry): entry is Extract<NativeMessage, { type: 'conversations' }> => entry.type === 'conversations'
      )
    ).toMatchObject({ factionId: bId });
  });

  it('sends summaries with an update only when they changed, and with every view', async () => {
    const { a, b } = await setup();
    const piece = required((await syncView(a)).snapshot.table.pieces.find((entry) => !entry.inventory));
    const offset = b.messages.length;
    await accepted(a, { kind: 'lock' as const, pieceId: piece.id });
    const view = b.messages.lastIndexOf(await syncView(b));
    const summaries = (from: number, to?: number) =>
      b.messages.slice(from, to).filter((entry) => entry.type === 'conversations');

    expect(b.messages.slice(offset, view).some((entry) => entry.type === 'update' && entry.snapshot)).toBe(true);
    expect(summaries(offset, view)).toEqual([]);
    await eventually(() => summaries(view).length === 1 || undefined, 'summaries with the view');
  });

  it('revokes former owners before retry lookup and gives replacements the full faction conversation', async () => {
    const { a, b, aId, bId } = await setup();
    const saved = await send(b, bId, aId, 'Inherited message', 'old-owner');
    const oldSeat = (await syncView(b)).viewer.viewerSeat;
    await accepted(b, { kind: 'seat-depart' as const });
    expect((await send(b, bId, aId, 'Inherited message', 'old-owner')).type).toBe('rejected');
    expect((await page(b, bId, aId)).type).toBe('rejected');
    const c = await admit('c');
    await seat(c, a, oldSeat);
    expect(messageOf(await page(c, bId, aId), 'conversation-history').entries).toEqual([
      messageOf(saved, 'conversation-message').message,
    ]);
    const offset = b.messages.length;
    await send(a, aId, bId, 'Only the replacement sees this');
    await syncView(b);
    expect(JSON.stringify(b.messages.slice(offset))).not.toContain('Only the replacement sees this');
    await send(c, bId, aId, 'A new owner may use its own receipt', 'old-owner');
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM conversation_messages')).toEqual([{ count: 3 }]);
  });

  it('keeps unread until an endpoint marks a saved position, without exposing a recipient read receipt', async () => {
    const { a, b, aId, bId } = await setup();
    const first = await send(a, aId, bId);
    await page(b, bId, aId);
    await syncView(b);
    expect(
      required(
        required(
          b.messages
            .filter(
              (entry): entry is Extract<NativeMessage, { type: 'conversations' }> => entry.type === 'conversations'
            )
            .at(-1)
        ).entries.find((entry) => entry.peerId === aId)
      ).unread
    ).toBe(1);
    const offset = a.messages.length;
    b.send({
      type: 'conversation-read' as const,
      requestId: 'read-one',
      factionId: bId,
      peerId: aId,
      through: messageOf(first, 'conversation-message').message.sequence,
    });
    await syncView(b);
    expect(
      required(
        required(
          b.messages
            .filter(
              (entry): entry is Extract<NativeMessage, { type: 'conversations' }> => entry.type === 'conversations'
            )
            .at(-1)
        ).entries.find((entry) => entry.peerId === aId)
      ).unread
    ).toBe(0);
    /* A view that a asks for after the read arrives behind anything the read pushed to a. */
    await syncView(a);
    expect(a.messages.slice(offset).filter((entry) => entry.type.startsWith('conversation'))).toEqual([]);
    expect(
      (
        await request<'conversation-read'>(b, {
          type: 'conversation-read' as const,
          factionId: bId,
          peerId: aId,
          through: 999_999,
        })
      ).type
    ).toBe('rejected');
  });

  it('rolls failed saves back and redacts deleted authors in retained messages before restore', async () => {
    const { a, b, aId, bId } = await setup();
    await runtime.exec(
      "CREATE TRIGGER refuse_message BEFORE INSERT ON conversation_messages BEGIN SELECT RAISE(ABORT,'save failure'); END"
    );
    expect((await send(a, aId, bId, 'Retryable', 'retry')).type).toBe('rejected');
    expect(messageOf(await page(b, bId, aId), 'conversation-history').entries).toEqual([]);
    await runtime.exec('DROP TRIGGER refuse_message');
    await send(a, aId, bId, 'Retryable', 'retry');
    expect(
      (
        await runtime.fetch('/__play/games/fixture-game/account-deletion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: 'fixture-game',
            secret: 'a'.repeat(64),
            userId: 'user-a',
            eventId: 'delete-a',
            deletionOperationId: 'operation-a',
          }),
        })
      ).status
    ).toBe(200);
    const retained = await page(b, bId, aId);
    expect(messageOf(retained, 'conversation-history').entries[0].author).toBe('[deleted user]');
    expect(JSON.stringify(await runtime.exec('SELECT * FROM conversation_messages'))).not.toMatch(/Synthetic A|user-a/);
    await runtime.restart();
    expect(messageOf(await page(await admit('b'), bId, aId), 'conversation-history').entries).toEqual(
      messageOf(retained, 'conversation-history').entries
    );
  });
});
