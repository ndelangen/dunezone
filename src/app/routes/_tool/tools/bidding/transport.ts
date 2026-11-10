import {
  BIDDING_CODE_ALPHABET,
  BIDDING_FRAME_BYTES,
  BIDDING_PING,
  BIDDING_PONG,
  BIDDING_REFUSED,
  BIDDING_REPLACED,
  biddingCodeSchema,
  biddingDirectFrameSchema,
  biddingFrameFits,
  biddingPacketSchema,
  biddingPath,
  biddingServerFrameSchema,
} from '@shared/tools/biddingTransport';
import type {
  BiddingClientFrame,
  BiddingDevice,
  BiddingPacket,
  BiddingRole,
  BiddingServerFrame,
  BiddingTableAddress,
} from '@shared/tools/biddingTransport';

const secret = () =>
  [...crypto.getRandomValues(new Uint8Array(32))].map((n) => n.toString(16).padStart(2, '0')).join('');
export function createBiddingDevice(): BiddingDevice {
  return { id: crypto.randomUUID(), secret: secret() };
}

/** Reserves a new code without replacing any table already using it. */
export async function createBiddingTable(options: { signal?: AbortSignal } = {}): Promise<BiddingTableAddress> {
  const identity = { tableId: crypto.randomUUID(), centralSecret: secret() };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = [...crypto.getRandomValues(new Uint8Array(6))]
      .map((n) => BIDDING_CODE_ALPHABET[n % BIDDING_CODE_ALPHABET.length])
      .join('');
    const response = await fetch(biddingPath(code, 'create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(identity),
      signal: options.signal,
    });
    await response.body?.cancel();
    if (response.ok) {
      return { code, ...identity };
    }
    if (response.status === 429) {
      throw new Error('Too many new tables. Wait a minute, then try again.');
    }
    if (response.status !== 409) {
      throw new Error('The table could not connect. Check the internet connection and try again.');
    }
  }
  throw new Error('A table code could not be reserved. Try again.');
}

export type BiddingLinkState = Readonly<{
  status: 'connecting' | 'connected' | 'disconnected' | 'replaced' | 'refused' | 'closed';
  relay: boolean;
  tableId: string | null;
  central: boolean;
  remotes: readonly string[];
  direct: readonly string[];
  reason?: string;
}>;
type Options = Readonly<{
  address: { code: string; tableId?: string };
  role: BiddingRole;
  device: BiddingDevice;
  centralSecret?: string;
  centralInstanceId?: string;
  generation?: number;
  direct?: boolean;
  onMessage: (from: string, data: unknown) => void;
  onState: (state: BiddingLinkState) => void;
}>;
type Peer = {
  connection: RTCPeerConnection;
  negotiationId: string;
  remoteConnectionId: string;
  channel?: RTCDataChannel;
  deadline?: ReturnType<typeof setTimeout>;
  interrupted?: ReturnType<typeof setTimeout>;
  assembly?: { id: string; total: number; parts: string[]; bytes: number; deadline: ReturnType<typeof setTimeout> };
};
const RETRIES = [500, 1000, 2000, 4000, 8000, 15_000, 30_000];
const PEER_RETRIES = [5000, 15_000, 60_000, 300_000];
const MAX_BUFFERED = 524_288;

/** One authenticated device's relay and direct links. Application commands remain the session's responsibility. */
export class BiddingLink {
  state: BiddingLinkState;
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private peerRetry?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private helloDeadline?: ReturnType<typeof setTimeout>;
  private closed = false;
  private failures = 0;
  private peerFailures = 0;
  private lastReceived = 0;
  private centralConnectionId: string | null = null;
  private knownCentralId?: string;
  private readonly remotes = new Map<string, string>();
  private readonly peers = new Map<string, Peer>();

  constructor(private readonly options: Options) {
    biddingCodeSchema.parse(options.address.code);
    this.state = {
      status: 'connecting',
      relay: false,
      tableId: options.address.tableId ?? null,
      central: options.role === 'central',
      remotes: [],
      direct: [],
    };
    this.open();
  }

  send(to: string, data: unknown): boolean {
    if (this.closed || (this.options.role === 'remote' ? to !== 'central' : to === 'central')) {
      return false;
    }
    const packet: BiddingPacket = { kind: 'app', data };
    let directFrame: string;
    try {
      directFrame = JSON.stringify(packet);
    } catch {
      return false;
    }
    if (!biddingFrameFits(directFrame)) {
      return false;
    }
    const frames = directFrames(directFrame);
    const targets = to === 'remotes' ? [...new Set([...this.remotes.keys(), ...this.peers.keys()])] : [to];
    const throughRelay: string[] = [];
    let delivered = false;
    for (const target of targets) {
      const channel = this.peers.get(target)?.channel;
      if (channel?.readyState === 'open' && channel.bufferedAmount < MAX_BUFFERED) {
        try {
          for (const frame of frames) {
            channel.send(frame);
          }
          delivered = true;
          continue;
        } catch {
          this.drop(target);
        }
      }
      throughRelay.push(target);
    }
    if (throughRelay.length) {
      const recipient = to === 'remotes' ? throughRelay : to;
      delivered = this.relay({ type: 'relay', to: recipient, packet }) || delivered;
    }
    return delivered;
  }

  close() {
    this.stop('closed');
  }

  private publish(change: Partial<BiddingLinkState> = {}) {
    const direct = [...this.peers].filter(([, peer]) => peer.channel?.readyState === 'open').map(([id]) => id);
    const next = {
      ...this.state,
      ...change,
      direct,
      central:
        this.options.role === 'central' ||
        direct.includes('central') ||
        ((change.relay ?? this.state.relay) && this.centralConnectionId !== null),
      remotes: [...new Set([...this.remotes.keys(), ...direct.filter((id) => id !== 'central')])],
    };
    const changed = JSON.stringify(next) !== JSON.stringify(this.state);
    this.state = next;
    if (changed) {
      this.options.onState(this.state);
    }
  }
  private stop(status: 'closed' | 'replaced' | 'refused', reason?: string) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearTimeout(this.retry);
    clearTimeout(this.peerRetry);
    clearTimeout(this.helloDeadline);
    clearInterval(this.heartbeat);
    this.socket?.close();
    for (const id of this.peers.keys()) {
      this.drop(id);
    }
    this.remotes.clear();
    this.centralConnectionId = null;
    this.publish({ status, relay: false, reason });
  }
  private open() {
    if (this.closed) {
      return;
    }
    const url = new URL(biddingPath(this.options.address.code, 'socket'), location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || this.closed) {
        socket.close();
        return;
      }
      this.lastReceived = Date.now();
      socket.send(
        JSON.stringify({
          type: 'join',
          role: this.options.role,
          tableId: this.state.tableId ?? undefined,
          device: this.options.device,
          centralSecret: this.options.centralSecret,
          centralInstanceId: this.options.centralInstanceId,
          generation: this.options.generation,
        } satisfies BiddingClientFrame)
      );
      this.helloDeadline = setTimeout(() => {
        if (!this.state.relay && this.socket === socket) {
          socket.close();
        }
      }, 8000);
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }
        if (Date.now() - this.lastReceived > 60_000) {
          socket.close();
          return;
        }
        socket.send(BIDDING_PING);
      }, 25_000);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.closed || typeof event.data !== 'string') {
        return;
      }
      this.lastReceived = Date.now();
      if (event.data === BIDDING_PONG) {
        return;
      }
      if (!biddingFrameFits(event.data)) {
        this.stop('refused', 'The table sent an oversized message.');
        return;
      }
      const message = biddingServerFrameSchema.safeParse(readJson(event.data));
      if (message.success) {
        this.received(message.data);
      }
    };
    socket.onclose = (event) => {
      if (this.socket !== socket || this.closed) {
        return;
      }
      clearTimeout(this.helloDeadline);
      clearInterval(this.heartbeat);
      if (event.code === BIDDING_REPLACED || event.code === BIDDING_REFUSED) {
        this.stop(event.code === BIDDING_REPLACED ? 'replaced' : 'refused', event.reason);
        return;
      }
      this.publish({ relay: false, status: 'disconnected', reason: 'The relay is disconnected.' });
      this.retry = setTimeout(() => this.open(), RETRIES[Math.min(this.failures++, RETRIES.length - 1)]);
    };
  }

  private relay(frame: Extract<BiddingClientFrame, { type: 'relay' }>): boolean {
    if (!this.state.relay || this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    const encoded = JSON.stringify(frame);
    if (!biddingFrameFits(encoded) || this.socket.bufferedAmount >= MAX_BUFFERED) {
      return false;
    }
    try {
      this.socket.send(encoded);
      return true;
    } catch {
      return false;
    }
  }
  private received(frame: BiddingServerFrame) {
    if (frame.type === 'relay') {
      this.receivedRelay(frame);
    } else {
      this.receivedPresence(frame);
    }
  }

  private receivedRelay(frame: Extract<BiddingServerFrame, { type: 'relay' }>): void {
    if (frame.from === 'central') {
      if (this.options.role !== 'remote' || frame.connectionId !== this.centralConnectionId) {
        return;
      }
    } else if (this.options.role !== 'central' || this.remotes.get(frame.from) !== frame.connectionId) {
      return;
    }
    if (frame.packet.kind === 'app') {
      this.options.onMessage(frame.from, frame.packet.data);
    } else if (frame.packet.kind === 'offer' && this.options.role === 'central') {
      void this.answer(frame.from, frame.connectionId, frame.packet);
    } else if (frame.packet.kind === 'answer' && this.options.role === 'remote') {
      const peer = this.peers.get('central');
      if (peer?.negotiationId === frame.packet.negotiationId && peer.remoteConnectionId === frame.connectionId) {
        void peer.connection
          .setRemoteDescription({ type: 'answer', sdp: frame.packet.sdp })
          .catch(() => this.drop('central', peer));
      }
    }
  }

  private receivedPresence(frame: Exclude<BiddingServerFrame, { type: 'relay' }>): void {
    if (this.state.tableId && frame.tableId !== this.state.tableId) {
      this.stop('refused', 'The table identity changed.');
      return;
    }
    if (
      this.options.role === 'remote' &&
      frame.centralConnectionId &&
      this.knownCentralId &&
      frame.centralConnectionId !== this.knownCentralId
    ) {
      this.drop('central');
    }
    this.centralConnectionId = frame.centralConnectionId;
    if (frame.centralConnectionId) {
      this.knownCentralId = frame.centralConnectionId;
    }
    const current = new Map(frame.remotes.map((remote) => [remote.deviceId, remote.connectionId]));
    for (const [id, peer] of this.peers) {
      if (id !== 'central' && current.has(id) && current.get(id) !== peer.remoteConnectionId) {
        this.drop(id, peer);
      }
    }
    this.remotes.clear();
    for (const [id, connectionId] of current) {
      this.remotes.set(id, connectionId);
    }
    clearTimeout(this.helloDeadline);
    this.failures = 0;
    this.publish({ relay: true, status: 'connected', tableId: frame.tableId, reason: undefined });
    if (this.options.role === 'remote' && frame.centralConnectionId) {
      void this.offer();
    }
  }

  private watch(id: string, entry: Peer, channel: RTCDataChannel) {
    if (this.closed || this.peers.get(id) !== entry) {
      channel.close();
      return;
    }
    entry.channel = channel;
    channel.onopen = () => {
      clearTimeout(entry.deadline);
      this.peerFailures = 0;
      this.publish();
    };
    channel.onclose = () => this.drop(id, entry);
    channel.onmessage = (event) => {
      if (
        this.closed ||
        this.peers.get(id) !== entry ||
        typeof event.data !== 'string' ||
        !biddingFrameFits(event.data)
      ) {
        return;
      }
      const parsed = biddingDirectFrameSchema.safeParse(readJson(event.data));
      if (!parsed.success) {
        return;
      }
      if (parsed.data.kind === 'app') {
        this.options.onMessage(id, parsed.data.data);
        return;
      }
      this.receivedChunk(id, entry, parsed.data);
    };
  }

  private receivedChunk(
    id: string,
    entry: Peer,
    chunk: Extract<ReturnType<typeof biddingDirectFrameSchema.parse>, { kind: 'chunk' }>
  ): void {
    if (chunk.part === 0) {
      clearTimeout(entry.assembly?.deadline);
      entry.assembly = {
        id: chunk.id,
        total: chunk.total,
        parts: [],
        bytes: 0,
        deadline: setTimeout(() => {
          entry.assembly = undefined;
        }, 5000),
      };
    }
    const assembly = entry.assembly;
    if (
      !assembly ||
      assembly.id !== chunk.id ||
      assembly.total !== chunk.total ||
      assembly.parts.length !== chunk.part
    ) {
      return;
    }
    assembly.bytes += new TextEncoder().encode(chunk.data).byteLength;
    if (assembly.bytes > BIDDING_FRAME_BYTES) {
      clearTimeout(assembly.deadline);
      entry.assembly = undefined;
      return;
    }
    assembly.parts.push(chunk.data);
    if (assembly.parts.length === assembly.total) {
      clearTimeout(assembly.deadline);
      entry.assembly = undefined;
      const decoded = biddingPacketSchema.safeParse(readJson(assembly.parts.join('')));
      if (decoded.success && decoded.data.kind === 'app') {
        this.options.onMessage(id, decoded.data.data);
      }
    }
  }

  private peer(id: string, remoteConnectionId: string, negotiationId: string): Peer {
    const connection = new RTCPeerConnection({ iceServers: [] });
    const entry: Peer = { connection, remoteConnectionId, negotiationId };
    this.peers.set(id, entry);
    entry.deadline = setTimeout(() => this.drop(id, entry), 12_000);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.drop(id, entry);
      } else if (connection.connectionState === 'disconnected') {
        clearTimeout(entry.interrupted);
        entry.interrupted = setTimeout(() => this.drop(id, entry), 8000);
      } else if (connection.connectionState === 'connected') {
        clearTimeout(entry.interrupted);
      }
    };
    return entry;
  }
  private drop(id: string, expected?: Peer) {
    const entry = this.peers.get(id);
    if (!entry || (expected && expected !== entry)) {
      return;
    }
    this.peers.delete(id);
    clearTimeout(entry.deadline);
    clearTimeout(entry.interrupted);
    clearTimeout(entry.assembly?.deadline);
    entry.channel?.close();
    entry.connection.close();
    this.publish();
    if (this.options.role === 'remote' && !this.closed) {
      clearTimeout(this.peerRetry);
      this.peerRetry = setTimeout(
        () => void this.offer(),
        PEER_RETRIES[Math.min(this.peerFailures++, PEER_RETRIES.length - 1)]
      );
    }
  }
  private async offer() {
    if (
      this.closed ||
      !this.state.relay ||
      !this.centralConnectionId ||
      this.options.direct === false ||
      typeof RTCPeerConnection === 'undefined' ||
      this.peers.has('central')
    ) {
      return;
    }
    const entry = this.peer('central', this.centralConnectionId, crypto.randomUUID());
    this.watch('central', entry, entry.connection.createDataChannel('bidding'));
    try {
      await entry.connection.setLocalDescription(await entry.connection.createOffer());
      await gathered(entry.connection);
      if (this.peers.get('central') !== entry || this.closed || !entry.connection.localDescription) {
        return;
      }
      if (
        !this.relay({
          type: 'relay',
          to: 'central',
          packet: { kind: 'offer', negotiationId: entry.negotiationId, sdp: entry.connection.localDescription.sdp },
        })
      ) {
        this.drop('central', entry);
      }
    } catch {
      this.drop('central', entry);
    }
  }
  private async answer(id: string, connectionId: string, packet: Extract<BiddingPacket, { kind: 'offer' | 'answer' }>) {
    if (this.closed || this.options.direct === false || typeof RTCPeerConnection === 'undefined') {
      return;
    }
    this.drop(id);
    const entry = this.peer(id, connectionId, packet.negotiationId);
    entry.connection.ondatachannel = (event) => this.watch(id, entry, event.channel);
    try {
      await entry.connection.setRemoteDescription({ type: 'offer', sdp: packet.sdp });
      await entry.connection.setLocalDescription(await entry.connection.createAnswer());
      await gathered(entry.connection);
      if (this.peers.get(id) !== entry || this.closed || !entry.connection.localDescription) {
        return;
      }
      if (
        !this.relay({
          type: 'relay',
          to: id,
          packet: { kind: 'answer', negotiationId: entry.negotiationId, sdp: entry.connection.localDescription.sdp },
        })
      ) {
        this.drop(id, entry);
      }
    } catch {
      this.drop(id, entry);
    }
  }
}

function gathered(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', changed);
      resolve();
    };
    const changed = () => {
      if (peer.iceGatheringState === 'complete') {
        done();
      }
    };
    const timer = setTimeout(done, 2000);
    peer.addEventListener('icegatheringstatechange', changed);
  });
}

function directFrames(encoded: string): string[] {
  if (new TextEncoder().encode(encoded).byteLength <= 16_384) {
    return [encoded];
  }
  const id = crypto.randomUUID();
  const total = Math.ceil(encoded.length / 2048);
  return Array.from({ length: total }, (_, part) =>
    JSON.stringify({ kind: 'chunk', id, part, total, data: encoded.slice(part * 2048, (part + 1) * 2048) })
  );
}

function readJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return undefined;
  }
}
