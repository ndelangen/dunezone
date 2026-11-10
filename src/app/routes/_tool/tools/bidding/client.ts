import {
  BIDDING_SNAPSHOT_BYTES,
  biddingContextSchema,
  biddingIdentitySchema,
  biddingResultSchema,
  biddingSnapshotSchema,
} from '@shared/tools/biddingSession';
import type {
  BiddingAction,
  BiddingCommand,
  BiddingContext,
  BiddingPublication,
  BiddingResult,
  BiddingSnapshot,
} from '@shared/tools/biddingSession';
import { biddingCodeSchema, biddingDeviceSchema, biddingTableAddressSchema } from '@shared/tools/biddingTransport';
import type { BiddingDevice, BiddingTableAddress } from '@shared/tools/biddingTransport';
import { z } from 'zod';

import { createAuction } from './auction';
import type { AuctionSetup } from './auction';
import { acceptBiddingPublication, promoteSnapshot, restoreCentralSnapshot } from './recovery';
import type { SavedRemoteCopy } from './recovery';
import { BiddingSession, biddingContextOf, createBiddingCommand } from './session';
import { BiddingLink, createBiddingDevice, createBiddingTable } from './transport';
import type { BiddingLinkState } from './transport';
import { createBiddingVoice } from './voice';
import type { BiddingVoice } from './voice';

const DEVICE_KEY = 'dune-bidding-device-v1';
const CENTRAL_KEY = 'dune-bidding-central-v1';
const CENTRAL_OWNER_KEY = 'dune-bidding-central-owner-v1';
const REMOTE_KEY = 'dune-bidding-remote-v1';
const RECEIPT_KEY = 'dune-bidding-receipt-v1';
const LAST_ROLE_KEY = 'dune-bidding-role-v1';
const CENTRAL_LOCK = 'dune-bidding-central-v1';
const HEARTBEAT_MS = 2000;
const SNAPSHOT_MS = 30_000;
const REMOTE_SILENCE_MS = 7000;
const COMMAND_WAIT_MS = 2000;
const TIMER_INTERRUPTION_MS = 1500;
const NO_CONNECTED_DEVICES: readonly string[] = [];

const savedCentralSchema = z.strictObject({
  version: z.literal(1),
  address: biddingTableAddressSchema,
  device: biddingDeviceSchema,
  snapshot: biddingSnapshotSchema,
});
type SavedCentral = z.infer<typeof savedCentralSchema>;
const savedOwnershipSchema = z.object({
  snapshot: biddingIdentitySchema.strip().extend({ revision: z.number().int().nonnegative() }),
  retired: z.boolean().optional(),
});
type SavedOwnership = z.infer<typeof savedOwnershipSchema>;
const remoteAddressSchema = biddingTableAddressSchema.omit({ centralSecret: true });
const savedRemoteSchema = z.strictObject({
  version: z.literal(1),
  selectionId: z.uuid().optional(),
  address: remoteAddressSchema,
  snapshot: biddingSnapshotSchema,
  receivedAt: z.number().int().nonnegative(),
});
const receiptSchema = z.strictObject({
  selectionId: z.uuid().optional(),
  tableId: z.uuid(),
  centralInstanceId: z.string(),
  revision: z.number().int().nonnegative(),
  receivedAt: z.number().int().nonnegative(),
});
const aliveSchema = biddingContextSchema
  .omit({ opportunity: true })
  .extend({
    type: z.literal('alive'),
    revision: z.number().int().nonnegative(),
    deadline: z.number().int().nonnegative().nullable(),
    sentAt: z.number().int().nonnegative(),
  })
  .strict();
const syncSchema = z.strictObject({ type: z.literal('sync') });
const selectionSchema = z.strictObject({ role: z.enum(['central', 'remote']), id: z.uuid() });

export type BiddingClientState = Readonly<{
  role: 'welcome' | 'central' | 'remote';
  deviceId: string;
  snapshot: BiddingSnapshot | null;
  deadline: number | null;
  connection: string;
  connected: boolean;
  /** Remote device IDs with a usable path to this central device; assignments remain in the snapshot. */
  connectedDeviceIds: readonly string[];
  pending: boolean;
  feedback: readonly string[];
  storageError: string | null;
  error: string | null;
  receivedAt: number | null;
  recovering: boolean;
  listening: boolean;
  announcing: boolean;
  voiceMessage: string;
  busy: boolean;
  joinPersisted: boolean;
}>;

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type LinkPort = Pick<BiddingLink, 'send' | 'close'>;
type LinkOptions = ConstructorParameters<typeof BiddingLink>[0];
type Dependencies = Readonly<{
  storage: StoragePort | null;
  now: () => number;
  uuid: () => string;
  createTable: typeof createBiddingTable;
  link: (options: LinkOptions) => LinkPort;
  voice: typeof createBiddingVoice<BiddingContext>;
  locks: Pick<LockManager, 'request'> | null;
}>;
type PendingCommand = {
  command: BiddingCommand;
  attempts: number;
  result?: BiddingResult;
  timer?: ReturnType<typeof setTimeout>;
};
type Retirement = {
  selection: z.infer<typeof selectionSchema> | null;
  snapshot: BiddingSnapshot | null;
  role: BiddingClientState['role'];
  unclaimedRole: string | null | undefined;
};

function browserStorage(): StoragePort | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The table could not finish that action.';
}

function contextKey(context: BiddingContext): string {
  return `${context.tableId}/${context.centralInstanceId}/${context.generation}/${context.opportunity}`;
}

function connectedRemoteIds(state: BiddingLinkState, previous: readonly string[]): readonly string[] {
  const ids = [...new Set([...(state.relay ? state.remotes : []), ...state.direct])]
    .filter((id) => id !== 'central')
    .sort();
  return ids.length === previous.length && ids.every((id, index) => id === previous[index]) ? previous : ids;
}

/** Browser effects surround the single authoritative session; neither transport nor React decides an auction. */
export class BiddingClient {
  private readonly dependencies: Dependencies;
  private readonly listeners = new Set<() => void>();
  private state: BiddingClientState;
  private device: BiddingDevice;
  private address: { code: string; tableId?: string } | null = null;
  private centralAddress: BiddingTableAddress | null = null;
  private session: BiddingSession | null = null;
  private unsubscribeSession?: () => void;
  private link: LinkPort | null = null;
  private linkState: BiddingLinkState | null = null;
  private voice: BiddingVoice<BiddingContext> | null = null;
  private voiceContextKey: string | null = null;
  private listeningRequested = false;
  private copy: SavedRemoteCopy | null = null;
  private pending: PendingCommand | null = null;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private timerKey: string | null = null;
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastSnapshotAt = 0;
  private lastAuthorityAt = 0;
  private lastSyncAt = -Infinity;
  private recoveryRequested = false;
  private operation = 0;
  private run = 0;
  private abort?: AbortController;
  private initialized = false;
  private disposed = false;
  private selection: z.infer<typeof selectionSchema> | null = null;
  private selectionBaseRole: string | null = null;
  private selectionClaimed = false;
  private retirement: Retirement | null = null;
  private persistenceEpoch = 0;

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.dependencies = {
      storage: browserStorage(),
      now: Date.now,
      uuid: () => crypto.randomUUID(),
      createTable: createBiddingTable,
      link: (options) => new BiddingLink(options),
      voice: createBiddingVoice<BiddingContext>,
      locks: typeof navigator === 'undefined' ? null : (navigator.locks ?? null),
      ...dependencies,
    };
    this.device = createBiddingDevice();
    this.state = {
      role: 'welcome',
      deviceId: this.device.id,
      snapshot: null,
      deadline: null,
      connection: 'No table connected',
      connected: false,
      connectedDeviceIds: NO_CONNECTED_DEVICES,
      pending: false,
      feedback: [],
      storageError: null,
      error: null,
      receivedAt: null,
      recovering: false,
      listening: false,
      announcing: false,
      voiceMessage: '',
      busy: false,
      joinPersisted: false,
    };
    const stored = this.read(DEVICE_KEY, biddingDeviceSchema);
    if (stored) {
      this.device = stored;
    } else {
      this.write(DEVICE_KEY, this.device);
    }
    this.state = { ...this.state, deviceId: this.device.id };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityChanged);
      document.addEventListener('freeze', this.interrupt);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.interrupt);
      window.addEventListener('storage', this.storageChanged);
    }
  }

  getSnapshot = (): BiddingClientState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** An explicit join link takes precedence over a saved central table on this browser. */
  async initialize(search: { join?: string; table?: string } = {}): Promise<void> {
    if (this.initialized || this.disposed) {
      return;
    }
    this.initialized = true;
    if (search.join) {
      this.join(search.join, search.table);
      return;
    }
    const operation = this.operation;
    const restore = () => {
      if (!this.isCurrent(operation)) {
        return;
      }
      const storedRole = this.readText(LAST_ROLE_KEY);
      if (storedRole === 'welcome') {
        return;
      }
      const lastRole =
        storedRole === 'central' || storedRole === 'remote'
          ? storedRole
          : this.read(LAST_ROLE_KEY, selectionSchema)?.role;
      const central = this.read(CENTRAL_KEY, savedCentralSchema);
      const remote = this.readRemote();
      if (central && lastRole !== 'remote') {
        if (central.snapshot.tableId !== central.address.tableId || central.snapshot.code !== central.address.code) {
          this.update({ error: 'The saved table identity is incomplete. Set up a new table or use a phone copy.' });
          return;
        }
        this.device = central.device;
        this.write(DEVICE_KEY, this.device);
        this.installCentral(central.address, restoreCentralSnapshot(central.snapshot, this.dependencies.uuid()), true);
      } else if (remote) {
        this.join(remote.address.code, remote.address.tableId);
      }
    };
    /* Read and write inside one browser lock, so two restored tabs cannot choose the same generation. */
    try {
      if (this.dependencies.locks) {
        await this.dependencies.locks.request(CENTRAL_LOCK, restore);
      } else {
        restore();
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({ error: messageOf(error) });
      }
    }
  }

  async newTable(setup: AuctionSetup): Promise<void> {
    const operation = this.beginOperation();
    try {
      const auction = createAuction(setup);
      const address = await this.dependencies.createTable({ signal: this.abort?.signal });
      if (!this.isCurrent(operation)) {
        return;
      }
      const session = new BiddingSession({
        identity: {
          tableId: address.tableId,
          code: address.code,
          centralInstanceId: this.dependencies.uuid(),
          generation: 1,
        },
        auction,
      });
      const claim = () => {
        if (this.isCurrent(operation)) {
          this.installCentral(address, session.getSnapshot(), false);
        }
      };
      if (this.dependencies.locks) {
        await this.dependencies.locks.request(CENTRAL_LOCK, claim);
      } else {
        claim();
      }
      session.close();
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({ error: messageOf(error), busy: false });
      }
    }
  }

  join(code: string, tableId?: string): void {
    if (this.disposed) {
      return;
    }
    const parsed = biddingCodeSchema.safeParse(code.trim().toUpperCase());
    if (!parsed.success || (tableId !== undefined && !z.uuid().safeParse(tableId).success)) {
      this.update({ error: 'Enter the six-character table code shown on the central device.' });
      return;
    }
    this.operation += 1;
    this.abort?.abort();
    const saved = this.readRemote();
    this.stopCurrent();
    this.address = { code: parsed.data, tableId };
    this.copy =
      saved && saved.address.code === parsed.data && saved.address.tableId === tableId
        ? { snapshot: saved.snapshot, receivedAt: saved.receivedAt }
        : null;
    if (this.copy) {
      this.address.tableId = this.copy.snapshot.tableId;
    }
    this.sequence = this.copy?.snapshot.commandSequences[this.device.id] ?? 0;
    this.update({
      role: 'remote',
      deviceId: this.device.id,
      snapshot: this.copy?.snapshot ?? null,
      deadline: null,
      connection: 'Connecting to the table',
      connected: false,
      pending: false,
      feedback: [],
      error: null,
      receivedAt: this.copy?.receivedAt ?? null,
      recovering: false,
      busy: false,
      joinPersisted: false,
    });
    this.claimSelection('remote');
    this.openLink('remote');
    this.heartbeat = setInterval(() => {
      if (this.dependencies.now() - this.lastAuthorityAt > REMOTE_SILENCE_MS) {
        this.remoteUnavailable();
      }
    }, HEARTBEAT_MS);
  }

  /** Commands use the context visible when the control or microphone captured the action. */
  act(action: BiddingAction, context: BiddingContext): void {
    if (this.disposed) {
      return;
    }
    if (this.state.role === 'central') {
      if (!this.ensureLocalAuthority() || !this.session) {
        this.feedback('This central connection is no longer active.');
        return;
      }
      const result = this.session.dispatch(action, context);
      this.feedback(result.reason);
      if (result.accepted && action.type === 'resume') {
        this.update({ recovering: false });
      }
      return;
    }
    const snapshot = this.state.snapshot;
    if (this.state.role !== 'remote' || !snapshot || !this.state.connected) {
      this.feedback('The central device is unavailable. Check the table before trying again.');
      return;
    }
    if (this.pending) {
      this.feedback('Wait for the table to answer your previous action.');
      return;
    }
    const command = {
      ...createBiddingCommand(snapshot, this.device.id, action, { sequence: ++this.sequence }),
      ...context,
    };
    this.pending = { command, attempts: 0 };
    this.update({ pending: true });
    this.sendPending();
  }

  async promote(): Promise<void> {
    const saved = this.copy;
    if (this.state.role !== 'remote' || !saved) {
      this.update({ error: 'No complete phone recovery copy is available.' });
      return;
    }
    const operation = this.beginOperation();
    /* Promotion leaves the old room before creating the new one; no late old command can follow it. */
    this.stopCurrent();
    this.update({ connected: false, connection: 'Creating the recovered table', pending: false, recovering: true });
    try {
      let address = await this.dependencies.createTable({ signal: this.abort?.signal });
      if (!this.isCurrent(operation)) {
        return;
      }
      if (address.code === saved.snapshot.code) {
        address = await this.dependencies.createTable({ signal: this.abort?.signal });
      }
      if (!this.isCurrent(operation)) {
        return;
      }
      const recovered = promoteSnapshot(saved.snapshot, address, this.dependencies.uuid());
      const claim = () => {
        if (this.isCurrent(operation)) {
          this.installCentral(address, recovered, true, saved.receivedAt);
        }
      };
      if (this.dependencies.locks) {
        await this.dependencies.locks.request(CENTRAL_LOCK, claim);
      } else {
        claim();
      }
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.update({ error: messageOf(error), busy: false });
      }
    }
  }

  /** Leaving retires this browser's selection without changing the auction on any other device. */
  async leaveTable(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const retirement = this.retirement ?? {
      selection: this.selection,
      snapshot: this.state.snapshot,
      role: this.state.role,
      unclaimedRole: this.selectionClaimed ? undefined : this.selectionBaseRole,
    };
    this.retirement = retirement;
    const { selection, snapshot } = retirement;
    const operation = ++this.operation;
    this.abort?.abort();
    this.abort = undefined;
    this.persistenceEpoch += 1;
    this.stopCurrent();
    this.selection = null;
    this.address = null;
    this.copy = null;
    this.sequence = 0;
    this.recoveryRequested = false;
    this.update({
      role: 'welcome',
      snapshot: null,
      connection: 'No table connected',
      connected: false,
      feedback: [],
      error: null,
      receivedAt: null,
      recovering: false,
      busy: true,
      joinPersisted: false,
    });
    const retire = () => {
      const storage = this.dependencies.storage;
      if (!storage) {
        throw new Error('Browser storage is unavailable. The saved table could not be removed.');
      }
      const storedRole = storage.getItem(LAST_ROLE_KEY);
      if (selection && (storedRole === JSON.stringify(selection) || storedRole === retirement.unclaimedRole)) {
        /* Retain the deliberate welcome choice so an older role's copy cannot become the fallback. */
        storage.setItem(LAST_ROLE_KEY, 'welcome');
      }
      if (selection?.role === 'central' && snapshot) {
        const saved = (
          this.readForRetirement(CENTRAL_OWNER_KEY, savedOwnershipSchema) ??
          this.readForRetirement(CENTRAL_KEY, savedOwnershipSchema)
        )?.snapshot;
        if (
          saved?.tableId === snapshot.tableId &&
          saved.centralInstanceId === snapshot.centralInstanceId &&
          saved.generation === snapshot.generation
        ) {
          storage.setItem(CENTRAL_OWNER_KEY, JSON.stringify({ snapshot: saved, retired: true }));
          storage.removeItem(CENTRAL_KEY);
        }
      } else if (selection?.role === 'remote') {
        const saved = this.readForRetirement(REMOTE_KEY, savedRemoteSchema);
        if (saved?.selectionId === selection.id) {
          storage.removeItem(REMOTE_KEY);
        }
        if (this.readForRetirement(RECEIPT_KEY, receiptSchema)?.selectionId === selection.id) {
          storage.removeItem(RECEIPT_KEY);
        }
      }
    };
    try {
      if (this.dependencies.locks) {
        await this.dependencies.locks.request(CENTRAL_LOCK, retire);
      } else {
        retire();
      }
      if (this.retirement === retirement) {
        this.retirement = null;
      }
      if (this.isCurrent(operation)) {
        this.update({ storageError: null });
      }
    } catch {
      const message =
        'This device left the table, but its saved copy could not be removed. Try again before reloading.';
      if (this.isCurrent(operation)) {
        this.update({
          role: retirement.role,
          snapshot,
          connection: 'This device left the table',
          storageError: message,
        });
      }
      throw new Error(message);
    } finally {
      if (this.isCurrent(operation)) {
        this.update({ busy: false });
      }
    }
  }

  setListening(enabled: boolean): void {
    if (this.state.role !== 'central' || !this.ensureLocalAuthority() || !this.session) {
      return;
    }
    if (enabled && this.session.getSnapshot().auction.controlMode === 'manual') {
      this.feedback('Listening is off while a moderator controls bidding.');
      return;
    }
    this.listeningRequested = enabled;
    if (!enabled) {
      this.voice?.stop();
      this.voiceContextKey = null;
      this.update({ listening: false, voiceMessage: '' });
      return;
    }
    const voice = this.getVoice();
    const run = this.run;
    const context = this.session.captureContext();
    const key = contextKey(context);
    this.voiceContextKey = key;
    void voice.start(context, key).catch((error: unknown) => {
      if (this.voiceContextKey !== key) {
        return;
      }
      if (this.run === run && this.listeningRequested) {
        this.update({ listening: false, voiceMessage: messageOf(error) });
      }
    });
    this.updateVoiceContext();
  }

  setAnnouncements(enabled: boolean): void {
    if (this.state.role !== 'central' || !this.ensureLocalAuthority() || !this.session) {
      return;
    }
    this.update({ announcing: enabled });
    this.getVoice().setAnnouncements(enabled);
    if (enabled) {
      this.announce();
    }
  }

  showRecovery(): void {
    this.recoveryRequested = true;
    this.update({ recovering: true });
  }
  hideRecovery(): void {
    this.recoveryRequested = false;
    if (this.state.connected) {
      this.update({ recovering: false });
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.interrupt();
    this.disposed = true;
    this.operation += 1;
    this.abort?.abort();
    this.stopCurrent();
    this.listeners.clear();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChanged);
      document.removeEventListener('freeze', this.interrupt);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.interrupt);
      window.removeEventListener('storage', this.storageChanged);
    }
  }

  private update(change: Partial<BiddingClientState>): void {
    if (
      this.disposed ||
      Object.entries(change).every(([key, value]) => this.state[key as keyof BiddingClientState] === value)
    ) {
      return;
    }
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) {
      listener();
    }
  }

  private feedback(line: string): void {
    this.update({ feedback: [line, ...this.state.feedback].slice(0, 5) });
  }

  private beginOperation(): number {
    this.abort?.abort();
    this.abort = new AbortController();
    this.update({ busy: true, error: null });
    return ++this.operation;
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && this.operation === operation;
  }

  private stopCurrent(): void {
    this.run += 1;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.timer = undefined;
    this.heartbeat = undefined;
    this.timerKey = null;
    this.clearPending();
    this.unsubscribeSession?.();
    this.unsubscribeSession = undefined;
    this.session?.close();
    this.session = null;
    this.link?.close();
    this.link = null;
    this.linkState = null;
    this.voice?.dispose();
    this.voice = null;
    this.voiceContextKey = null;
    this.listeningRequested = false;
    this.lastAuthorityAt = 0;
    this.lastSyncAt = -Infinity;
    this.centralAddress = null;
    this.update({
      listening: false,
      announcing: false,
      voiceMessage: '',
      deadline: null,
      connectedDeviceIds: NO_CONNECTED_DEVICES,
    });
  }

  private installCentral(
    address: BiddingTableAddress,
    snapshot: BiddingSnapshot,
    recovering: boolean,
    receivedAt: number | null = null
  ): void {
    this.stopCurrent();
    this.address = { code: address.code, tableId: address.tableId };
    this.centralAddress = address;
    this.copy = null;
    this.recoveryRequested = false;
    this.session = new BiddingSession({
      identity: {
        tableId: snapshot.tableId,
        code: snapshot.code,
        centralInstanceId: snapshot.centralInstanceId,
        generation: snapshot.generation,
      },
      auction: snapshot.auction,
      assignments: snapshot.assignments,
      moderatorDeviceId: snapshot.moderatorDeviceId,
      revision: snapshot.revision,
    });
    this.update({
      role: 'central',
      deviceId: this.device.id,
      snapshot: this.session.getSnapshot(),
      deadline: null,
      connection: 'Connecting phone remotes',
      connected: true,
      pending: false,
      feedback: [],
      error: null,
      receivedAt,
      recovering,
      busy: false,
      joinPersisted: false,
    });
    this.claimSelection('central');
    /* Callers hold CENTRAL_LOCK where browser locks are available; this write claims the selected table. */
    this.write(CENTRAL_OWNER_KEY, { snapshot: { ...biddingContextOf(snapshot), code: snapshot.code }, retired: false });
    this.write(CENTRAL_KEY, this.centralRecord());
    this.unsubscribeSession = this.session.subscribe(() => this.centralChanged());
    this.synchronizeTimer();
    this.openLink('central');
    this.heartbeat = setInterval(() => {
      if (!this.ensureLocalAuthority() || !this.session) {
        return;
      }
      if (this.dependencies.now() - this.lastSnapshotAt >= SNAPSHOT_MS) {
        this.publish();
      } else {
        this.link?.send('remotes', this.alive());
      }
    }, HEARTBEAT_MS);
  }

  private openLink(role: 'central' | 'remote'): void {
    if (!this.address) {
      return;
    }
    const run = this.run;
    this.link = this.dependencies.link({
      address: this.address,
      role,
      device: this.device,
      centralSecret: this.centralAddress?.centralSecret,
      centralInstanceId: this.session?.getSnapshot().centralInstanceId,
      generation: this.session?.getSnapshot().generation,
      onState: (state) => {
        if (this.run === run && !this.disposed) {
          this.connectionChanged(state);
        }
      },
      onMessage: (from, data) => {
        if (this.run === run && !this.disposed) {
          this.received(from, data);
        }
      },
    });
  }

  private connectionChanged(state: BiddingLinkState): void {
    const prior = this.linkState;
    this.linkState = state;
    if (state.tableId && this.address) {
      this.address.tableId = state.tableId;
    }
    if (state.status === 'replaced' || state.status === 'refused') {
      /* A displaced tab must not overwrite the replacement's persisted generation with its older copy. */
      this.stopCurrent();
      this.update({
        connected: false,
        listening: false,
        announcing: false,
        deadline: null,
        connection: state.status === 'replaced' ? 'This connection was replaced' : 'Table connection refused',
        error: state.reason || 'Reconnect deliberately to choose which device controls the table.',
        recovering: this.state.role === 'remote' && this.copy !== null,
      });
      return;
    }
    if (this.state.role === 'central') {
      this.centralConnectionChanged(state, prior);
    } else {
      this.remoteConnectionChanged(state, prior);
    }
  }

  private centralConnectionChanged(state: BiddingLinkState, prior: BiddingLinkState | null): void {
    const connection = state.direct.length
      ? 'Direct phone connections'
      : state.relay
        ? 'Phone relay connected'
        : 'Phone relay unavailable';
    this.update({
      connection,
      connected: this.session !== null,
      connectedDeviceIds: connectedRemoteIds(state, this.state.connectedDeviceIds),
    });
    if (!state.relay && !state.direct.length) {
      return;
    }
    const oldPeers = new Set(prior?.remotes ?? []);
    for (const id of state.remotes) {
      if (!oldPeers.has(id)) {
        this.publish(id);
      }
    }
    if (!prior?.relay && state.relay) {
      this.publish();
    }
  }

  private remoteConnectionChanged(state: BiddingLinkState, prior: BiddingLinkState | null): void {
    const usable = state.central && (state.relay || state.direct.includes('central'));
    const previouslyUsable = prior?.central && (prior.relay || prior.direct.includes('central'));
    if (usable && !previouslyUsable) {
      this.requestSync();
    } else if (!usable) {
      this.remoteUnavailable();
    }
    if (this.state.connected) {
      this.update({
        connection: state.direct.includes('central') ? 'Direct to the table' : 'Connected through the relay',
      });
    }
  }

  private centralChanged(): void {
    if (!this.ensureLocalAuthority() || !this.session) {
      return;
    }
    const before = this.state.snapshot;
    const snapshot = this.session.getSnapshot();
    this.update({ snapshot });
    this.synchronizeTimer();
    if (snapshot.auction.controlMode === 'manual' && this.listeningRequested) {
      this.setListening(false);
    }
    this.updateVoiceContext();
    this.persistCentral();
    this.publish();
    if (
      !before ||
      before.auction.opportunity !== snapshot.auction.opportunity ||
      before.auction.stage !== snapshot.auction.stage
    ) {
      this.announce();
    }
  }

  private synchronizeTimer(): void {
    const snapshot = this.session?.getSnapshot();
    const key =
      snapshot?.auction.stage === 'active' && snapshot.auction.controlMode !== 'manual' && snapshot.auction.seconds > 0
        ? `${contextKey(biddingContextOf(snapshot))}/${snapshot.auction.seconds}`
        : null;
    if (key === this.timerKey) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    this.timerKey = key;
    if (!key || !snapshot) {
      this.update({ deadline: null });
      return;
    }
    const context = biddingContextOf(snapshot);
    const deadline = this.dependencies.now() + snapshot.auction.seconds * 1000;
    this.update({ deadline });
    this.timer = setTimeout(() => {
      if (!this.ensureLocalAuthority() || !this.session || this.timerKey !== key) {
        return;
      }
      if (
        this.dependencies.now() - deadline > TIMER_INTERRUPTION_MS ||
        (typeof document !== 'undefined' && document.hidden)
      ) {
        this.interrupt();
        this.feedback('The central device was interrupted. Check the table, then Resume.');
      } else {
        const result = this.session.dispatch({ type: 'pass' }, context);
        if (result.accepted) {
          this.feedback('The timer expired. This turn passed.');
        }
      }
    }, snapshot.auction.seconds * 1000);
  }

  private publication(): BiddingPublication | null {
    if (!this.session) {
      return null;
    }
    return {
      type: 'state',
      snapshot: this.session.getSnapshot(),
      deadline: this.state.deadline,
      sentAt: this.dependencies.now(),
    };
  }

  private alive(): z.infer<typeof aliveSchema> | null {
    const snapshot = this.session?.getSnapshot();
    return snapshot
      ? {
          type: 'alive',
          tableId: snapshot.tableId,
          centralInstanceId: snapshot.centralInstanceId,
          generation: snapshot.generation,
          revision: snapshot.revision,
          deadline: this.state.deadline,
          sentAt: this.dependencies.now(),
        }
      : null;
  }

  private publish(to = 'remotes'): void {
    if (!this.ensureLocalAuthority()) {
      return;
    }
    const publication = this.publication();
    if (!publication) {
      return;
    }
    this.link?.send(to, publication);
    this.lastSnapshotAt = this.dependencies.now();
  }

  private received(from: string, data: unknown): void {
    if (this.state.role === 'central' && this.session && from !== 'central') {
      this.receivedCommand(from, data);
      return;
    }
    if (this.state.role !== 'remote' || from !== 'central' || !this.address?.tableId) {
      return;
    }
    const result = biddingResultSchema.safeParse(data);
    if (result.success) {
      this.receivedResult(result.data);
      return;
    }
    const alive = aliveSchema.safeParse(data);
    if (alive.success) {
      this.receivedAlive(alive.data);
      return;
    }
    this.receivedPublication(data, this.address.tableId, this.address.code);
  }

  private receivedCommand(from: string, data: unknown): void {
    if (!this.ensureLocalAuthority() || !this.session) {
      return;
    }
    if (syncSchema.safeParse(data).success) {
      this.publish(from);
      return;
    }
    const session = this.session;
    const revision = session.getSnapshot().revision;
    const result = session.receive(from, data);
    if (this.session !== session) {
      return;
    }
    if (result.accepted && result.revision > revision) {
      this.feedback(result.reason);
    }
    this.link?.send(from, result);
  }

  private receivedAlive(alive: z.infer<typeof aliveSchema>): void {
    const current = this.copy?.snapshot;
    if (
      !current ||
      alive.tableId !== current.tableId ||
      alive.centralInstanceId !== current.centralInstanceId ||
      alive.generation !== current.generation ||
      alive.revision > current.revision
    ) {
      this.requestSync();
      return;
    }
    if (alive.revision < current.revision) {
      return;
    }
    this.authorityPresent(alive.deadline, alive.sentAt);
  }

  private receivedPublication(data: unknown, tableId: string, code: string): void {
    const received = acceptBiddingPublication(this.copy, data, tableId, this.dependencies.now());
    if (!received.accepted || !received.copy || !received.publication || received.copy.snapshot.code !== code) {
      return;
    }
    const before = this.copy?.snapshot;
    const snapshot = received.copy.snapshot;
    const generationChanged =
      before && (before.centralInstanceId !== snapshot.centralInstanceId || before.generation !== snapshot.generation);
    if (generationChanged) {
      if (this.pending) {
        this.feedback('The table restored. The previous pending action was discarded.');
      }
      this.clearPending();
      this.sequence = snapshot.commandSequences[this.device.id] ?? 0;
    }
    this.copy = received.copy;
    this.sequence = Math.max(this.sequence, snapshot.commandSequences[this.device.id] ?? 0);
    this.update({ snapshot, receivedAt: received.copy.receivedAt, error: null });
    this.authorityPresent(received.publication.deadline, received.publication.sentAt);
    this.persistRemote(received.changed);
    if (before?.assignments[this.device.id] && !snapshot.assignments[this.device.id]) {
      this.feedback('This faction is using another remote. Choose a faction to take control again.');
    }
    this.finishPending();
  }

  private persistRemote(changed: boolean, locked = false): void {
    const copy = this.copy;
    const selection = this.selection;
    if (!copy || !selection) {
      return;
    }
    const epoch = this.persistenceEpoch;
    const save = () => {
      if (
        this.persistenceEpoch !== epoch ||
        this.selection !== selection ||
        this.readText(LAST_ROLE_KEY) !== JSON.stringify(selection)
      ) {
        return;
      }
      const snapshot = copy.snapshot;
      const copied =
        changed || !this.state.joinPersisted
          ? this.write(REMOTE_KEY, {
              version: 1,
              selectionId: selection.id,
              address: { code: snapshot.code, tableId: snapshot.tableId },
              snapshot,
              receivedAt: copy.receivedAt,
            })
          : true;
      const receipted = this.write(RECEIPT_KEY, {
        selectionId: selection.id,
        tableId: snapshot.tableId,
        centralInstanceId: snapshot.centralInstanceId,
        revision: snapshot.revision,
        receivedAt: copy.receivedAt,
      });
      if (copied && receipted && this.selection === selection) {
        this.update({ joinPersisted: true });
      }
    };
    if (this.dependencies.locks && !locked) {
      void this.dependencies.locks.request(CENTRAL_LOCK, save).catch(() => this.saveFailed(epoch));
    } else {
      save();
    }
  }

  private authorityPresent(deadline: number | null, sentAt: number): void {
    this.lastAuthorityAt = this.dependencies.now();
    const localDeadline = deadline === null ? null : this.lastAuthorityAt + Math.max(0, deadline - sentAt);
    const changedDeadline =
      localDeadline === null || this.state.deadline === null || Math.abs(localDeadline - this.state.deadline) > 250;
    this.update({
      connected: true,
      connection: this.linkState?.direct.includes('central') ? 'Direct to the table' : 'Connected through the relay',
      ...(!this.recoveryRequested ? { recovering: false } : {}),
      ...(changedDeadline ? { deadline: localDeadline } : {}),
    });
  }

  private remoteUnavailable(): void {
    if (this.state.role !== 'remote') {
      return;
    }
    if (
      this.linkState?.direct.includes('central') &&
      this.dependencies.now() - this.lastAuthorityAt <= REMOTE_SILENCE_MS
    ) {
      return;
    }
    this.update({
      connected: false,
      deadline: null,
      connection: this.copy ? 'Central device unavailable' : 'Waiting for the central device',
      recovering: this.copy !== null,
    });
  }

  private requestSync(): void {
    if (this.dependencies.now() - this.lastSyncAt < 500) {
      return;
    }
    this.lastSyncAt = this.dependencies.now();
    this.link?.send('central', { type: 'sync' });
  }

  private sendPending(): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    pending.attempts += 1;
    this.link?.send('central', pending.command);
    if (this.pending !== pending) {
      return;
    }
    pending.timer = setTimeout(() => {
      if (this.pending !== pending) {
        return;
      }
      if (pending.result) {
        this.requestSync();
        this.feedback('The table answered, but its new state has not arrived. Check the central display.');
        this.clearPending();
      } else if (pending.attempts < 2) {
        this.sendPending();
      } else {
        this.feedback('No action result arrived. Check the table before trying again.');
        this.clearPending();
      }
    }, COMMAND_WAIT_MS);
  }

  private receivedResult(result: BiddingResult): void {
    if (!this.pending || this.pending.command.commandId !== result.commandId) {
      return;
    }
    this.pending.result = result;
    if (!result.accepted) {
      this.feedback(result.reason);
      this.clearPending();
      this.requestSync();
    } else {
      this.finishPending();
    }
  }

  private finishPending(): void {
    const pending = this.pending;
    if (!pending?.result || !this.copy || this.copy.snapshot.revision < pending.result.revision) {
      return;
    }
    this.feedback(pending.result.reason);
    this.clearPending();
  }

  private clearPending(): void {
    if (this.pending) {
      clearTimeout(this.pending.timer);
    }
    this.pending = null;
    this.update({ pending: false });
  }

  private getVoice(): BiddingVoice<BiddingContext> {
    if (this.voice) {
      return this.voice;
    }
    const run = this.run;
    this.voice = this.dependencies.voice({
      onState: (state) => {
        if (this.run !== run || this.disposed) {
          return;
        }
        if (!this.listeningRequested || this.session?.getSnapshot().auction.controlMode === 'manual') {
          return;
        }
        if (['off', 'interrupted', 'failed', 'unsupported'].includes(state.status)) {
          this.listeningRequested = false;
        }
        this.update({
          listening: state.status === 'listening' || state.status === 'loading',
          voiceMessage: state.message ?? (state.status === 'listening' ? 'Listening for bidding commands' : ''),
        });
      },
      onCommand: (command, context) => {
        if (this.run !== run || this.disposed) {
          return;
        }
        if (!this.session || !this.listeningRequested) {
          return;
        }
        this.voice?.cancelAnnouncement();
        this.act(
          command.type === 'raise'
            ? { type: 'bid', amount: (this.session.getSnapshot().auction.high?.amount ?? 0) + 1 }
            : command,
          context
        );
      },
    });
    this.voice.setAnnouncements(this.state.announcing);
    return this.voice;
  }

  private updateVoiceContext(): void {
    if (!this.voice || !this.listeningRequested || !this.session) {
      return;
    }
    const snapshot = this.session.getSnapshot();
    const context =
      snapshot.auction.stage === 'active' && snapshot.auction.controlMode !== 'manual'
        ? biddingContextOf(snapshot)
        : null;
    const key = context ? contextKey(context) : null;
    if (key === this.voiceContextKey) {
      return;
    }
    this.voiceContextKey = key;
    this.voice.setContext(context, key);
    this.voice.cancelAnnouncement();
  }

  private announce(): void {
    if (!this.state.announcing || !this.session) {
      return;
    }
    const auction = this.session.getSnapshot().auction;
    const name = auction.seats.find((seat) => seat.id === auction.turn)?.name ?? '';
    const text =
      auction.stage === 'active'
        ? `${name}, your turn. ${auction.high ? `Highest offer, ${auction.high.amount} spice.` : 'No offer yet.'}`
        : auction.stage === 'paused'
          ? 'The table is paused.'
          : auction.stage === 'ready'
            ? auction.opener === null
              ? 'The table is ready. Choose the first bidder.'
              : 'Ready for a new bid. Choose the starting faction.'
            : auction.stage === 'over'
              ? 'The phase is complete.'
              : 'Set up the table.';
    this.getVoice().announce(text);
  }

  private visibilityChanged = (): void => {
    if (document.hidden) {
      this.interrupt();
    }
  };

  private interrupt = (): void => {
    if (this.disposed || !this.ensureLocalAuthority() || !this.session) {
      return;
    }
    this.setListening(false);
    this.voice?.cancelAnnouncement();
    if (this.session.getSnapshot().auction.stage !== 'paused') {
      this.session.dispatch({ type: 'pause' });
    }
  };

  private centralRecord(): SavedCentral | null {
    return this.session && this.centralAddress
      ? {
          version: 1,
          address: this.centralAddress,
          device: this.device,
          snapshot: this.session.getSnapshot(),
        }
      : null;
  }

  private displacedBy(saved: SavedOwnership | null, snapshot: BiddingSnapshot): boolean {
    if (!saved) {
      return false;
    }
    return (
      saved.retired === true ||
      saved.snapshot.tableId !== snapshot.tableId ||
      saved.snapshot.generation > snapshot.generation ||
      (saved.snapshot.generation === snapshot.generation &&
        saved.snapshot.centralInstanceId !== snapshot.centralInstanceId)
    );
  }

  private ensureLocalAuthority(): boolean {
    const snapshot = this.session?.getSnapshot();
    if (!snapshot) {
      return false;
    }
    if (!this.displacedBy(this.readOwnership(), snapshot)) {
      return true;
    }
    this.stopCurrent();
    this.update({
      connected: false,
      connection: 'Another tab controls the table',
      error: 'This browser opened a newer central table. Reload to restore that table.',
    });
    return false;
  }

  private storageChanged = (event: StorageEvent): void => {
    if ((event.key === CENTRAL_KEY || event.key === CENTRAL_OWNER_KEY) && this.session) {
      this.ensureLocalAuthority();
    }
  };

  private persistCentral(): void {
    const record = this.centralRecord();
    if (!record) {
      return;
    }
    const epoch = this.persistenceEpoch;
    const selection = this.selection;
    const save = () => {
      if (this.persistenceEpoch !== epoch || this.selection !== selection) {
        return;
      }
      if (this.displacedBy(this.readOwnership(), record.snapshot)) {
        this.ensureLocalAuthority();
        return;
      }
      const saved = this.read(CENTRAL_KEY, savedOwnershipSchema);
      if (
        saved?.snapshot.centralInstanceId === record.snapshot.centralInstanceId &&
        saved.snapshot.revision >= record.snapshot.revision
      ) {
        return;
      }
      this.write(CENTRAL_KEY, record);
    };
    /* A queued save keeps its complete revision, but cannot overwrite a newer central claim while waiting. */
    if (this.dependencies.locks) {
      void this.dependencies.locks.request(CENTRAL_LOCK, save).catch(() => this.saveFailed(epoch));
    } else {
      save();
    }
  }

  private readRemote(): z.infer<typeof savedRemoteSchema> | null {
    const saved = this.read(REMOTE_KEY, savedRemoteSchema);
    if (!saved || saved.snapshot.tableId !== saved.address.tableId || saved.snapshot.code !== saved.address.code) {
      return null;
    }
    const receipt = this.read(RECEIPT_KEY, receiptSchema);
    if (
      receipt &&
      receipt.tableId === saved.snapshot.tableId &&
      receipt.centralInstanceId === saved.snapshot.centralInstanceId &&
      receipt.revision === saved.snapshot.revision
    ) {
      return { ...saved, receivedAt: receipt.receivedAt };
    }
    return saved;
  }

  private claimSelection(role: 'central' | 'remote'): void {
    const selection = { role, id: this.dependencies.uuid() };
    this.selection = selection;
    this.retirement = null;
    this.selectionBaseRole = this.readText(LAST_ROLE_KEY);
    this.selectionClaimed = false;
    const epoch = this.persistenceEpoch;
    const claim = () => {
      if (this.selection !== selection || this.persistenceEpoch !== epoch) {
        return;
      }
      this.selectionClaimed = this.write(LAST_ROLE_KEY, selection);
      if (role === 'remote') {
        this.persistRemote(true, true);
      }
    };
    if (role === 'remote' && this.dependencies.locks) {
      void this.dependencies.locks.request(CENTRAL_LOCK, claim).catch(() => this.saveFailed(epoch));
    } else {
      claim();
    }
  }

  private readOwnership(): SavedOwnership | null {
    return this.read(CENTRAL_OWNER_KEY, savedOwnershipSchema) ?? this.read(CENTRAL_KEY, savedOwnershipSchema);
  }

  private readForRetirement<T>(key: string, schema: z.ZodType<T>): T | null {
    const raw = this.dependencies.storage!.getItem(key);
    return raw ? schema.parse(JSON.parse(raw)) : null;
  }

  private saveFailed(epoch: number): void {
    if (this.persistenceEpoch === epoch) {
      this.update({
        storageError: 'The recovery copy could not be saved. Live play continues; keep another device connected.',
      });
    }
  }

  private read<T>(key: string, schema: z.ZodType<T>): T | null {
    const raw = this.readText(key);
    if (!raw) {
      return null;
    }
    try {
      if (new TextEncoder().encode(raw).byteLength > BIDDING_SNAPSHOT_BYTES + 16_384) {
        throw new Error('The saved table is too large.');
      }
      const result = schema.safeParse(JSON.parse(raw));
      if (result.success) {
        return result.data;
      }
      this.update({
        storageError:
          'A saved bidding copy is invalid. Live play is available, but that copy cannot restore the table.',
      });
    } catch {
      this.update({ storageError: 'A saved bidding copy could not be read. Live play is still available.' });
    }
    return null;
  }

  private readText(key: string): string | null {
    try {
      if (!this.dependencies.storage) {
        throw new Error('Storage unavailable');
      }
      return this.dependencies.storage.getItem(key);
    } catch {
      this.update({ storageError: 'Browser storage is unavailable. This device cannot keep a recovery copy.' });
      return null;
    }
  }

  private write(key: string, value: unknown): boolean {
    return this.writeText(key, JSON.stringify(value));
  }

  private writeText(key: string, value: string): boolean {
    try {
      if (!this.dependencies.storage) {
        throw new Error('Storage unavailable');
      }
      this.dependencies.storage.setItem(key, value);
      return true;
    } catch {
      this.update({
        storageError: 'The recovery copy could not be saved. Live play continues; keep another device connected.',
      });
      return false;
    }
  }
}
