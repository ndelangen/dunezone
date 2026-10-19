import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { ConvexHttpClient } from 'convex/browser';
import type { FunctionReturnType } from 'convex/server';
import WebSocket from 'ws';
import type { z } from 'zod';

import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { playTicketResultSchema } from '../../src/shared/play/admission.ts';
import { loadCaseSchema } from '../../src/shared/play/loadTarget.ts';
import type workload from '../../src/shared/play/loadWorkload.json';
import type {
  ClientMessage,
  CommitMessage,
  GameSnapshot,
  PieceAction,
  ServerMessage,
} from '../../src/shared/play/protocol.ts';
import { KEEPALIVE_INTERVAL_MS, KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol.ts';
import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import { setAdminAuth, adminMutationReference } from '../lib/convex-admin.ts';
import { loopbackOrigin } from '../lib/isolated-stack.ts';
import { provisionAccounts } from '../lib/synthetic-accounts.ts';
import { browsers } from './browsers.ts';
import { cpuProfile } from './cpu.ts';
import { failureMessage } from './failure.ts';
import { captureSource, prepareDirectory } from './files.ts';
import { hostLoad, measureIdle } from './host-load.ts';
import { openHostedSession } from './hosted-session.ts';
import { interactions } from './interactions.ts';
import { distribution, measurements } from './measurements.ts';
import { runMotionSchedule } from './motion.ts';
import type { ActionSlot } from './pacing.ts';
import { runActionSchedule } from './pacing.ts';
import { runnerProfiles } from './profiles.ts';
import { sizeUpdate, updateLedger } from './redundancy.ts';
import type { CommandSend } from './room-timing.ts';
import { roomTiming } from './room-timing.ts';
import { slowLink } from './slow-link.ts';
import { createTrace } from './trace.ts';
import type {
  Peer,
  PeerUser,
  ViewMessage,
  MetricsMessage,
  Phase,
  InteractionSample,
  InteractionSlot,
} from './types.ts';
import { readServerMessage } from './wire.ts';

/** Bun adds fetch.preconnect to its declaration; preserve it when replacing fetch for a bounded request. */
function signalFetch(signal: () => AbortSignal): typeof fetch {
  return Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      fetch(input, { ...init, signal: signal() }),
    fetch
  );
}

/*
 * The bundle targets Node 22 and the runner reads import.meta.dirname; an older Node fails later and unclearly.
 * Bun reports itself as a recent Node, and its ws shim has no upgrade event, so the wire measurement needs Node itself.
 */
assert.ok(
  Number(process.versions.node.split('.')[0]) >= 22 && !process.versions.bun,
  `Node 22 or later is required, not bun; this is ${process.versions.bun ? `bun ${process.versions.bun}` : process.version}.`
);
const { values } = parseArgs({
  options: {
    origin: { type: 'string' },
    profile: { type: 'string', default: 'stacked' },
    case: { type: 'string', default: 'probe' },
    'report-dir': { type: 'string' },
    seed: { type: 'string' },
    'worker-pid': { type: 'string' },
    'profile-cpu': { type: 'boolean', default: false },
    compression: { type: 'string', default: 'on' },
    'backend-pid': { type: 'string' },
    'max-bytes': { type: 'string' },
    repetition: { type: 'string', default: '1' },
    'hosted-run': { type: 'string' },
  },
});
const profile = runnerProfiles.find((profile) => profile === values.profile);
assert.ok(profile);
values.profile = profile;
const loadCase = loadCaseSchema.parse(values.case);
values.case = loadCase;
assert.ok(values.origin && values['report-dir']);
assert.ok(['on', 'off'].includes(values.compression));
assert.ok(values.case !== 'browser' || values.compression === 'on', 'Browser compression uses browser negotiation.');
const local = {
  CONVEX_SELF_HOSTED_URL: process.env.CONVEX_SELF_HOSTED_URL,
  CONVEX_SELF_HOSTED_ADMIN_KEY: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
};
const hosted = values['hosted-run'] ? await openHostedSession(values['hosted-run'], values) : null;
assert.ok(hosted || (local.CONVEX_SELF_HOSTED_URL && local.CONVEX_SELF_HOSTED_ADMIN_KEY));
/* A hosted run's origins come from the target record that the session validated; a local run takes loopback only. */
const origin = new URL(hosted ? values.origin : loopbackOrigin(values.origin, '--origin'));
const backend = new URL(
  hosted ? hosted.target.backendOrigin : loopbackOrigin(local.CONVEX_SELF_HOSTED_URL, 'CONVEX_SELF_HOSTED_URL')
);
const directory = await prepareDirectory(values['report-dir']);
const source = await captureSource(directory);
const manifestText = await readFile(new URL('../../src/shared/play/loadWorkload.json', import.meta.url), 'utf8');
const manifest: typeof workload = JSON.parse(manifestText);
const maxBytes = hosted?.cell.maxApplicationBytes ?? Number(values['max-bytes'] ?? manifest.probe.maxApplicationBytes);
assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0);
assert.ok(
  values.case !== 'probe' || maxBytes === manifest.probe.maxApplicationBytes,
  'The sizing probe retains its agreed byte limit.'
);
const repetition = Number(values.repetition);
assert.ok(Number.isInteger(repetition) && repetition >= 1 && repetition <= manifest.repetitions);
const seed = Number(values.seed ?? manifest.seed + repetition - 1);
assert.ok(Number.isSafeInteger(seed));
/**
 * Client geography and edge placement come from the edge's own trace, without the client address.
 * The origin is the validated target record's, which the session already matched against the argument.
 */
async function placement() {
  assert.ok(hosted);
  const limitation =
    'The edge location serving the coordinator, not the Durable Object placement, which the provider does not expose here.';
  try {
    const response = await fetch(`${hosted.target.applicationOrigin}/cdn-cgi/trace`, {
      signal: AbortSignal.timeout(15_000),
    });
    const fields = Object.fromEntries(
      (await response.text())
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => line.split('=', 2))
    );
    return {
      clientCountry: fields.loc ?? null,
      edgeColo: fields.colo ?? null,
      controllerEdgeColo: hosted.initial.edgeColo,
      unsettledActivationReads: hosted.initial.unsettledReads,
      http: fields.http ?? null,
      tls: fields.tls ?? null,
      limitation,
    };
  } catch (error) {
    return {
      error: failureMessage(error),
      controllerEdgeColo: hosted.initial.edgeColo,
      unsettledActivationReads: hosted.initial.unsettledReads,
      limitation,
    };
  }
}
const warmupSeconds = values.case === 'steady' ? manifest.warmupSeconds : 0;
const measuredSeconds =
  (
    { steady: manifest.measuredSeconds, slow: manifest.slowObserver.seconds } as Partial<
      Record<typeof loadCase, number>
    >
  )[loadCase] ?? manifest.probe.seconds;
const initialReport = {
  status: 'running',
  startedAt: new Date().toISOString(),
  profile: values.profile,
  case: values.case,
  seed,
  repetition,
  sourceRevision: source.revision,
  /* The coordinator is a bundle built from the tree; its own digest shows whether it was rebuilt for this tree. */
  coordinatorSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  workingTreeDiffSha256: createHash('sha256').update(source.trackedDiff).digest('hex'),
  untrackedSourceSha256: createHash('sha256').update(JSON.stringify(source.untrackedSources)).digest('hex'),
  manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
  environment: {
    origin: origin.origin,
    backend: backend.origin,
    kind: hosted ? 'synthetic-hosted' : 'synthetic-loopback',
    ...(hosted ? { target: hosted.target, run: hosted.run, cell: hosted.cell, placement: await placement() } : {}),
  },
  clock:
    'One coordinator uses performance.now for source dispatch and recipient projection application; process scheduling and parsing are included.',
  bounds: {
    warmupSeconds,
    measuredSeconds,
    maxApplicationBytes: maxBytes,
    finalObservationMs: 5000,
    /*
     * The wall bound includes creating the accounts, signing in and admitting every connection; signing up and admitting took about 105 s on the 28 September hosted cells.
     * Each browser then signs in and loads the table twice, and the hosted browser cell reached motion 226 s in, so it gets three more minutes.
     */
    wallSeconds: Math.max(240, warmupSeconds + measuredSeconds + 120) + (values.case === 'browser' ? 180 : 0),
  },
  limitations: [
    hosted
      ? 'Hosted timing includes the coordinator network path; fixture budget reservations add storage overhead.'
      : 'Local timing is not hosted latency.',
    'Synthetic public content excludes private mechanics and catalogue image acceptance.',
    'Protocol recipients do not measure browser rendering.',
  ],
  bytes: { sent: 0, received: 0 },
  sentMessages: 0,
  deliveries: 0,
  keepalives: 0,
  compression: values.compression,
  resyncs: 0,
  transmittedMotion: 0,
  coalescedInputs: 0,
  actions: {
    offered: 0,
    accepted: 0,
    rejected: 0,
    failed: 0,
    byOperation: {} as Record<string, { offered: number; accepted: number; rejected: number; failed: number }>,
  },
  admissionAttempts: [] as {
    peer: number;
    attempt: number;
    result: string;
    message?: string;
    simultaneous: boolean;
    retryAfterMs?: number;
  }[],
  reconnects: [] as { peer: number; count: number; ms: number }[],
  rejections: [] as { peer: number; requestId: string; message: string }[],
  checks: [] as string[],
};
function assess(summary: HistogramSummary, target: number, missing = 0) {
  return {
    ...summary,
    target,
    missing,
    status: missing
      ? 'incomplete'
      : !summary.samples
        ? 'not-measured'
        : summary.p95 !== null && summary.p95 > target
          ? 'failed'
          : 'within-target',
  };
}
type HistogramSummary = ReturnType<typeof distribution>;
type TimingReport = Awaited<ReturnType<ReturnType<typeof measurements>['finish']>>;
type CpuReport = Awaited<ReturnType<Awaited<ReturnType<typeof cpuProfile>>['finish']>>;
type BrowserRun = Awaited<ReturnType<typeof browsers<Peer>>>;
type FinishedInteractions = ReturnType<ReturnType<typeof interactions>['finish']>;
type ClientReport = {
  peer: number;
  recipientClass: string;
  sentBytes: number;
  receivedBytes: number;
  messagesByType: NonNullable<Peer['messagesByType']>;
  closes: NonNullable<Peer['closes']>;
  transport: { extensions: string | null; receivedBytes: number; sentBytes: number }[];
} & ReturnType<ReturnType<typeof measurements>['client']>;
type ActionCounters = typeof initialReport.actions & {
  schedule?: Awaited<ReturnType<typeof runActionSchedule>>;
  completedTraceCycles?: number;
  scheduledMotionRun?: number;
  completedMotionRun?: number;
  uncompletedMotionRun?: number;
};
type RunCompletion = Partial<TimingReport> & {
  host?: { timeOrigin: number; idleBefore: number | null } & Partial<ReturnType<ReturnType<typeof hostLoad>['finish']>>;
  actions: ActionCounters;
  motionDrains?: {
    boundary: string;
    sources: number[];
    ms: number;
    outstanding: ReturnType<ReturnType<typeof measurements>['outstanding']>;
  }[];
  roomTiming?: ReturnType<typeof roomTiming> & {
    stalls: MetricsMessage['stalls'] | null;
    motionDropped: number | null;
    errors: string[];
  };
  actionTimings?: { operation: string; phase: Phase; peer: number; ms: number }[];
  roles?: { peer: number; role?: string; seat: string; identity: number }[];
  actionScheduleSlots?: ActionSlot[];
  workloadFailure?: string;
  serverBefore?: MetricsMessage;
  serverAfter?: Omit<MetricsMessage, 'commands' | 'stalls'>;
  resourcesBefore?: ReturnType<typeof processResources>;
  resourcesAfter?: ReturnType<typeof processResources>;
  bytesBeforeMotion?: { sent: number; received: number };
  slowObserver?: {
    recoveryMs?: number;
    restoredRevision?: number;
    finalCarriesRestored?: boolean;
    peer: number;
    settings: typeof manifest.slowObserver;
    transport: string;
  };
  motionSchedule?: Awaited<ReturnType<typeof runMotionSchedule<Peer>>>;
  motionRunMs?: number;
  measuredMs?: number;
  reconnectFailures?: { count: number; peer: number; message: string }[];
  moverGroups?: { round: number; peers: number[]; rotationStartedAt: number; activeAt: number; rotationMs: number }[];
  error?: string;
  cpu?: CpuReport | { error: string };
  stopReason?: string;
  byteLimitOvershoot?: number;
  limitBoundary?: string;
  measuredApplicationBytes?: number;
  applicationBytesPerSecond?: number;
  estimatedSteadyMatrixApplicationBytes?: number;
  browsers?: Awaited<ReturnType<BrowserRun['collect']>>;
  slowLink?: { upstream: Awaited<ReturnType<typeof slowLink>>['upstream'] } & Awaited<
    ReturnType<typeof slowLink>
  >['totals'];
  cleanup?: string;
  hostedCleanup?: Awaited<ReturnType<NonNullable<typeof hosted>['stop']>> | { error: string };
  hostedStorageCleanup?: string;
  durable?: HistogramSummary;
  updates?: ReturnType<ReturnType<typeof updateLedger>['summary']>;
  interactions?: Omit<FinishedInteractions, 'rows'>;
  perClient?: ClientReport[];
  diagnosticTargets?: {
    limitation: string;
    motionAggregate: ReturnType<typeof assess>;
    motionByRecipientClass: Record<string, ReturnType<typeof assess>>;
    motionByClient: ({ peer: number; recipientClass: string } & ReturnType<typeof assess>)[];
    savedCommandConfirmation: ReturnType<typeof assess>;
    intentToConfirmation: ReturnType<typeof assess>;
    reconnects: { peer: number; count: number; ms: number; status: string }[];
  };
  wire?: { connections: number; receivedBytes: number; sentBytes: number; limitation: string };
  finishedAt?: string;
};
const report: Omit<typeof initialReport, 'actions'> & RunCompletion = { ...initialReport };
const peers: Peer[] = [];
const operations = new AbortController();
const durableSamples: number[] = [];
const redundancy = updateLedger();
let classifiedUpdates = 0;
let sizingNs = 0n;
const interactionTiming = interactions(peers);
const timing = measurements(path.join(directory, 'observations.ndjson'), stop, peers);
let stopping = false;
let stopReason: string | undefined;
type Fixture = Omit<FunctionReturnType<typeof internal.playTesting.createFixture>, 'gameId'> & { gameId: string };
let game: Fixture | undefined;
let link: Awaited<ReturnType<typeof slowLink>> | undefined;
let browserRun: BrowserRun | undefined;
let cpu: Awaited<ReturnType<typeof cpuProfile>> | undefined;
let actionWork: Promise<void> | undefined;
let samplePhase: Phase = 'preparation';
/* The highest revision any saved command was confirmed at; recipients converge on it, not on one recipient's view. */
let confirmedRevision = 0;
/* Every saved command sent, joined at the end with when the room began handling it. */
const commandSends: (Omit<CommandSend, 'peer'> & { peer: Peer })[] = [];
function fixture(): Fixture {
  assert.ok(game);
  return game;
}
function viewOf(peer: Peer): ViewMessage {
  assert.ok(peer.view);
  return peer.view;
}
function carryOf(peer: Peer): string {
  assert.ok(peer.carryId);
  return peer.carryId;
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function stop(reason: string) {
  if (stopping) {
    return;
  }
  stopping = true;
  operations.abort();
  stopReason = reason;
  for (const peer of peers) {
    peer.socket?.terminate();
  }
}
hosted?.assertWindow(report.bounds.wallSeconds);
const hardStop = setTimeout(() => stop('wall-budget'), report.bounds.wallSeconds * 1000);
const interrupted = () => stop('operator-stop');
process.once('SIGINT', interrupted);
process.once('SIGTERM', interrupted);
/*
 * A machine already busy before the run starves the coordinator and its browsers, which reads like a stalled room.
 * Adding timeOrigin to a host or delivery reading gives the wall clock the room's own readings use.
 */
report.host = { timeOrigin: performance.timeOrigin, idleBefore: await measureIdle() };
if (report.host.idleBefore !== null && report.host.idleBefore < 0.5) {
  console.warn(`Only ${Math.round(report.host.idleBefore * 100)}% of this machine's CPU was idle before the run.`);
}
const hostWatch = hostLoad();
function accountBytes(direction: 'sent' | 'received', bytes: number) {
  report.bytes[direction] += bytes;
  if (report.bytes.sent + report.bytes.received >= report.bounds.maxApplicationBytes) {
    stop('byte-budget');
  }
}
async function until<T>(predicate: () => T, label: string, timeout = 15_000): Promise<NonNullable<T>> {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (stopping) {
      throw new Error(stopReason);
    }
    const value = predicate();
    if (value) {
      return value;
    }
    await delay(10);
  }
  throw new Error(label);
}
const clientOptions = {
  logger: false as const,
  fetch: signalFetch(() => AbortSignal.any([operations.signal, AbortSignal.timeout(15_000)])),
};
const admin = new ConvexHttpClient(backend.origin, clientOptions);
const adminKey = hosted?.key ?? local.CONVEX_SELF_HOSTED_ADMIN_KEY;
assert.ok(adminKey);
setAdminAuth(admin, adminKey);
const accountSuffix = hosted?.run.runId ?? process.env.PLAY_LOAD_LOCAL_ACCOUNT_SUFFIX ?? randomBytes(6).toString('hex');
/** The identity's synthetic account, named the way the hosted backend's fixed roster admits it. */
function syntheticAccount(index: number) {
  return { email: `load-${index}-${accountSuffix}@example.invalid`, password: randomBytes(24).toString('hex') };
}
/** Signs a provisioned account in for its protocol connections; it never creates the account. */
async function user(index: number, account: { email: string; password: string }): Promise<PeerUser> {
  const client = new ConvexHttpClient(backend.origin, clientOptions);
  const result = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { flow: 'signIn', ...account },
  });
  assert.ok(result.tokens?.token);
  client.setAuth(result.tokens.token);
  return { client, index, ...account };
}
function send(peer: Peer, message: ClientMessage) {
  if (stopping) {
    return false;
  }
  const text = JSON.stringify(message);
  if (report.bytes.sent + report.bytes.received + Buffer.byteLength(text) >= report.bounds.maxApplicationBytes) {
    stop('byte-budget');
    return false;
  }
  assert.ok(peer.socket instanceof WebSocket);
  assert.equal(
    peer.socket.readyState,
    WebSocket.OPEN,
    `Peer ${peer.index} sent on a socket in readyState ${peer.socket.readyState}; perClient.closes has its close code once the close completes.`
  );
  peer.socket.send(text);
  report.sentMessages++;
  accountBytes('sent', Buffer.byteLength(text));
  peer.sentBytes = (peer.sentBytes ?? 0) + Buffer.byteLength(text);
  return true;
}
function applyResponse(peer: Peer, message: ServerMessage) {
  if (message.type === 'view') {
    peer.view = message;
    peer.authorized = true;
    peer.resyncing = false;
  }
  if (message.type === 'admission') {
    peer.authorized = false;
  }
  if (message.type === 'rejected') {
    report.rejections.push({ peer: peer.index, requestId: message.requestId, message: message.message });
  }
  const key =
    ('completedCommandId' in message ? message.completedCommandId : undefined) ??
    ('requestId' in message ? message.requestId : undefined) ??
    ('carryId' in message ? message.carryId : undefined);
  if (key) {
    peer.responses.set(key, message);
  }
  if (message.type === 'metrics') {
    peer.responses.set('metrics', message);
  }
}
function hydrateUpdate(peer: Peer, message: ServerMessage) {
  if (message.type !== 'update') {
    return message;
  }
  if (peer.resyncing) {
    return null;
  }
  const view = applyRoomUpdate(peer.view, message);
  if (view) {
    return view;
  }
  report.resyncs++;
  peer.resyncing = true;
  if (!peer.browser) {
    send(peer, { type: 'sync' });
  }
  return null;
}
function apply(peer: Peer, packet: ServerMessage) {
  const message = hydrateUpdate(peer, packet);
  if (!message) {
    return;
  }
  applyResponse(peer, message);
  if (message.type !== 'view') {
    return;
  }
  if (message.type === 'view') {
    interactionTiming.observe(peer, message.snapshot.revision);
  }
  peer.activity = message;
  for (const entry of message.pointers) {
    timing.observe(peer, 'pointer', entry);
  }
  for (const entry of message.carries) {
    timing.observe(peer, 'pose', entry);
  }
}
function receivePacket(peer: Peer, data: WebSocket.RawData) {
  const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
  accountBytes('received', raw.byteLength);
  peer.receivedBytes = (peer.receivedBytes ?? 0) + raw.byteLength;
  /* The room answers a keepalive without waking, so the answer is traffic but not a delivery. */
  if (raw.byteLength === KEEPALIVE_PONG.length && raw.toString() === KEEPALIVE_PONG) {
    return;
  }
  report.deliveries++;
  if (stopping) {
    return;
  }
  const message = readServerMessage(raw.toString());
  peer.messagesByType ??= {};
  const counts = (peer.messagesByType[message.type] ??= { deliveries: 0, bytes: 0, maxBytes: 0 });
  counts.deliveries++;
  counts.bytes += raw.byteLength;
  counts.maxBytes = Math.max(counts.maxBytes, raw.byteLength);
  const before = peer.view;
  apply(peer, message);
  if (message.type === 'update' && before && peer.view !== before) {
    const started = process.hrtime.bigint();
    classifiedUpdates++;
    redundancy.add(`protocol-${peer.role}`, sizeUpdate(before, viewOf(peer), message, raw.byteLength), message);
    sizingNs += process.hrtime.bigint() - started;
  }
}
async function drainMotion(movers: Peer[], boundary: string) {
  if (!movers.length) {
    return;
  }
  const sources = new Set(movers.map((peer) => peer.index));
  const started = performance.now();
  try {
    await until(
      () => timing.outstanding(sources).length === 0,
      'Final motion did not reach every expected recipient before cancellation.',
      report.bounds.finalObservationMs
    );
  } finally {
    report.motionDrains ??= [];
    report.motionDrains.push({
      boundary,
      sources: [...sources],
      ms: performance.now() - started,
      outstanding: timing.outstanding(sources),
    });
  }
}
async function issueTicket(peer: Peer, attempt: number, simultaneous: boolean) {
  let issued;
  try {
    issued = await peer.user.client.mutation(api.playAdmission.issueTicket, {
      gameId: fixture().gameId as Id<'play_games'>,
    });
  } catch (error) {
    report.admissionAttempts.push({
      peer: peer.index,
      attempt,
      result: 'ticket-error',
      message: failureMessage(error),
      simultaneous,
      retryAfterMs: 1000,
    });
    await delay(1000);
    return null;
  }
  if (issued.ok) {
    return issued;
  }
  const retryAfterMs = Math.max(1000, issued.retryAfterMs ?? 1000);
  report.admissionAttempts.push({ peer: peer.index, attempt, result: issued.reason, simultaneous, retryAfterMs });
  await delay(retryAfterMs);
  return null;
}
async function openSocket(peer: Peer, issued: Extract<z.infer<typeof playTicketResultSchema>, { ok: true }>) {
  /* A slow peer reaches the origin through the loopback relay; a hosted origin keeps TLS end to end through it. */
  const socketOrigin = peer.slow && link ? link.origin.replace('http:', origin.protocol) : origin.origin;
  const socket = new WebSocket(`${socketOrigin.replace('http', 'ws')}/__play/games/${fixture().gameId}/socket`, {
    origin: origin.origin,
    perMessageDeflate: values.compression === 'on',
    ...(peer.slow ? { headers: { Host: origin.host }, servername: origin.hostname } : {}),
  });
  peer.socket = socket;
  peer.responses = new Map<string, ServerMessage>();
  peer.resyncing = false;
  socket.once('upgrade', (response) => {
    const transport: NonNullable<Peer['transports']>[number] = { socket: response.socket, extensions: null };
    (peer.transports ??= []).push(transport);
    socket.once('open', () => {
      transport.extensions = socket.extensions;
    });
  });
  socket.on('error', () => {});
  socket.on('message', (raw) => receivePacket(peer, raw));
  /* Like the page, every open socket sends a keepalive, since the edge closes a socket idle for 100 s with 1006. */
  const keepalive = setInterval(() => {
    if (!stopping && socket.readyState === WebSocket.OPEN) {
      socket.send(KEEPALIVE_PING);
      report.keepalives++;
      accountBytes('sent', KEEPALIVE_PING.length);
      peer.sentBytes = (peer.sentBytes ?? 0) + KEEPALIVE_PING.length;
    }
  }, KEEPALIVE_INTERVAL_MS).unref();
  /* The room's close code says why a socket went away: 4413 is its message rate limit, 1012 a restart. */
  socket.once('close', (code, reason) => {
    clearInterval(keepalive);
    (peer.closes ??= []).push({ atMs: performance.now(), code, reason: reason.toString().slice(0, 120), stopping });
  });
  await new Promise((resolve) => {
    socket.once('open', resolve);
    socket.once('error', resolve);
  });
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  if (values.compression === 'off' && socket.extensions) {
    throw new Error('The compression-off connection negotiated a WebSocket extension.');
  }
  send(peer, { type: 'admit', supportsBoard: true, ticket: issued.ticket });
  await until(() => peer.view || socket.readyState !== WebSocket.OPEN, 'Admission did not settle.', 7000).catch(
    () => {}
  );
  return Boolean(peer.view);
}
async function connect(peer: Peer, simultaneous = false) {
  const started = performance.now();
  if (peer.browser) {
    assert.ok(browserRun);
    await browserRun.connect(peer);
    await until(() => peer.view, 'The browser did not apply its authorized view.');
    return performance.now() - started;
  }
  peer.view = undefined;
  peer.authorized = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (stopping) {
      throw new Error(stopReason);
    }
    const issued = await issueTicket(peer, attempt, simultaneous);
    if (!issued) {
      continue;
    }
    const success = await openSocket(peer, issued);
    report.admissionAttempts.push({
      peer: peer.index,
      attempt,
      result: success ? 'admitted' : 'refused',
      simultaneous,
    });
    if (success) {
      return performance.now() - started;
    }
    peer.socket?.terminate();
    await delay(1000);
  }
  throw new Error(`Peer ${peer.index} exhausted admission attempts.`);
}
function request(
  peer: Peer,
  message: Extract<ClientMessage, { type: 'metrics' }>,
  key: 'metrics'
): Promise<MetricsMessage>;
function request(peer: Peer, message: CommitMessage, key: string): Promise<ViewMessage>;
function request(
  peer: Peer,
  message: ClientMessage,
  key: string
): Promise<ViewMessage | MetricsMessage | Extract<ServerMessage, { type: 'carry' }>>;
async function request(peer: Peer, message: ClientMessage, key: string) {
  peer.responses.delete(key);
  send(peer, message);
  const result = await until(() => peer.responses.get(key), `Request ${key} timed out.`);
  if (result.type === 'rejected') {
    throw new Error(result.message);
  }
  assert.ok(result.type === 'view' || result.type === 'metrics' || result.type === 'carry');
  return result;
}
function beginInteraction(peer: Peer, operation: string, slot?: InteractionSlot) {
  const sample = interactionTiming.begin({ peer, operation, phase: slot?.phase ?? samplePhase, ...slot });
  report.actions.offered++;
  const counts = (report.actions.byOperation[operation] ??= { offered: 0, accepted: 0, rejected: 0, failed: 0 });
  counts.offered++;
  return sample;
}
function failInteraction(sample: InteractionSample, error: unknown, rejected = false) {
  if (sample.status) {
    return;
  }
  sample.status = rejected ? 'rejected' : 'failed';
  sample.error = failureMessage(error);
  report.actions[sample.status]++;
  report.actions.byOperation[sample.operation][sample.status]++;
}
async function record(
  peer: Peer,
  message: CommitMessage,
  operation: string,
  sample = beginInteraction(peer, operation)
) {
  try {
    peer.responses.delete(message.commandId);
    sample.commandSentAt = performance.now();
    const sent: Omit<CommandSend, 'peer'> & { peer: Peer } = {
      peer,
      commandId: message.commandId,
      operation,
      phase: sample.phase,
      sentAt: performance.timeOrigin + sample.commandSentAt,
    };
    commandSends.push(sent);
    assert.ok(send(peer, message), 'The saved command was stopped before dispatch.');
    const result = await until(() => peer.responses.get(message.commandId), `Command ${message.commandId} timed out.`);
    sent.answeredAt = performance.timeOrigin + performance.now();
    if (result.type === 'rejected') {
      const error = new Error(result.message);
      failInteraction(sample, error, true);
      throw error;
    }
    assert.equal(result.type, 'view');
    if (result.type !== 'view') {
      throw new Error('Saved command returned no view.');
    }
    interactionTiming.confirm(sample, result.snapshot.revision);
    confirmedRevision = Math.max(confirmedRevision, result.snapshot.revision);
    sample.status = 'accepted';
    report.actions.accepted++;
    report.actions.byOperation[operation].accepted++;
    const ms = sample.confirmedAt! - sample.commandSentAt;
    durableSamples.push(ms);
    report.actionTimings ??= [];
    report.actionTimings.push({ operation, phase: sample.phase, peer: peer.index, ms });
    return { message, result };
  } catch (error) {
    failInteraction(sample, error);
    throw error;
  }
}
/**
 * Asks each peer that sent saved commands for the room's handling times, so a slow command shows which leg was slow.
 * The peers are asked together under one short deadline, and a peer that does not answer only loses its own commands.
 */
async function collectRoomTiming() {
  const senders = [...new Set(commandSends.map((sent) => sent.peer))];
  const replies = await Promise.allSettled(
    senders.map(async (peer) => {
      peer.responses.delete('metrics');
      assert.ok(send(peer, { type: 'metrics' }), `Peer ${peer.index} could not ask for room timing.`);
      return until(
        () => {
          const result = peer.responses.get('metrics');
          return result?.type === 'metrics' ? result : undefined;
        },
        `Peer ${peer.index} room timing timed out.`,
        5000
      );
    })
  );
  const answered = replies.flatMap((reply) => (reply.status === 'fulfilled' ? [reply.value] : []));
  report.roomTiming = {
    ...roomTiming(
      commandSends.map((sent) => ({ ...sent, peer: sent.peer.index })),
      answered.map((metrics) => metrics.commands ?? [])
    ),
    /* Late sweeps and dropped motion are room-wide, so any one answer carries them. */
    stalls: answered[0]?.stalls ?? null,
    motionDropped: answered[0]?.motionDropped ?? null,
    errors: replies.flatMap((reply) => (reply.status === 'rejected' ? [reply.reason.message] : [])),
  };
}
async function durable(peer: Peer, action: PieceAction, operation: string = action.kind, sample?: InteractionSample) {
  return record(
    peer,
    { type: 'command', commandId: randomUUID(), action, expectedRevision: viewOf(peer).snapshot.revision },
    operation,
    sample
  );
}

/* Every recipient receives the same public snapshot; the spice reserve, hand, battle plan and peek are projected per viewer. */
function publicFixtureSnapshot(snapshot: GameSnapshot) {
  const { bank: _bank, hand: _hand, battlePlan: _battlePlan, peek: _peek, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}
function processResources() {
  const output = execFileSync('/bin/ps', ['-ax', '-o', 'pid=,ppid=,time=,rss='], { encoding: 'utf8' });
  const rows = output
    .trim()
    .split('\n')
    .map((line) => {
      const [pid, parent, time, rss] = line.trim().split(/\s+/);
      const parts = time.split(':').map(Number);
      return {
        pid: Number(pid),
        parent: Number(parent),
        cpuSeconds: parts.reduce((sum, part) => sum * 60 + part, 0),
        rssKiB: Number(rss),
      };
    });
  return (['worker-pid', 'backend-pid'] as const).map((name) => {
    const descendants = new Set([Number(values[name])]);
    while (true) {
      const size = descendants.size;
      for (const row of rows) {
        if (descendants.has(row.parent)) {
          descendants.add(row.pid);
        }
      }
      if (descendants.size === size) {
        break;
      }
    }
    return { group: name, processes: rows.filter((row) => descendants.has(row.pid)) };
  });
}

try {
  const playerCount = values.profile === 'baseline' ? 2 : manifest.players;
  const observerCount = values.profile === 'baseline' ? 1 : manifest.observers;
  const secondaryCount = values.profile === 'baseline' ? 1 : manifest.secondaryTabs;
  /* Every identity's account exists before any browser starts, so a connection or browser only signs in (#1493). */
  const accounts = Array.from({ length: playerCount + observerCount }, (_, index) => syntheticAccount(index));
  await provisionAccounts(admin, accounts);
  if (values.case === 'browser') {
    browserRun = await browsers({
      origin: origin.origin,
      backend: backend.origin,
      /* The game is provisioned after the browser starts; the page opens it by its own address. */
      gameId: () => fixture().gameId,
      directory,
      stopping: () => stopping,
      onMessage: apply,
      onBytes: (peer, direction, size, keepalive) => {
        accountBytes(direction, size);
        const key = direction === 'sent' ? 'sentBytes' : 'receivedBytes';
        peer[key] = (peer[key] ?? 0) + size;
        if (keepalive) {
          report.keepalives += direction === 'sent' ? 1 : 0;
        } else if (direction === 'received') {
          report.deliveries++;
        } else {
          report.sentMessages++;
        }
      },
    });
  }
  /* The game Worker's load entry lays out the profile, so the fixture itself names none. */
  game = hosted?.game ?? (await admin.mutation(adminMutationReference(internal.playTesting.createFixture), {}));
  const provision = await fetch(`${origin.origin}/__play/games/${fixture().gameId}/provision`, {
    method: 'POST',
    signal: AbortSignal.any([operations.signal, AbortSignal.timeout(30_000)]),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: fixture().gameId as Id<'play_games'>,
      secret: fixture().secret,
      attemptId: fixture().attemptId,
    }),
  });
  assert.equal(provision.status, 200);
  const users: PeerUser[] = [];
  if (values.case === 'slow') {
    link = await slowLink(origin, manifest.slowObserver);
  }
  for (let index = 0; index < playerCount + observerCount; index++) {
    users.push(await user(index, accounts[index]));
    const peer: Peer = {
      index: peers.length,
      responses: new Map<string, ServerMessage>(),
      user: users[index],
      role: index < playerCount ? 'player' : 'observer',
      slow: Boolean(link && index === playerCount),
      browser: Boolean(browserRun && index === playerCount),
    };
    peers.push(peer);
    await connect(peer);
    await delay(100);
  }
  for (let index = 0; index < secondaryCount; index++) {
    const peer: Peer = {
      index: peers.length,
      responses: new Map<string, ServerMessage>(),
      user: users[index],
      role: 'secondary',
      browser: Boolean(browserRun && index === 0),
    };
    peers.push(peer);
    await connect(peer);
    await delay(100);
  }
  const players = peers.filter((p) => p.role === 'player');
  const snapshot = viewOf(players[0]).snapshot;
  assert.equal(new Set(players.map((p) => viewOf(p).viewer.userId)).size, playerCount);
  assert.equal(new Set(players.map((p) => viewOf(p).viewer.viewerSeat)).size, playerCount);
  for (const peer of peers.filter((p) => p.role === 'observer')) {
    assert.equal(viewOf(peer).viewer.viewerSeat, 'neutral');
  }
  for (const peer of peers.filter((p) => p.role === 'secondary')) {
    assert.equal(viewOf(peer).viewer.viewerSeat, viewOf(players[peer.user.index]).viewer.viewerSeat);
  }
  const itemIds = snapshot.table.pieces.flatMap((p) => p.items.map((i) => i.id)).sort();
  assert.equal(itemIds.length, values.profile === 'baseline' ? 17 : 750);
  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(
    snapshot.table.pieces.length,
    { baseline: 6, stacked: 294, separated: 750 }[profile],
    `The fixture is not laid out on the ${values.profile} profile; start the local stack with play-local --load-profile ${values.profile}.`
  );
  report.roles = peers.map((p) => ({
    peer: p.index,
    role: p.role,
    seat: viewOf(p).viewer.viewerSeat,
    identity: p.user.index,
  }));
  report.checks.push(
    'Distinct seated identities, observer permissions and shared secondary-tab seats match the workload.'
  );
  const first = players[0];
  const rotated = await durable(first, { kind: 'rotate', pieceId: snapshot.table.pieces.at(-1)!.id, direction: 1 });
  const revision = rotated.result.snapshot.revision;
  const replay = await request(first, rotated.message, rotated.message.commandId);
  assert.equal(replay.snapshot.revision, revision);
  await until(
    () => peers.every((p) => viewOf(p).snapshot.revision === revision),
    'Durable snapshots did not converge.'
  );
  for (const peer of peers) {
    assert.deepEqual(publicFixtureSnapshot(viewOf(peer).snapshot), publicFixtureSnapshot(replay.snapshot));
  }
  report.checks.push('A repeated command applies once and every recipient receives the same public durable snapshot.');
  const trace =
    values.profile !== 'baseline' && values.case !== 'reconnect'
      ? await (async () => {
          const peer = peers.find((peer) => peer.role === 'secondary' && !peer.browser);
          assert.ok(peer, 'The synthetic trace requires a protocol secondary peer.');
          return {
            ...(await createTrace({ peer, request, durable, record, seed, operations: manifest.durableTrace })),
            peer,
          };
        })()
      : undefined;
  const scheduleActions = async (startedAt: number, durationMs: number) => {
    let nextStep = 0;
    report.actionScheduleSlots = [];
    const result = await runActionSchedule({
      startedAt,
      durationMs,
      rate: manifest.durableActionsPerSecond,
      stopping: () => stopping,
      onSlot: (slot) => report.actionScheduleSlots!.push(slot),
      step: async (slot: { scheduledAt: number }) => {
        const useTrace = trace && values.case !== 'peak';
        /*
         * Without the trace one action in every four is a flip, so the piece's flips are at least four dispatches (2 s) apart.
         * The room refuses a flip within 520 ms of the last one by its own clock, and on 28 September a hosted room refused one sent a second after the last.
         */
        const operation = useTrace
          ? trace.operations[nextStep % trace.operations.length]
          : nextStep % 4 === 1
            ? 'flip'
            : 'rotate';
        const peer = useTrace ? trace.peer : first;
        const sample = beginInteraction(peer, operation, {
          ...slot,
          phase: slot.scheduledAt - startedAt < warmupSeconds * 1000 ? 'warmup' : 'measured',
        });
        try {
          if (useTrace) {
            await trace.step(nextStep, sample);
          } else {
            await durable(
              peer,
              operation === 'flip'
                ? { kind: 'flip', pieceId: snapshot.table.pieces.at(-1)!.id }
                : { kind: 'rotate', pieceId: snapshot.table.pieces.at(-1)!.id, direction: 1 },
              operation,
              sample
            );
          }
          nextStep++;
        } catch (error) {
          failInteraction(sample, error);
          throw error;
        }
      },
    });
    report.actions.schedule = result;
    if (trace) {
      report.actions.completedTraceCycles = Math.floor(nextStep / trace.operations.length);
    }
    report.actions.scheduledMotionRun = result.scheduled;
    if (result.status === 'failed') {
      report.workloadFailure =
        result.failed ?? `${result.skipped} scheduled actions could not be dispatched at the agreed cadence.`;
    }
  };
  const metricsStart = await request(first, { type: 'metrics' }, 'metrics');
  report.serverBefore = metricsStart;
  if (values['profile-cpu']) {
    cpu = await cpuProfile(Number(values['worker-pid']), directory);
  }
  if (values.case === 'trace') {
    assert.ok(trace, 'The complete synthetic trace needs an expanded profile.');
    const started = performance.now();
    await scheduleActions(started, (trace.operations.length * 2 * 1000) / manifest.durableActionsPerSecond);
    /*
     * The actor's confirmation can arrive before the first recipient's update, so its view is read once every recipient holds the last confirmed revision.
     * A failed step can leave the room past that revision, so the run ends here with that step's failure.
     */
    if (report.actions.schedule?.failed) {
      throw new Error(report.actions.schedule.failed);
    }
    await until(
      () => peers.every((peer) => viewOf(peer).snapshot.revision === confirmedRevision),
      'Trace recipients did not converge.'
    );
    const final = viewOf(first).snapshot;
    for (const peer of peers) {
      assert.deepEqual(publicFixtureSnapshot(viewOf(peer).snapshot), publicFixtureSnapshot(final));
    }
    assert.deepEqual(final.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort(), itemIds);
    report.checks.push('The dispatched trace preserves every item and public snapshots converge on every recipient.');
  } else if (values.case === 'multitab') {
    for (const secondary of peers.filter((peer) => peer.role === 'secondary')) {
      const primary = players[secondary.user.index];
      for (const peer of [primary, secondary]) {
        const piece = viewOf(peer).snapshot.table.pieces.find(
          (candidate) => !candidate.items.some((item) => trace?.reservedItems.has(item.id))
        );
        assert.ok(piece);
        const carryId = `tab-${peer.index}`;
        await request(
          peer,
          {
            type: 'begin',
            carryId,
            sourcePieceId: piece.id,
            expectedVersion: viewOf(peer).snapshot.versions[piece.id],
            pickup: 'whole',
          },
          carryId
        );
        send(peer, { type: 'pose', carryId, seq: 0, position: [-2, 1, 3], orientation: 0 });
        await until(
          () =>
            peers.every((recipient) =>
              recipient.activity?.carries.some((carry: { id: string }) => carry.id === carryId)
            ),
          'A tab gesture did not reach every recipient.'
        );
        send(peer, { type: 'cancel', carryId });
        await until(
          () =>
            peers.every(
              (recipient) => !recipient.activity?.carries.some((carry: { id: string }) => carry.id === carryId)
            ),
          'A cancelled tab gesture remained visible.'
        );
      }
    }
    report.checks.push(
      'Every secondary tab and its primary tab independently carry and cancel through the shared seat.'
    );
  } else if (values.case === 'reconnect') {
    for (const count of values.profile === 'baseline' ? [1, peers.length] : manifest.reconnectCounts) {
      const selected = peers.slice(0, count);
      for (const peer of selected) {
        peer.socket?.terminate();
      }
      await delay(manifest.networkInterruptionSeconds * 1000);
      const outcomes = await Promise.allSettled(
        selected.map(async (peer) => {
          const ms = await connect(peer, true);
          assert.equal(viewOf(peer).snapshot.revision, revision);
          report.reconnects.push({ peer: peer.index, count, ms });
        })
      );
      const failures = outcomes.flatMap((outcome, index) =>
        outcome.status === 'rejected' ? [{ peer: selected[index].index, message: outcome.reason.message }] : []
      );
      report.reconnectFailures ??= [];
      report.reconnectFailures.push(...failures.map((failure) => ({ count, ...failure })));
      assert.equal(failures.length, 0, `${failures.length} of ${count} reconnects failed.`);
    }
  } else {
    const moverCount = Math.min(playerCount, values.case === 'peak' ? manifest.players : manifest.normalMovers);
    let movers: Peer[] = [];
    const selectMovers = async (round: number) => {
      const rotationStartedAt = performance.now();
      await drainMotion(movers, 'rotation');
      for (const peer of movers) {
        send(peer, { type: 'cancel', carryId: carryOf(peer) });
      }
      const previousIds = new Set(movers.map((peer) => peer.carryId));
      await until(
        () => players.every((peer) => !peer.activity?.carries.some((carry) => previousIds.has(carry.id))),
        'The previous mover group did not release its carries.'
      );
      movers = Array.from({ length: moverCount }, (_, index) => players[(round * moverCount + index) % players.length]);
      const admissions = await Promise.allSettled(
        movers.map(async (peer, index) => {
          peer.carryId = `load-${round}-${index}`;
          const piece = viewOf(peer).snapshot.table.pieces.filter(
            (candidate) => !candidate.items.some((item) => trace?.reservedItems.has(item.id))
          )[index];
          await request(
            peer,
            {
              type: 'begin',
              carryId: carryOf(peer),
              sourcePieceId: piece.id,
              expectedVersion: viewOf(peer).snapshot.versions[piece.id],
              pickup: 'whole',
            },
            peer.carryId
          );
        })
      );
      const admissionFailures = admissions.filter((result) => result.status === 'rejected');
      assert.equal(admissionFailures.length, 0, admissionFailures.map((result) => result.reason.message).join('; '));
      report.moverGroups ??= [];
      report.moverGroups.push({
        round,
        peers: movers.map((peer) => peer.index),
        rotationStartedAt,
        activeAt: performance.now(),
        rotationMs: performance.now() - rotationStartedAt,
      });
    };
    await selectMovers(0);
    report.checks.push(`${movers.length} different players carry different pieces concurrently.`);
    report.resourcesBefore = hosted ? undefined : processResources();
    await browserRun?.start();
    report.bytesBeforeMotion = { ...report.bytes };
    const measuredAt = performance.now();
    const duration = (warmupSeconds + measuredSeconds) * 1000;
    report.actions.scheduledMotionRun = Math.ceil((duration * manifest.durableActionsPerSecond) / 1000);
    if (link) {
      link.constrain();
      report.slowObserver = {
        peer: peers.find((peer) => peer.slow)!.index,
        settings: manifest.slowObserver,
        transport: hosted
          ? 'Loopback TCP proxy with pipelined delay in both directions and a capped downlink, relaying the TLS stream to the isolated origin. Relay bytes include TLS framing and WebSocket compression; OS-level packet loss and TCP retransmissions are not simulated.'
          : 'Loopback TCP proxy with pipelined delay in both directions and a capped downlink. Wire bytes include WebSocket compression; OS-level packet loss and TCP retransmissions are not simulated.',
      };
    }
    actionWork = scheduleActions(measuredAt, duration);
    assert.equal(
      manifest.pointerHz,
      manifest.poseHz,
      'This runner schedules pointer and pose pairs at the same cadence.'
    );
    report.motionSchedule = await runMotionSchedule({
      startedAt: measuredAt,
      durationMs: duration,
      warmupMs: warmupSeconds * 1000,
      rate: manifest.pointerHz,
      rotationMs: values.case === 'peak' ? Infinity : manifest.moverRotationSeconds * 1000,
      players,
      moverCount,
      rotate: selectMovers,
      stopping: () => stopping,
      transmit: ({ peer, index, kind, seq, scheduledAt, phase }) => {
        samplePhase = phase;
        const position: [number, number, number] = [-5 + index * 0.5, 1.5 + Math.sin((seq + seed) / 20) * 0.1, 4];
        const sample = {
          phase,
          at: scheduledAt,
          dispatchedAt: performance.now(),
          source: peer.index,
          expected: new Set(peers.filter((p) => p !== peer).map((p) => p.index)),
          seen: new Set<number>(),
        };
        const sent = send(
          peer,
          kind === 'pointer'
            ? { type: 'pointer', seq, position }
            : { type: 'pose', carryId: carryOf(peer), seq, position, orientation: 0 }
        );
        if (sent) {
          timing.add(`${kind}/${viewOf(peer).viewer.connectionId}/${seq}`, sample);
          report.transmittedMotion++;
        }
        return sent;
      },
    });
    report.coalescedInputs = report.motionSchedule.totals.coalesced;
    report.motionRunMs = report.motionSchedule.elapsedMs;
    assert.ok(report.motionRunMs !== undefined);
    report.measuredMs = Math.max(0, report.motionRunMs - warmupSeconds * 1000);
    if (report.motionSchedule.failure && !stopping) {
      throw new Error(report.motionSchedule.failure);
    }
    report.resourcesAfter = hosted ? undefined : processResources();
    await actionWork;
    if (link && !stopping) {
      const slow = peers.find((peer) => peer.slow);
      const at = performance.now();
      const revision = viewOf(first).snapshot.revision;
      const finalActivity = first.activity;
      assert.ok(slow && finalActivity && report.slowObserver);
      link.restore();
      await until(
        () =>
          viewOf(slow).snapshot.revision === revision &&
          finalActivity.carries.every((carry) =>
            slow.activity?.carries.some(
              (candidate) => candidate.id === carry.id && (candidate.sourceSeq ?? -1) >= (carry.sourceSeq ?? -1)
            )
          ),
        'The slow observer did not catch up after network restoration.'
      );
      report.slowObserver.recoveryMs = performance.now() - at;
      report.slowObserver.restoredRevision = revision;
      report.slowObserver.finalCarriesRestored = true;
    }
    if (!stopping) {
      await drainMotion(movers, 'finish');
      for (const peer of movers) {
        send(peer, { type: 'cancel', carryId: carryOf(peer) });
      }
    }
  }
  if (!stopping) {
    await collectRoomTiming();
    const {
      commands: _commands,
      stalls: _stalls,
      ...serverAfter
    } = await request(first, { type: 'metrics' }, 'metrics');
    report.serverAfter = serverAfter;
    await until(
      () => interactionTiming.outstanding().length === 0,
      'Saved interactions did not reach every recipient.',
      report.bounds.finalObservationMs
    );
    report.status = report.workloadFailure ? 'failed' : 'smoke-complete';
    if (report.workloadFailure) {
      report.error = report.workloadFailure;
    }
  } else {
    report.status = 'incomplete';
  }
} catch (error) {
  report.status = stopping ? 'incomplete' : 'failed';
  report.error = failureMessage(error);
  /* A failed run is when the room's side matters most, so its handling times are read while the sockets are still open. */
  if (!stopping && !report.roomTiming) {
    await collectRoomTiming();
  }
} finally {
  const finalStopReason = stopReason ?? (report.status === 'failed' ? 'failed' : 'completed');
  stop('cleanup');
  await actionWork;
  if (cpu) {
    try {
      report.cpu = await cpu.finish();
    } catch (error) {
      report.cpu = { error: failureMessage(error) };
      report.status = 'failed';
    }
  }
  report.stopReason = finalStopReason;
  report.byteLimitOvershoot = Math.max(
    0,
    report.bytes.sent + report.bytes.received - report.bounds.maxApplicationBytes
  );
  report.limitBoundary =
    'The coordinator terminates sockets at the byte threshold; already in-flight frames are counted as overshoot.';
  if (report.motionRunMs) {
    const before = report.bytesBeforeMotion;
    assert.ok(before);
    report.measuredApplicationBytes = report.bytes.sent + report.bytes.received - before.sent - before.received;
    report.applicationBytesPerSecond = report.measuredApplicationBytes / (report.motionRunMs / 1000);
    report.estimatedSteadyMatrixApplicationBytes =
      report.applicationBytesPerSecond *
      (manifest.warmupSeconds + manifest.measuredSeconds) *
      manifest.repetitions *
      manifest.profiles.length;
  }
  stop('cleanup');
  if (browserRun) {
    report.browsers = await browserRun.collect(peers);
    await browserRun.close();
  }
  if (link) {
    await link.close();
    report.slowLink = { ...link.totals, upstream: link.upstream };
  }
  /* The fixture retires first: the copied backend accepts it only inside the run window, the controller after it. */
  if (game) {
    try {
      const cleanupClient = new ConvexHttpClient(backend.origin, {
        logger: false,
        fetch: signalFetch(() => AbortSignal.timeout(15_000)),
      });
      setAdminAuth(cleanupClient, adminKey);
      await cleanupClient.mutation(adminMutationReference(internal.playTesting.retireFixture), {
        gameId: fixture().gameId as Id<'play_games'>,
      });
      report.cleanup = 'Fixture retired; stack owner removes its disposable storage.';
    } catch {
      report.cleanup = 'Fixture retirement failed; disposable stack teardown is required.';
    }
  }
  if (hosted) {
    try {
      report.hostedCleanup = await hosted.stop();
      report.hostedStorageCleanup =
        'Game records removed and room stopped; the operator must remove the isolated backend and Workers.';
    } catch (error) {
      report.hostedCleanup = { error: String(error) };
      report.status = 'failed';
    }
  }
  clearTimeout(hardStop);
  process.removeListener('SIGINT', interrupted);
  process.removeListener('SIGTERM', interrupted);
  const observations = await timing.finish();
  Object.assign(report, observations);
  if (observations.observationStorage.failure) {
    report.status = 'failed';
  }
  if (observations.observationStorage.dropped && report.status !== 'failed') {
    report.status = 'incomplete';
  }
  if (report.actions.scheduledMotionRun !== undefined) {
    report.actions.completedMotionRun = (report.actionTimings ?? []).filter(
      (sample: { phase: string }) => sample.phase !== 'preparation'
    ).length;
    report.actions.uncompletedMotionRun = Math.max(
      0,
      report.actions.scheduledMotionRun - report.actions.completedMotionRun
    );
  }
  report.durable = distribution(durableSamples);
  report.updates = redundancy.summary(
    peers.reduce((sum, peer) => sum + (peer.messagesByType?.update?.deliveries ?? 0), 0) - classifiedUpdates,
    Number(sizingNs / 1_000_000n)
  );
  const interactionReport = interactionTiming.finish();
  const { rows, ...interactionSummary } = interactionReport;
  report.interactions = interactionSummary;
  await writeFile(
    path.join(directory, 'interactions.ndjson'),
    rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
  );
  const perClient = peers.map((p) => ({
    peer: p.index,
    recipientClass: `${p.browser ? 'browser' : 'protocol'}-${p.role}`,
    sentBytes: p.sentBytes ?? 0,
    receivedBytes: p.receivedBytes ?? 0,
    messagesByType: p.messagesByType ?? {},
    closes: p.closes ?? [],
    transport: (p.transports ?? []).map(({ socket, extensions }) => ({
      extensions,
      receivedBytes: socket.bytesRead,
      sentBytes: socket.bytesWritten,
    })),
    ...timing.client(p.index),
  }));
  report.perClient = perClient;

  report.diagnosticTargets = {
    limitation: 'These per-client diagnostics do not establish hosted capacity or full-matrix acceptance.',
    motionAggregate: assess(
      observations.motionByPhase.measured,
      manifest.targets.motionP95Ms,
      observations.missingDeliveriesByPhase.measured
    ),
    motionByRecipientClass: Object.fromEntries(
      Object.entries(observations.motionByRecipientClass).map(([name, summary]) => [
        name,
        assess(
          summary,
          manifest.targets.motionP95Ms,
          perClient
            .filter((peer: { recipientClass: string }) => peer.recipientClass === name)
            .reduce((sum, peer) => sum + peer.measuredMissingDeliveries, 0)
        ),
      ])
    ),
    motionByClient: perClient.map((peer) => ({
      peer: peer.peer,
      recipientClass: peer.recipientClass,
      ...assess(peer.measured, manifest.targets.motionP95Ms, peer.measuredMissingDeliveries),
    })),
    savedCommandConfirmation: assess(
      report.interactions.byPhase.measured.savedConfirmation,
      manifest.targets.durableP95Ms,
      report.interactions.byPhase.measured.missingConfirmations
    ),
    intentToConfirmation: assess(
      report.interactions.byPhase.measured.intentToConfirmation,
      manifest.targets.durableP95Ms,
      report.interactions.byPhase.measured.missingConfirmations
    ),
    reconnects: report.reconnects.map((sample) => ({
      ...sample,
      status: sample.ms <= manifest.targets.reconnectMs ? 'within-target' : 'failed',
    })),
  };
  const transports = perClient.flatMap((client) => client.transport);
  report.wire = {
    connections: transports.length,
    receivedBytes: transports.reduce((sum, connection) => sum + connection.receivedBytes, 0),
    sentBytes: transports.reduce((sum, connection) => sum + connection.sentBytes, 0),
    limitation:
      'Protocol connections only. TCP stream bytes include the HTTP upgrade and WebSocket framing and compression, but exclude TCP/IP headers, retransmissions and browser connections.',
  };
  report.host = { ...report.host, ...hostWatch.finish() };
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      profile: report.profile,
      connections: peers.length,
      bytes: report.bytes,
      stopReason: report.stopReason,
      report: path.join(directory, 'report.json'),
    })
  );
  /* A budget stop or an interruption is `incomplete`, never a pass, so the stack launcher reads it as a failure too. */
  if (report.status !== 'smoke-complete') {
    process.exitCode = 1;
  }
}
