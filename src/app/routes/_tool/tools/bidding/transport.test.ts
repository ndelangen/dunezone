import {
  BIDDING_CODE_ALPHABET,
  BIDDING_PROTOCOL_VERSION,
  BIDDING_REFUSED,
  BIDDING_REPLACED,
} from '@shared/tools/biddingTransport';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { BiddingLink, createBiddingDevice, createBiddingTable } from './transport';

class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number; reason: string }) => void;
  constructor(readonly url: URL) {
    Socket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.remoteClose(1000);
  }
  remoteClose(code: number, reason = 'connection closed') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}
class Channel {
  readyState = 'connecting';
  bufferedAmount = 0;
  sent: string[] = [];
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  send(data: string) {
    this.sent.push(data);
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
  close() {
    this.readyState = 'closed';
    this.onclose?.();
  }
}
class Peer {
  static all: Peer[] = [];
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription?: { sdp: string; type: string };
  channel = new Channel();
  onconnectionstatechange?: () => void;
  constructor() {
    Peer.all.push(this);
  }
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'test-offer' };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
  }
  async setRemoteDescription() {
    this.channel.open();
  }
  close() {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }
}
const tableId = crypto.randomUUID();
const centralConnectionId = crypto.randomUUID();
let link: BiddingLink | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  Socket.all = [];
  Peer.all = [];
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('location', { href: 'https://dune.zone/tools/bidding' });
});
afterEach(() => {
  link?.close();
  link = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function linked() {
  const message = vi.fn();
  const state = vi.fn();
  const device = createBiddingDevice();
  link = new BiddingLink({
    address: { code: 'DUNE42', tableId },
    role: 'remote',
    device,
    onMessage: message,
    onState: state,
  });
  const socket = Socket.all[0]!;
  socket.open();
  socket.receive({ type: 'welcome', tableId, connectionId: crypto.randomUUID(), centralConnectionId, remotes: [] });
  await vi.advanceTimersByTimeAsync(0);
  const offer = JSON.parse(socket.sent.at(-1)!).packet;
  socket.receive({
    type: 'relay',
    from: 'central',
    connectionId: centralConnectionId,
    packet: { kind: 'answer', negotiationId: offer.negotiationId, sdp: 'test-answer' },
  });
  await vi.advanceTimersByTimeAsync(0);
  return { link, socket, channel: Peer.all[0]!.channel, message, state, device };
}

test('keeps the direct path when the relay drops and never places credentials in its URL', async () => {
  const held = await linked();
  expect(held.socket.url.href).toBe('wss://dune.zone/__play/bidding/DUNE42/socket');
  expect(JSON.parse(held.socket.sent[0]!).device).toEqual(held.device);
  expect(JSON.parse(held.socket.sent[0]!).protocol).toBe(BIDDING_PROTOCOL_VERSION);
  held.socket.remoteClose(1006);
  expect(held.link.state).toMatchObject({ relay: false, central: true, direct: ['central'] });
  expect(held.link.send('central', { commandId: 'bid-on-direct' })).toBe(true);
  expect(JSON.parse(held.channel.sent[0]!)).toEqual({ kind: 'app', data: { commandId: 'bid-on-direct' } });
  await vi.advanceTimersByTimeAsync(500);
  const reconnected = Socket.all[1]!;
  reconnected.open();
  reconnected.receive({
    type: 'welcome',
    tableId,
    connectionId: crypto.randomUUID(),
    centralConnectionId: null,
    remotes: [],
  });
  expect(held.link.state).toMatchObject({ relay: true, central: true, direct: ['central'] });
  expect(held.link.send('central', { commandId: 'central-still-offline' })).toBe(true);
  expect(JSON.parse(held.channel.sent.at(-1)!)).toMatchObject({ data: { commandId: 'central-still-offline' } });
});

test.each([BIDDING_REPLACED, BIDDING_REFUSED])(
  'fences a displaced or refused connection and never retries it, code %d',
  async (code) => {
    const held = await linked();
    held.socket.remoteClose(code);
    expect(held.channel.readyState).toBe('closed');
    expect(held.link.send('central', { commandId: 'late' })).toBe(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(Socket.all).toHaveLength(1);
    expect(held.link.state.status).toBe(code === BIDDING_REPLACED ? 'replaced' : 'refused');
    held.channel.onmessage?.({ data: JSON.stringify({ kind: 'app', data: 'stale' }) });
    expect(held.message).not.toHaveBeenCalled();
  }
);

test('reports a protocol refresh refusal and closes a previously healthy direct connection', async () => {
  const held = await linked();
  const reason = 'Refresh this phone to use the updated bidding table.';
  held.socket.remoteClose(BIDDING_REFUSED, reason);
  expect(held.link.state).toMatchObject({ status: 'refused', reason, direct: [] });
  expect(held.channel.readyState).toBe('closed');
  await vi.advanceTimersByTimeAsync(600_000);
  expect(Socket.all).toHaveLength(1);
});

test('delivers a large copy only after every ordered chunk arrives and drops an incomplete copy', async () => {
  const held = await linked();
  const data = { complete: '🌵'.repeat(45_000) };
  expect(held.link.send('central', data)).toBe(true);
  expect(held.channel.sent.length).toBeGreaterThan(1);
  for (const frame of held.channel.sent.slice(0, -1)) {
    held.channel.onmessage?.({ data: frame });
  }
  expect(held.message).not.toHaveBeenCalled();
  held.channel.onmessage?.({ data: held.channel.sent.at(-1)! });
  expect(held.message).toHaveBeenCalledExactlyOnceWith('central', data);
  held.message.mockClear();
  held.channel.onmessage?.({ data: held.channel.sent[0]! });
  await vi.advanceTimersByTimeAsync(5001);
  for (const frame of held.channel.sent.slice(1)) {
    held.channel.onmessage?.({ data: frame });
  }
  expect(held.message).not.toHaveBeenCalled();
  expect(held.link.send('central', '🌵'.repeat(70_000))).toBe(false);
});

test('ignores messages from a previous central connection and malformed direct frames', async () => {
  const held = await linked();
  held.socket.receive({
    type: 'relay',
    from: 'central',
    connectionId: crypto.randomUUID(),
    packet: { kind: 'app', data: 'stale' },
  });
  held.channel.onmessage?.({ data: '{broken' });
  held.channel.onmessage?.({
    data: JSON.stringify({ kind: 'chunk', id: crypto.randomUUID(), part: 100, total: 1, data: '{}' }),
  });
  expect(held.message).not.toHaveBeenCalled();
  held.socket.receive({
    type: 'relay',
    from: 'central',
    connectionId: centralConnectionId,
    packet: { kind: 'app', data: 'current' },
  });
  expect(held.message).toHaveBeenCalledExactlyOnceWith('central', 'current');
});

test('retries a code collision without replacing its owner', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 409 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
  const address = await createBiddingTable();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(address).toMatchObject({
    tableId: expect.any(String),
    centralSecret: expect.stringMatching(/^[a-f0-9]{64}$/),
    code: expect.stringMatching(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/),
  });
  expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body);
});

test('rejects random bytes 248 through 255 so every join-code symbol has eight accepted byte values', async () => {
  const bytes = [248, 249, 250, 251, 252, 253, 254, 255, ...Array.from({ length: 248 }, (_, byte) => byte), 0, 1, 2, 3];
  let consumed = 0;
  vi.stubGlobal('crypto', {
    randomUUID: crypto.randomUUID.bind(crypto),
    getRandomValues(array: Uint8Array) {
      if (array.length === 32) {
        return array.fill(0xa5);
      }
      for (let index = 0; index < array.length; index++) {
        expect(consumed).toBeLessThan(bytes.length);
        array[index] = bytes[consumed++]!;
      }
      return array;
    },
  });
  const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
  const codes: string[] = [];
  for (let index = 0; index < 42; index++) {
    const address = await createBiddingTable();
    expect(address.centralSecret).toBe('a5'.repeat(32));
    codes.push(address.code);
  }
  expect(codes.every((code) => code.length === 6)).toBe(true);
  expect(codes.join('')).toBe(BIDDING_CODE_ALPHABET.repeat(8) + BIDDING_CODE_ALPHABET.slice(0, 4));
  expect(consumed).toBe(bytes.length);
  expect(fetcher).toHaveBeenCalledTimes(42);
});
