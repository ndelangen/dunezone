import type { BiddingAction, BiddingContext, BiddingSnapshot } from '@shared/tools/biddingSession';
import type { BiddingTableAddress } from '@shared/tools/biddingTransport';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import type { AuctionSetup } from './auction';
import { BiddingClient } from './client';
import { biddingContextOf } from './session';
import type { BiddingLink, BiddingLinkState } from './transport';
import type { BiddingVoice, BiddingVoiceState } from './voice';
import type { VoiceCommand } from './voiceCommands';

vi.mock('./voice', () => ({
  createBiddingVoice: () => {
    throw new Error('Use the test microphone.');
  },
}));

type LinkOptions = ConstructorParameters<typeof BiddingLink>[0];
type Frame = { from: string; to: string; data: unknown };

class MemoryStorage {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes.push(key);
    this.values.set(key, value);
  }
}

/* The application-message seam delivers synchronously, including an acknowledgement before send returns. */
class Links {
  readonly endpoints: { options: LinkOptions; closed: boolean }[] = [];
  readonly frames: Frame[] = [];
  allow: (frame: Frame) => boolean = () => true;
  open = (options: LinkOptions) => {
    const endpoint = { options, closed: false };
    this.endpoints.push(endpoint);
    queueMicrotask(() => this.presence());
    return {
      send: (to: string, data: unknown) => {
        if (endpoint.closed) {
          return false;
        }
        const from = options.role === 'central' ? 'central' : options.device.id;
        const frame = { from, to, data };
        this.frames.push(frame);
        if (this.allow(frame)) {
          for (const target of this.endpoints) {
            if (target.closed || target === endpoint || target.options.address.tableId !== options.address.tableId) {
              continue;
            }
            const addressed =
              to === 'central'
                ? target.options.role === 'central'
                : target.options.role === 'remote' && (to === 'remotes' || to === target.options.device.id);
            if (addressed) {
              target.options.onMessage(from, data);
            }
          }
        }
        return true;
      },
      close: () => {
        endpoint.closed = true;
      },
    };
  };
  presence() {
    for (const endpoint of this.endpoints) {
      if (endpoint.closed) {
        continue;
      }
      const room = this.endpoints.filter(
        (other) => !other.closed && other.options.address.tableId === endpoint.options.address.tableId
      );
      endpoint.options.onState({
        status: 'connected',
        relay: true,
        tableId: endpoint.options.address.tableId ?? null,
        central: room.some((other) => other.options.role === 'central'),
        remotes: room.filter((other) => other.options.role === 'remote').map((other) => other.options.device.id),
        direct: [],
      });
    }
  }
  state(client: BiddingClient, change: Partial<BiddingLinkState>) {
    const endpoint = this.endpoints.findLast(
      (candidate) => candidate.options.device.id === client.getSnapshot().deviceId && !candidate.closed
    )!;
    endpoint.options.onState({
      status: 'connected',
      relay: true,
      tableId: endpoint.options.address.tableId ?? null,
      central: true,
      remotes: [],
      direct: [],
      ...change,
    });
  }
}

const setup: AuctionSetup = {
  ruleset: { id: 'rules', name: 'Table rules' },
  seats: ['Atreides', 'Fremen', 'Emperor'].map((name, index) => ({
    id: `seat-${index}`,
    name,
    hand: 1,
    limit: 4,
    full: false,
    pass: false,
  })),
  seconds: 5,
};
const snapshot = (client: BiddingClient): BiddingSnapshot => client.getSnapshot().snapshot!;
const act = (client: BiddingClient, action: BiddingAction) => client.act(action, biddingContextOf(snapshot(client)));
const kind = (frame: Frame) => (frame.data as { type?: string }).type;

describe('bidding browser orchestration', () => {
  const clients: BiddingClient[] = [];
  let links: Links;
  let nextTable: number;
  let voiceOptions: {
    onState: (state: BiddingVoiceState) => void;
    onCommand: (command: VoiceCommand, context: BiddingContext) => void;
  };
  let voice: BiddingVoice<BiddingContext>;
  const make = (storage = new MemoryStorage(), overrides: ConstructorParameters<typeof BiddingClient>[0] = {}) => {
    const client = new BiddingClient({
      storage,
      now: () => Date.now(),
      locks: null,
      link: links.open,
      createTable: async (): Promise<BiddingTableAddress> => ({
        code: nextTable++ === 0 ? 'ABC234' : 'DEF567',
        tableId: crypto.randomUUID(),
        centralSecret: 'a'.repeat(64),
      }),
      voice: (options) => {
        voiceOptions = options;
        return voice;
      },
      ...overrides,
    });
    clients.push(client);
    return client;
  };
  const tableAndPhone = async () => {
    const central = make();
    await central.newTable(setup);
    const remote = make();
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    return { central, remote };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    links = new Links();
    nextTable = 0;
    voice = {
      start: vi.fn(async () => {
        voiceOptions.onState({ status: 'listening', message: null });
      }),
      setContext: vi.fn(),
      stop: vi.fn(() => {
        voiceOptions.onState({ status: 'off', message: null });
      }),
      setAnnouncements: vi.fn(),
      announce: vi.fn(),
      cancelAnnouncement: vi.fn(),
      dispose: vi.fn(),
    };
  });
  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.dispose();
    }
    vi.useRealTimers();
  });

  test('a lost acknowledgement retries one envelope and applies the accepted bid once', async () => {
    const { central, remote } = await tableAndPhone();
    act(remote, { type: 'assign', factionId: 'seat-0' });
    expect(remote.getSnapshot().pending).toBe(false);
    act(central, { type: 'start' });
    let dropped = false;
    links.allow = (frame) => {
      if (kind(frame) === 'result' && !dropped) {
        dropped = true;
        return false;
      }
      return true;
    };
    act(remote, { type: 'bid', amount: 5 });
    expect(snapshot(central).auction.high?.amount).toBe(5);
    expect(remote.getSnapshot().pending).toBe(true);
    const revision = snapshot(central).revision;
    await vi.advanceTimersByTimeAsync(2000);
    expect(snapshot(central).revision).toBe(revision);
    expect(remote.getSnapshot().pending).toBe(false);
    const bids = links.frames.filter(
      (frame) => kind(frame) === 'command' && (frame.data as { action?: { type: string } }).action?.type === 'bid'
    );
    expect(bids).toHaveLength(2);
    expect(bids[0].data).toEqual(bids[1].data);
  });

  test('reload restores the same bid and assignment paused, then grants a fresh timer', async () => {
    const storage = new MemoryStorage();
    const central = make(storage);
    await central.newTable(setup);
    const remote = make();
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    act(remote, { type: 'assign', factionId: 'seat-0' });
    act(central, { type: 'start' });
    act(remote, { type: 'bid', amount: 3 });
    await vi.advanceTimersByTimeAsync(4000);
    const before = snapshot(central);
    central.dispose();
    const restored = make(storage);
    await restored.initialize();
    expect(snapshot(restored)).toMatchObject({
      tableId: before.tableId,
      code: before.code,
      generation: before.generation + 1,
      assignments: before.assignments,
      auction: { stage: 'paused', high: before.auction.high, turn: before.auction.turn },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(snapshot(restored).auction.stage).toBe('paused');
    act(restored, { type: 'resume' });
    expect(restored.getSnapshot().deadline).toBe(Date.now() + 5000);
    await vi.advanceTimersByTimeAsync(4999);
    expect(snapshot(restored).auction.turn).toBe('seat-1');
    await vi.advanceTimersByTimeAsync(1);
    expect(snapshot(restored).auction.turn).toBe('seat-2');
  });

  test('promotion closes the old room, creates a new code and ignores delayed old frames', async () => {
    const { central, remote } = await tableAndPhone();
    act(remote, { type: 'assign', factionId: 'seat-0' });
    act(central, { type: 'start' });
    act(remote, { type: 'bid', amount: 2 });
    const before = snapshot(remote);
    const old = links.endpoints.find((entry) => entry.options.device.id === remote.getSnapshot().deviceId)!;
    await remote.promote();
    expect(old.closed).toBe(true);
    expect(remote.getSnapshot()).toMatchObject({ role: 'central', recovering: true });
    expect(snapshot(remote)).toMatchObject({
      code: 'DEF567',
      assignments: {},
      auction: { stage: 'paused', high: before.auction.high },
    });
    expect(snapshot(remote).tableId).not.toBe(before.tableId);
    old.options.onMessage('central', {
      type: 'state',
      snapshot: { ...before, revision: 999 },
      deadline: 0,
      sentAt: Date.now(),
    });
    expect(snapshot(remote).code).toBe('DEF567');
    expect(snapshot(remote).revision).toBe(0);
  });

  test('unchanged tables send small heartbeats and periodic complete copies without rewriting their snapshot', async () => {
    const central = make();
    await central.newTable({ ...setup, seconds: 0 });
    const storage = new MemoryStorage();
    const remote = make(storage);
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    const initialWrites = storage.writes.filter((key) => key === 'dune-bidding-remote-v1').length;
    links.frames.length = 0;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(links.frames.filter((frame) => kind(frame) === 'state')).toHaveLength(0);
    expect(links.frames.filter((frame) => kind(frame) === 'alive')).toHaveLength(14);
    expect(remote.getSnapshot().connected).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(links.frames.filter((frame) => kind(frame) === 'state')).toHaveLength(1);
    expect(storage.writes.filter((key) => key === 'dune-bidding-remote-v1')).toHaveLength(initialWrites);
  });

  test('a replaced central stops timers and voice without overwriting its replacement recovery record', async () => {
    const storage = new MemoryStorage();
    const central = make(storage);
    await central.newTable(setup);
    act(central, { type: 'start' });
    central.setListening(true);
    const writes = storage.writes.length;
    const before = snapshot(central);
    links.state(central, { status: 'replaced', relay: false, reason: 'Another central instance connected.' });
    act(central, { type: 'bid', amount: 1 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(snapshot(central)).toEqual(before);
    expect(central.getSnapshot()).toMatchObject({ connected: false, listening: false, deadline: null });
    expect(storage.writes).toHaveLength(writes);
    expect(voice.dispose).toHaveBeenCalled();
  });

  test('a partitioned old tab cannot act or overwrite a newer local central generation', async () => {
    const storage = new MemoryStorage();
    const old = make(storage);
    await old.newTable(setup);
    act(old, { type: 'start' });
    act(old, { type: 'bid', amount: 3 });
    links.state(old, { status: 'disconnected', relay: false });
    const replacement = make(storage);
    await replacement.initialize();
    expect(snapshot(replacement).generation).toBe(2);
    const persisted = storage.getItem('dune-bidding-central-v1');
    const oldSnapshot = snapshot(old);
    act(old, { type: 'bid', amount: 8 });
    old.dispose();
    expect(snapshot(old)).toEqual(oldSnapshot);
    expect(storage.getItem('dune-bidding-central-v1')).toBe(persisted);
    const reloaded = make(storage);
    await reloaded.initialize();
    expect(snapshot(reloaded)).toMatchObject({ generation: 3, auction: { high: { amount: 3 }, stage: 'paused' } });
  });

  test('an older table cannot overwrite a new table selected in another tab', async () => {
    const storage = new MemoryStorage();
    const old = make(storage);
    await old.newTable(setup);
    act(old, { type: 'start' });
    const selected = make(storage);
    await selected.newTable(setup);
    const persisted = storage.getItem('dune-bidding-central-v1');
    old.dispose();
    expect(old.getSnapshot().connected).toBe(false);
    expect(storage.getItem('dune-bidding-central-v1')).toBe(persisted);
    const restored = make(storage);
    await restored.initialize();
    expect(snapshot(restored).tableId).toBe(snapshot(selected).tableId);
  });

  test('restore reads the accepted revision after earlier saves acquire the same browser lock', async () => {
    let tail = Promise.resolve();
    const request = (<T>(_name: string, callback: LockGrantedCallback<T>): Promise<T> => {
      const answer = tail.then(() => callback(null));
      tail = answer.then(() => undefined);
      return answer;
    }) as LockManager['request'];
    const storage = new MemoryStorage();
    const old = make(storage, { locks: { request } });
    await old.newTable(setup);
    act(old, { type: 'start' });
    act(old, { type: 'bid', amount: 7 });
    const replacement = make(storage, { locks: { request } });
    await replacement.initialize();
    expect(snapshot(replacement)).toMatchObject({ generation: 2, auction: { high: { amount: 7 }, stage: 'paused' } });
    act(old, { type: 'bid', amount: 9 });
    await tail;
    expect(JSON.parse(storage.getItem('dune-bidding-central-v1')!).snapshot.generation).toBe(2);
  });

  test('other phones joining do not make an unchanged remote request another full copy', async () => {
    await tableAndPhone();
    links.frames.length = 0;
    await vi.advanceTimersByTimeAsync(501);
    links.presence();
    links.presence();
    expect(links.frames.filter((frame) => kind(frame) === 'sync')).toHaveLength(0);
  });

  test('old microphone capture and a replaced timer cannot act on the following bidder', async () => {
    const central = make();
    await central.newTable(setup);
    act(central, { type: 'start' });
    central.setListening(true);
    const captured = biddingContextOf(snapshot(central));
    await vi.advanceTimersByTimeAsync(4000);
    act(central, { type: 'bid', amount: 1 });
    const nextOpportunity = biddingContextOf(snapshot(central));
    voiceOptions.onCommand({ type: 'pass' }, captured);
    expect(snapshot(central).auction.turn).toBe('seat-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(snapshot(central).auction.turn).toBe('seat-1');
    expect(central.getSnapshot().deadline).toBe(Date.now() + 4000);
    expect(voice.setContext).toHaveBeenCalledWith(nextOpportunity, expect.any(String));
  });

  test('live play remains available when persistence fails', async () => {
    const client = new BiddingClient({
      storage: {
        getItem() {
          throw new Error('Denied');
        },
        setItem() {
          throw new Error('Denied');
        },
      },
      locks: null,
      now: () => Date.now(),
      link: links.open,
      createTable: async () => ({ code: 'ABC234', tableId: crypto.randomUUID(), centralSecret: 'a'.repeat(64) }),
    });
    clients.push(client);
    await client.newTable(setup);
    act(client, { type: 'start' });
    act(client, { type: 'bid', amount: 4 });
    expect(snapshot(client).auction.high?.amount).toBe(4);
    expect(client.getSnapshot().storageError).toContain('recovery copy');
  });

  test('a direct phone remains usable when only relay connectivity is lost', async () => {
    const { central, remote } = await tableAndPhone();
    links.state(remote, { status: 'disconnected', relay: false, direct: ['central'] });
    expect(remote.getSnapshot().connected).toBe(true);
    act(remote, { type: 'assign', factionId: 'seat-0' });
    expect(snapshot(central).assignments[remote.getSnapshot().deviceId]).toBe('seat-0');
    expect(remote.getSnapshot().connection).toBe('Direct to the table');
  });
});
