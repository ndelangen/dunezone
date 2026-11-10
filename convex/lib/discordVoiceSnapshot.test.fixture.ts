export class SnapshotSocket {
  static sockets: SnapshotSocket[] = [];
  static onIdentify: ((socket: SnapshotSocket) => void) | undefined;
  readonly sent: { op: number; d: unknown }[] = [];
  closed = false;
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();
  constructor(readonly url: string) {
    SnapshotSocket.sockets.push(this);
    if (SnapshotSocket.onIdentify) {
      queueMicrotask(() => this.packet(10, { heartbeat_interval: 40_000 }));
    }
  }
  addEventListener(type: string, callback: (event: { data?: unknown }) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }
  send(raw: string) {
    const packet = JSON.parse(raw) as { op: number; d: unknown };
    this.sent.push(packet);
    if (packet.op === 2) {
      SnapshotSocket.onIdentify?.(this);
    }
  }
  close() {
    this.closed = true;
  }
  event(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }
  packet(op: number, d: unknown, t?: string) {
    this.event('message', JSON.stringify({ op, d, ...(t ? { t, s: this.sent.length } : {}) }));
  }
}

export const snapshotDiscovery = {
  url: 'wss://gateway.discord.gg',
  shards: 1,
  session_start_limit: { remaining: 100, reset_after: 60_000 },
};
export const snapshotGuild = (voiceStates: { user_id: string; channel_id: string | null }[] = []) => ({
  id: '100',
  channels: [
    { id: '300', type: 2 },
    { id: '301', type: 2 },
  ],
  voice_states: voiceStates,
});
