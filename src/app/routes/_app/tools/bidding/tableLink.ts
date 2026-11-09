import { KEEPALIVE_PING } from '@shared/play/protocol';
import { biddingSocketPath, TABLE_CODE_ALPHABET, TABLE_CODE_LENGTH } from '@shared/tools/biddingTable';
import type { RelayIn, RelayOut, TableRole } from '@shared/tools/biddingTable';
import { useEffect, useRef, useState } from 'react';

/*
 * The bidding table's link (Norbert, 2026-11-09): the tablet and the phones meet through a table object on the game
 * worker, which introduces them; then each phone talks to the tablet directly over WebRTC, inside the room's Wi-Fi.
 * When the Wi-Fi keeps devices apart (hotel and guest networks often do), messages keep going through the table object,
 * so nothing breaks; it is only slower.
 *
 * Storybook has no game worker, so there the table object is played by the browser itself (`local`): every page of
 * the same Storybook in one browser shares it, so the tablet and phones can be tried in tabs side by side.
 */

/** A new table code. */
export function newTableCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TABLE_CODE_LENGTH));
  return Array.from(bytes, (byte) => TABLE_CODE_ALPHABET[byte % TABLE_CODE_ALPHABET.length]).join('');
}

/** This device's id at tables, kept so a phone that reloads is the same phone. */
export function deviceId(): string {
  const make = () => `d-${crypto.randomUUID().slice(0, 18)}`;
  try {
    const kept = localStorage.getItem('bidding-device');
    if (kept) {
      return kept;
    }
    const id = make();
    localStorage.setItem('bidding-device', id);
    return id;
  } catch {
    return make();
  }
}

type RelayEvents = Readonly<{ onOpen: (open: boolean) => void; onIn: (message: RelayIn) => void }>;
type Relay = Readonly<{ send: (out: RelayOut) => void; close: () => void }>;

const RECONNECT_MS = [500, 1000, 2000, 4000, 8000];
const PING_MS = 20_000;

/* The table object on the game worker, through a websocket that comes back when it drops. */
function socketRelay(code: string, role: TableRole, id: string, events: RelayEvents): Relay {
  let socket: WebSocket | undefined;
  let closed = false;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const ping = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(KEEPALIVE_PING);
    }
  }, PING_MS);
  const open = () => {
    const url = new URL(biddingSocketPath(code, role, id), location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const next = new WebSocket(url);
    socket = next;
    next.onopen = () => {
      failures = 0;
      events.onOpen(true);
    };
    next.onmessage = (event) => {
      if (typeof event.data !== 'string' || !event.data.startsWith('{')) {
        return;
      }
      try {
        events.onIn(JSON.parse(event.data) as RelayIn);
      } catch {
        /* Not ours. */
      }
    };
    next.onclose = () => {
      events.onOpen(false);
      if (!closed) {
        retry = setTimeout(open, RECONNECT_MS[Math.min(failures++, RECONNECT_MS.length - 1)]);
      }
    };
  };
  open();
  return {
    send: (out) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(out));
      }
    },
    close: () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      socket?.close();
    },
  };
}

type LocalFrame =
  | Readonly<{ type: 'here'; role: TableRole; id: string }>
  | Readonly<{ type: 'gone'; id: string }>
  | Readonly<{ type: 'say'; role: TableRole; from: string; to: RelayOut['to']; data: unknown }>;

/* Storybook's stand-in for the table object: every client tells the others it is here, and messages go to all. */
function localRelay(code: string, role: TableRole, id: string, events: RelayEvents): Relay {
  const channel = new BroadcastChannel(`bidding-table:${code}`);
  const seen = new Map<string, { role: TableRole; at: number }>();
  let last = '';
  const presence = () => {
    const now = Date.now();
    for (const [other, { at }] of seen) {
      if (now - at > 3000) {
        seen.delete(other);
      }
    }
    const others = [...seen.entries()];
    const message: RelayIn = {
      type: 'presence',
      tablet: role === 'tablet' || others.some(([, other]) => other.role === 'tablet'),
      phones: [...(role === 'phone' ? [id] : []), ...others.filter(([, o]) => o.role === 'phone').map(([o]) => o)],
    };
    const key = JSON.stringify(message);
    if (key !== last) {
      last = key;
      events.onIn(message);
    }
  };
  const post = (frame: LocalFrame) => channel.postMessage(frame);
  channel.onmessage = (event: MessageEvent<LocalFrame>) => {
    const frame = event.data;
    if (frame.type === 'here') {
      const known = seen.has(frame.id);
      seen.set(frame.id, { role: frame.role, at: Date.now() });
      if (!known) {
        post({ type: 'here', role, id });
      }
      presence();
    } else if (frame.type === 'gone') {
      seen.delete(frame.id);
      presence();
    } else if (
      frame.from !== id &&
      (frame.role === 'phone'
        ? frame.to === 'tablet' && role === 'tablet'
        : role === 'phone' && (frame.to === 'phones' || frame.to === id))
    ) {
      events.onIn({ type: 'message', from: frame.from, data: frame.data });
    }
  };
  const beat = setInterval(() => {
    post({ type: 'here', role, id });
    presence();
  }, 1000);
  queueMicrotask(() => {
    events.onOpen(true);
    post({ type: 'here', role, id });
    presence();
  });
  return {
    send: (out) => post({ type: 'say', role, from: id, to: out.to, data: out.data }),
    close: () => {
      clearInterval(beat);
      post({ type: 'gone', id });
      channel.close();
    },
  };
}

/** How a link stands: whether it reaches the table object, who is there, and which peers it reaches directly. */
export type LinkState = Readonly<{
  relay: boolean;
  tablet: boolean;
  phones: readonly string[];
  direct: readonly string[];
}>;

type Envelope = Readonly<{ t: 'app'; d: unknown }> | Readonly<{ t: 'offer' | 'answer'; sdp: string }>;

/* Waits for a connection to gather its addresses (no trickling: one message each way), or a moment at most. */
function gathered(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((done) => {
    const timer = setTimeout(done, 1500);
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timer);
        done();
      }
    });
  });
}

/* Only addresses inside the room: no STUN server, so a direct link exists only where the Wi-Fi lets devices meet. */
const PEER_CONFIG: RTCConfiguration = { iceServers: [] };
const DIRECT_RETRY_MS = 5000;

/**
 * One device's link to its table.
 * The tablet speaks to `'phones'` or one phone by id;
 * a phone speaks to `'tablet'`.
 * Messages go directly where a direct link is open, and through the table object otherwise.
 */
export class TableLink {
  state: LinkState = { relay: false, tablet: false, phones: [], direct: [] };
  private readonly relay: Relay;
  private readonly peers = new Map<string, { peer: RTCPeerConnection; channel?: RTCDataChannel }>();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(
    private readonly options: Readonly<{
      code: string;
      role: TableRole;
      id: string;
      local: boolean;
      /** Off: everything goes through the table object (for comparing). */
      direct?: boolean;
      onMessage: (from: string, data: unknown) => void;
      onState: (state: LinkState) => void;
    }>
  ) {
    const events: RelayEvents = {
      onOpen: (relay) => this.update({ relay }),
      onIn: (message) => this.relayIn(message),
    };
    this.relay = (options.local ? localRelay : socketRelay)(options.code, options.role, options.id, events);
  }

  send(to: RelayOut['to'], data: unknown) {
    const targets = to === 'phones' ? this.state.phones : [to];
    const envelope = JSON.stringify({ t: 'app', d: data } satisfies Envelope);
    const rest = targets.filter((target) => {
      const channel = this.peers.get(target)?.channel;
      if (channel?.readyState === 'open') {
        channel.send(envelope);
        return false;
      }
      return true;
    });
    if (to === 'phones' && rest.length === targets.length) {
      this.relay.send({ to, data: { t: 'app', d: data } });
      return;
    }
    for (const target of rest) {
      this.relay.send({ to: target, data: { t: 'app', d: data } });
    }
  }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.relay.close();
    for (const { peer } of this.peers.values()) {
      peer.close();
    }
  }

  private update(change: Partial<LinkState>) {
    this.state = { ...this.state, ...change };
    this.options.onState(this.state);
  }

  private relayIn(message: RelayIn) {
    if (message.type === 'presence') {
      this.update({ tablet: message.tablet, phones: message.phones });
      if (this.options.role === 'phone' && message.tablet) {
        void this.reachTablet();
      }
      for (const id of this.peers.keys()) {
        if (this.options.role === 'tablet' && !message.phones.includes(id)) {
          this.drop(id);
        }
      }
      return;
    }
    const envelope = message.data as Envelope | undefined;
    if (envelope?.t === 'app') {
      this.options.onMessage(message.from, envelope.d);
    } else if (envelope?.t === 'offer' && this.options.role === 'tablet') {
      void this.answer(message.from, envelope.sdp);
    } else if (envelope?.t === 'answer' && this.options.role === 'phone') {
      void this.peers
        .get('tablet')
        ?.peer.setRemoteDescription({ type: 'answer', sdp: envelope.sdp })
        .catch(() => {
          this.drop('tablet');
        });
    }
  }

  private directOpen() {
    this.update({
      direct: [...this.peers.entries()].filter(([, { channel }]) => channel?.readyState === 'open').map(([id]) => id),
    });
  }

  private watch(id: string, peer: RTCPeerConnection, channel: RTCDataChannel) {
    const entry = this.peers.get(id);
    if (entry?.peer !== peer) {
      return;
    }
    entry.channel = channel;
    channel.onopen = () => this.directOpen();
    channel.onclose = () => this.drop(id);
    channel.onmessage = (event) => {
      try {
        const envelope = JSON.parse(String(event.data)) as Envelope;
        if (envelope.t === 'app') {
          this.options.onMessage(id, envelope.d);
        }
      } catch {
        /* Not ours. */
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
        this.drop(id);
      }
    };
  }

  private drop(id: string) {
    const entry = this.peers.get(id);
    if (!entry) {
      return;
    }
    this.peers.delete(id);
    entry.peer.close();
    this.directOpen();
    if (this.options.role === 'phone' && !this.closed) {
      clearTimeout(this.retry);
      this.retry = setTimeout(() => void this.reachTablet(), DIRECT_RETRY_MS);
    }
  }

  /* A phone offers the tablet a direct link: once, and again a while after one fails. */
  private async reachTablet() {
    if (this.options.direct === false || this.peers.has('tablet') || typeof RTCPeerConnection === 'undefined') {
      return;
    }
    const peer = new RTCPeerConnection(PEER_CONFIG);
    this.peers.set('tablet', { peer });
    const channel = peer.createDataChannel('table');
    this.watch('tablet', peer, channel);
    try {
      await peer.setLocalDescription(await peer.createOffer());
      await gathered(peer);
      if (this.peers.get('tablet')?.peer === peer && peer.localDescription) {
        this.relay.send({ to: 'tablet', data: { t: 'offer', sdp: peer.localDescription.sdp } });
      }
    } catch {
      this.drop('tablet');
    }
  }

  /* The tablet takes a phone's offer and answers it. */
  private async answer(from: string, sdp: string) {
    if (this.options.direct === false || typeof RTCPeerConnection === 'undefined') {
      return;
    }
    this.drop(from);
    const peer = new RTCPeerConnection(PEER_CONFIG);
    this.peers.set(from, { peer });
    peer.ondatachannel = (event) => this.watch(from, peer, event.channel);
    try {
      await peer.setRemoteDescription({ type: 'offer', sdp });
      await peer.setLocalDescription(await peer.createAnswer());
      await gathered(peer);
      if (this.peers.get(from)?.peer === peer && peer.localDescription) {
        this.relay.send({ to: from, data: { t: 'answer', sdp: peer.localDescription.sdp } });
      }
    } catch {
      this.drop(from);
    }
  }
}

/** A device's link to a table while `code` is set, and how it stands. */
export function useTableLink(
  code: string | undefined,
  role: TableRole,
  id: string,
  local: boolean,
  onMessage: (from: string, data: unknown) => void
): { state: LinkState; send: (to: RelayOut['to'], data: unknown) => void } {
  const [state, setState] = useState<LinkState>({ relay: false, tablet: false, phones: [], direct: [] });
  const link = useRef<TableLink | undefined>(undefined);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    if (!code) {
      return;
    }
    const opened = new TableLink({
      code,
      role,
      id,
      local,
      onMessage: (from, data) => handler.current(from, data),
      onState: setState,
    });
    link.current = opened;
    return () => {
      opened.close();
      link.current = undefined;
      setState({ relay: false, tablet: false, phones: [], direct: [] });
    };
  }, [code, role, id, local]);
  return { state, send: (to, data) => link.current?.send(to, data) };
}
