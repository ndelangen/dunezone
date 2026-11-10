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
  removeItem(key: string) {
    this.values.delete(key);
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
function startAuction(client: BiddingClient) {
  act(client, { type: 'finish-setup' });
  act(client, { type: 'start' });
}
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

  test('a phone starts first and later phases while waiting tables have no timer', async () => {
    const { central, remote } = await tableAndPhone();
    act(remote, { type: 'assign', factionId: 'seat-0' });
    act(central, { type: 'configure', cards: 1 });
    act(central, { type: 'finish-setup' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(snapshot(remote).auction.stage).toBe('ready');
    expect(central.getSnapshot().deadline).toBeNull();
    act(remote, { type: 'select-starter', id: 'seat-1' });
    act(remote, { type: 'start' });
    expect(snapshot(central).auction).toMatchObject({ stage: 'active', turn: 'seat-1' });
    expect(central.getSnapshot().deadline).toBe(Date.now() + 5000);
    act(central, { type: 'bid', amount: 2 });
    act(central, { type: 'pass' });
    act(central, { type: 'pass' });
    expect(snapshot(remote).auction.stage).toBe('over');
    act(remote, { type: 'next-phase' });
    expect(snapshot(central).auction).toMatchObject({ stage: 'ready', phase: 2, turn: null });
    expect(central.getSnapshot().deadline).toBeNull();
    act(remote, { type: 'select-starter', id: 'seat-2' });
    act(remote, { type: 'start' });
    expect(snapshot(central).auction).toMatchObject({ stage: 'active', phase: 2, turn: 'seat-2' });
    expect(central.getSnapshot().deadline).toBe(Date.now() + 5000);
  });

  test('announces first-auction readiness separately from completed cards and resets', async () => {
    const central = make();
    await central.newTable(setup);
    central.setAnnouncements(true);
    act(central, { type: 'finish-setup' });
    expect(voice.announce).toHaveBeenLastCalledWith('The table is ready. Choose the first bidder.');
    act(central, { type: 'start' });
    act(central, { type: 'reset' });
    expect(voice.announce).toHaveBeenLastCalledWith('Ready for a new bid. Choose the starting faction.');
    act(central, { type: 'start' });
    act(central, { type: 'bid', amount: 2 });
    act(central, { type: 'pass' });
    act(central, { type: 'pass' });
    expect(snapshot(central).auction.card).toBe(2);
    expect(voice.announce).toHaveBeenLastCalledWith('Ready for a new bid. Choose the starting faction.');
    act(central, { type: 'start' });
    act(central, { type: 'pass' });
    act(central, { type: 'pass' });
    act(central, { type: 'pass' });
    act(central, { type: 'next-phase' });
    expect(voice.announce).toHaveBeenLastCalledWith('The table is ready. Choose the first bidder.');
  });

  test('a lost acknowledgement retries one envelope and applies the accepted bid once', async () => {
    const { central, remote } = await tableAndPhone();
    act(remote, { type: 'assign', factionId: 'seat-0' });
    expect(remote.getSnapshot().pending).toBe(false);
    startAuction(central);
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
    startAuction(central);
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
    startAuction(central);
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
    startAuction(central);
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
    startAuction(old);
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
    startAuction(old);
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
    startAuction(old);
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

  test('connected device IDs follow phone presence independently of faction assignments', async () => {
    const { central, remote } = await tableAndPhone();
    const deviceId = remote.getSnapshot().deviceId;
    const ids = central.getSnapshot().connectedDeviceIds;
    expect(ids).toEqual([deviceId]);
    expect(remote.getSnapshot().connectedDeviceIds).toEqual([]);
    expect(snapshot(central).assignments[deviceId]).toBeUndefined();
    act(remote, { type: 'assign', factionId: 'seat-0' });
    expect(snapshot(central).assignments[deviceId]).toBe('seat-0');
    act(remote, { type: 'assign', factionId: 'seat-1' });
    expect(snapshot(central).assignments[deviceId]).toBe('seat-1');
    links.presence();
    expect(central.getSnapshot().connectedDeviceIds).toBe(ids);
    await remote.leaveTable();
    links.presence();
    expect(central.getSnapshot().connectedDeviceIds).toEqual([]);
    expect(snapshot(central).assignments[deviceId]).toBe('seat-1');
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    expect(central.getSnapshot().connectedDeviceIds).toEqual([deviceId]);
  });

  test('relay loss retains only direct device IDs until relay presence reconnects', async () => {
    const central = make();
    await central.newTable(setup);
    const directId = crypto.randomUUID();
    const relayId = crypto.randomUUID();
    links.state(central, { remotes: [relayId, directId], direct: [directId] });
    expect(central.getSnapshot().connectedDeviceIds).toEqual([directId, relayId].sort());
    const both = central.getSnapshot().connectedDeviceIds;
    links.state(central, { remotes: [directId, relayId], direct: [directId] });
    expect(central.getSnapshot().connectedDeviceIds).toBe(both);
    links.state(central, {
      status: 'disconnected',
      relay: false,
      remotes: [relayId, directId],
      direct: [directId],
    });
    expect(central.getSnapshot().connectedDeviceIds).toEqual([directId]);
    links.state(central, { status: 'disconnected', relay: false, remotes: [relayId, directId] });
    expect(central.getSnapshot().connectedDeviceIds).toEqual([]);
    links.state(central, { remotes: [relayId] });
    expect(central.getSnapshot().connectedDeviceIds).toEqual([relayId]);
  });

  test('terminal replacement and leaving clear live device IDs and ignore late presence', async () => {
    const { central, remote } = await tableAndPhone();
    const deviceId = remote.getSnapshot().deviceId;
    const endpoint = links.endpoints.find((entry) => entry.options.role === 'central')!;
    links.state(central, { status: 'replaced', relay: false, remotes: [deviceId], direct: [deviceId] });
    expect(central.getSnapshot().connectedDeviceIds).toEqual([]);
    endpoint.options.onState({
      status: 'connected',
      relay: true,
      central: true,
      tableId: snapshot(central).tableId,
      remotes: [deviceId],
      direct: [deviceId],
    });
    expect(central.getSnapshot().connectedDeviceIds).toEqual([]);
    const next = make();
    await next.newTable(setup);
    links.state(next, { direct: [deviceId] });
    expect(next.getSnapshot().connectedDeviceIds).toEqual([deviceId]);
    await next.leaveTable();
    expect(next.getSnapshot().connectedDeviceIds).toEqual([]);
  });

  test('leaving stops this central device and a new table survives reload', async () => {
    const storage = new MemoryStorage();
    const client = make(storage);
    await client.newTable(setup);
    startAuction(client);
    client.setListening(true);
    client.setAnnouncements(true);
    const old = snapshot(client);
    const oldEndpoint = links.endpoints.at(-1)!;
    const frames = links.frames.length;
    await client.leaveTable();
    expect(client.getSnapshot()).toMatchObject({
      role: 'welcome',
      snapshot: null,
      busy: false,
      pending: false,
      connected: false,
      listening: false,
      announcing: false,
      deadline: null,
      receivedAt: null,
    });
    expect(oldEndpoint.closed).toBe(true);
    expect(voice.dispose).toHaveBeenCalled();
    expect(storage.getItem('dune-bidding-central-v1')).toBeNull();
    expect(storage.getItem('dune-bidding-device-v1')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(links.frames).toHaveLength(frames);
    const welcome = make(storage);
    await welcome.initialize();
    expect(welcome.getSnapshot().role).toBe('welcome');
    await client.newTable(setup);
    const next = snapshot(client);
    expect(next.tableId).not.toBe(old.tableId);
    const reloaded = make(storage);
    await reloaded.initialize();
    expect(snapshot(reloaded)).toMatchObject({ tableId: next.tableId, generation: 2, auction: { stage: 'paused' } });
  });

  test('a remote leaves without retrying and can join another table without an older role restoring', async () => {
    const storage = new MemoryStorage();
    const remote = make(storage);
    await remote.newTable(setup);
    const oldCentral = storage.getItem('dune-bidding-central-v1');
    const central = make();
    await central.newTable(setup);
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    const oldEndpoint = links.endpoints.at(-1)!;
    const publication = { type: 'state', snapshot: snapshot(central), deadline: null, sentAt: Date.now() };
    links.allow = (frame) => kind(frame) !== 'command';
    act(remote, { type: 'assign', factionId: 'seat-0' });
    expect(remote.getSnapshot().pending).toBe(true);
    const commands = links.frames.filter((frame) => kind(frame) === 'command').length;
    await remote.leaveTable();
    oldEndpoint.options.onMessage('central', publication);
    await vi.advanceTimersByTimeAsync(5000);
    expect(links.frames.filter((frame) => kind(frame) === 'command')).toHaveLength(commands);
    expect(remote.getSnapshot()).toMatchObject({ role: 'welcome', snapshot: null, pending: false });
    expect(storage.getItem('dune-bidding-remote-v1')).toBeNull();
    expect(storage.getItem('dune-bidding-receipt-v1')).toBeNull();
    expect(storage.getItem('dune-bidding-central-v1')).toBe(oldCentral);
    const reloaded = make(storage);
    await reloaded.initialize();
    expect(reloaded.getSnapshot().role).toBe('welcome');
    const other = make();
    await other.newTable(setup);
    remote.join(snapshot(other).code, snapshot(other).tableId);
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot(remote).tableId).toBe(snapshot(other).tableId);
    expect(remote.getSnapshot().connected).toBe(true);
  });

  test('leaving a displaced central tab preserves the newer central selection and saved state', async () => {
    const storage = new MemoryStorage();
    const old = make(storage);
    await old.newTable(setup);
    const replacement = make(storage);
    await replacement.initialize();
    const saved = [...storage.values];
    await old.leaveTable();
    expect([...storage.values]).toEqual(saved);
    const reloaded = make(storage);
    await reloaded.initialize();
    expect(snapshot(reloaded).generation).toBe(3);
  });

  test('an older live central cannot resurrect a newer table after its owner leaves', async () => {
    const storage = new MemoryStorage();
    const old = make(storage);
    await old.newTable(setup);
    startAuction(old);
    links.state(old, { status: 'disconnected', relay: false });
    const selected = make(storage);
    await selected.initialize();
    await selected.leaveTable();
    const oldState = snapshot(old);
    act(old, { type: 'bid', amount: 8 });
    old.dispose();
    expect(snapshot(old)).toEqual(oldState);
    expect(storage.getItem('dune-bidding-central-v1')).toBeNull();
    expect(JSON.parse(storage.getItem('dune-bidding-central-owner-v1')!)).toMatchObject({ retired: true });
    const reloaded = make(storage);
    await reloaded.initialize();
    expect(reloaded.getSnapshot().role).toBe('welcome');
  });

  test('leaving an older remote tab preserves another tab copy even at the same table', async () => {
    const central = make();
    await central.newTable(setup);
    const storage = new MemoryStorage();
    const old = make(storage);
    old.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    const selected = make(storage);
    selected.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    const saved = [...storage.values];
    await old.leaveTable();
    expect([...storage.values]).toEqual(saved);
    const reloaded = make(storage);
    await reloaded.initialize();
    expect(reloaded.getSnapshot().role).toBe('remote');
    expect(snapshot(reloaded).tableId).toBe(snapshot(central).tableId);
  });

  test('a queued save cannot resurrect a table after this client leaves', async () => {
    let tail = Promise.resolve();
    const request = (<T>(_name: string, callback: LockGrantedCallback<T>): Promise<T> => {
      const answer = tail.then(() => callback(null));
      tail = answer.then(() => undefined);
      return answer;
    }) as LockManager['request'];
    const storage = new MemoryStorage();
    const client = make(storage, { locks: { request } });
    await client.newTable(setup);
    const writes = storage.writes.filter((key) => key === 'dune-bidding-central-v1').length;
    startAuction(client);
    act(client, { type: 'bid', amount: 9 });
    await client.leaveTable();
    await tail;
    expect(storage.writes.filter((key) => key === 'dune-bidding-central-v1')).toHaveLength(writes);
    expect(storage.getItem('dune-bidding-central-v1')).toBeNull();
    const restored = make(storage);
    await restored.initialize();
    expect(restored.getSnapshot().role).toBe('welcome');
  });

  test('leaving aborts a pending creation and ignores its late result', async () => {
    let finish!: (address: BiddingTableAddress) => void;
    let signal: AbortSignal | undefined;
    const storage = new MemoryStorage();
    const client = make(storage, {
      createTable: (options) => {
        signal = options?.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const creation = client.newTable(setup);
    await client.leaveTable();
    expect(signal?.aborted).toBe(true);
    finish({ code: 'ABC234', tableId: crypto.randomUUID(), centralSecret: 'a'.repeat(64) });
    await creation;
    expect(client.getSnapshot()).toMatchObject({ role: 'welcome', snapshot: null, busy: false });
    expect(storage.getItem('dune-bidding-central-v1')).toBeNull();
    expect(links.endpoints).toHaveLength(0);
  });

  test('a failed retirement reports the storage failure while stopping live controls', async () => {
    const storage = new MemoryStorage();
    const client = make(storage);
    await client.newTable(setup);
    const remove = vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw new Error('Denied');
    });
    await expect(client.leaveTable()).rejects.toThrow('saved copy could not be removed');
    expect(client.getSnapshot()).toMatchObject({ role: 'central', connected: false, busy: false });
    expect(client.getSnapshot().storageError).toContain('saved copy could not be removed');
    const restored = make(storage);
    await restored.initialize();
    expect(restored.getSnapshot().role).toBe('welcome');
    remove.mockRestore();
    await client.leaveTable();
    expect(client.getSnapshot()).toMatchObject({ role: 'welcome', snapshot: null, storageError: null });
    expect(storage.getItem('dune-bidding-central-v1')).toBeNull();
  });

  test('ownership read failures keep retirement available for retry', async () => {
    const storage = new MemoryStorage();
    const client = make(storage);
    await client.newTable(setup);
    const read = vi.spyOn(storage, 'getItem').mockImplementation((key) => {
      if (key === 'dune-bidding-central-owner-v1') {
        throw new Error('Denied');
      }
      return storage.values.get(key) ?? null;
    });
    await expect(client.leaveTable()).rejects.toThrow('saved copy could not be removed');
    expect(client.getSnapshot()).toMatchObject({ role: 'central', connected: false });
    read.mockRestore();
    await client.leaveTable();
    expect(storage.getItem('dune-bidding-central-v1')).toBeNull();
    expect(client.getSnapshot().role).toBe('welcome');
  });

  test('queued remote cleanup preserves a newer tab selection under the same storage lock', async () => {
    let tail = Promise.resolve();
    const request = (<T>(_name: string, callback: LockGrantedCallback<T>): Promise<T> => {
      const answer = tail.then(() => callback(null));
      tail = answer.then(() => undefined);
      return answer;
    }) as LockManager['request'];
    const central = make();
    await central.newTable(setup);
    const storage = new MemoryStorage();
    const old = make(storage, { locks: { request } });
    old.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    const selected = make(storage, { locks: { request } });
    selected.join(snapshot(central).code, snapshot(central).tableId);
    await old.leaveTable();
    await tail;
    const role = JSON.parse(storage.getItem('dune-bidding-role-v1')!);
    expect(role.role).toBe('remote');
    expect(JSON.parse(storage.getItem('dune-bidding-remote-v1')!).selectionId).toBe(role.id);
  });

  test('a joined table is not marked persisted while its recovery save waits for the browser lock', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = (<T>(_name: string, callback: LockGrantedCallback<T>): Promise<T> =>
      gate.then(() => callback(null))) as LockManager['request'];
    const central = make();
    await central.newTable(setup);
    const storage = new MemoryStorage();
    const remote = make(storage, { locks: { request } });
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.getSnapshot()).toMatchObject({ connected: true, joinPersisted: false });
    expect(storage.getItem('dune-bidding-remote-v1')).toBeNull();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.getSnapshot().joinPersisted).toBe(true);
    expect(JSON.parse(storage.getItem('dune-bidding-remote-v1')!).snapshot.tableId).toBe(snapshot(central).tableId);
    await remote.leaveTable();
    expect(remote.getSnapshot().joinPersisted).toBe(false);
  });

  test('a failed recovery copy write cannot mark a join persisted until a later save succeeds', async () => {
    const central = make();
    await central.newTable(setup);
    const storage = new MemoryStorage();
    const write = vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === 'dune-bidding-remote-v1') {
        throw new Error('Quota exceeded');
      }
      storage.values.set(key, value);
    });
    const remote = make(storage);
    remote.join(snapshot(central).code, snapshot(central).tableId);
    await vi.advanceTimersByTimeAsync(0);
    expect(remote.getSnapshot()).toMatchObject({ connected: true, joinPersisted: false });
    expect(remote.getSnapshot().storageError).toContain('recovery copy');
    write.mockRestore();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(remote.getSnapshot().joinPersisted).toBe(true);
    expect(storage.getItem('dune-bidding-remote-v1')).not.toBeNull();
  });

  test('a delayed restore failure cannot replace a subsequent remote selection', async () => {
    let fail!: (reason: Error) => void;
    const request = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            fail = reject;
          })
      )
      .mockImplementation(<T>(_name: string, callback: LockGrantedCallback<T>) => Promise.resolve(callback(null)));
    const client = make(new MemoryStorage(), { locks: { request } });
    const restoring = client.initialize();
    client.join('DEF567', crypto.randomUUID());
    fail(new Error('Old restore failed'));
    await restoring;
    expect(client.getSnapshot()).toMatchObject({ role: 'remote', error: null, busy: false });
  });

  test('a late cleanup failure cannot replace a subsequent remote selection', async () => {
    let fail!: (reason: Error) => void;
    let delay = false;
    const request = (<T>(_name: string, callback: LockGrantedCallback<T>): Promise<T> => {
      if (delay) {
        delay = false;
        return new Promise((_, reject) => {
          fail = reject;
        });
      }
      return Promise.resolve(callback(null));
    }) as LockManager['request'];
    const client = make(new MemoryStorage(), { locks: { request } });
    await client.newTable(setup);
    delay = true;
    const leaving = client.leaveTable();
    client.join('DEF567', crypto.randomUUID());
    fail(new Error('Lock failed'));
    await expect(leaving).rejects.toThrow('saved copy could not be removed');
    expect(client.getSnapshot()).toMatchObject({ role: 'remote', storageError: null, busy: false });
  });

  test('old microphone capture and a replaced timer cannot act on the following bidder', async () => {
    const central = make();
    await central.newTable(setup);
    startAuction(central);
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
        removeItem() {
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
    startAuction(client);
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
