import type { GameSnapshot, SnapshotChange } from '../../src/shared/play/protocol.ts';
import type { UpdateMessage, ViewMessage } from './types.ts';
type PatchValue = unknown;
type PatchObject = Record<string, unknown>;
/**
 * Sizes what each applied update changed in its recipient's view against what the room sent for it.
 * The minimal size is a merge patch of that view: nested partial objects holding only changed leaves, arrays of identified entries (pieces, their items, events, carries, pointers) as maps by id or whole when that is smaller, a removal as null, other arrays replaced whole.
 * It is a lower bound for a patch that addresses entries by id, not a proposal for one, and it excludes compression.
 */

const ENTRY_KEY: Record<string, string> = { pointers: 'connectionId' };
/* The protocol's arrays are homogeneous, so the first entry says whether the array is addressed by id. */
const identified = (key: string, entries: PatchValue[]) =>
  entries.length === 0 || (isObject(entries[0]) && typeof entries[0][key] === 'string');
const KINDS = ['empty', 'activity', 'durable', 'both'] as const;
const EMPTY_SAMPLES = 3;
const LARGEST_SAMPLES = 3;
const SAMPLE_CHARS = 2000;
const BYTE_COUNTERS = [
  'bytes',
  'snapshotBytes',
  'pieceBytes',
  'activityBytes',
  'minimalBytes',
  'minimalSnapshotBytes',
  'minimalPieceBytes',
  'minimalActivityBytes',
] as const;
const COUNTERS = ['deliveries', 'acknowledged', ...BYTE_COUNTERS] as const;
type Counters = Record<(typeof COUNTERS)[number], number>;
type Kind = (typeof KINDS)[number];
type LedgerUpdate = Pick<UpdateMessage, 'sequence'> & { snapshot?: Partial<SnapshotChange> };
type Largest = {
  revision: number;
  sequence: number;
  bytes: number;
  pieceBytes: number;
  minimalPieceBytes: number;
  sent?: string;
  minimal?: string;
};

const isObject = (value: unknown): value is PatchObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const size = (value: unknown) => (value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value)));
/* A key and its comma inside a compact JSON object: `,"snapshot":` or `,"activity":`. */
const KEY_BYTES = 12;

/** The frame is compact JSON, so the activity change's bytes are what the sent envelope and the snapshot change leave. */
function activityBytes(update: UpdateMessage, bytes: number, snapshotBytes: number) {
  const { snapshot: _snapshot, activity: _activity, ...sent } = update;
  return bytes - size(sent) - KEY_BYTES - (update.snapshot ? snapshotBytes + KEY_BYTES : 0);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => same(value, b[index]))
    );
  }
  if (!isObject(a) || !isObject(b)) {
    return false;
  }
  const left = Object.keys(a);
  return left.length === Object.keys(b).length && left.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
}

/** Applied views keep unchanged entries in place and by identity, so the common case needs no map. */
function alignedPatch(key: string, base: PatchObject[], next: PatchObject[]): PatchObject | undefined | null {
  if (base.length !== next.length) {
    return null;
  }
  let patch: PatchObject | undefined;
  for (let index = 0; index < base.length; index++) {
    const previous = base[index];
    const entry = next[index];
    if (previous === entry) {
      continue;
    }
    if (previous[key] !== entry[key]) {
      return null;
    }
    const change = mergePatch(previous, entry);
    if (change !== undefined) {
      patch ??= {};
      patch[String(entry[key])] = change;
    }
  }
  return patch;
}

/** When ids outweigh what changed in them, the whole array is the smaller patch; only a patch touching half the entries can lose. */
function smaller(patch: PatchObject | undefined, next: PatchObject[]): PatchObject | PatchObject[] | undefined {
  if (patch === undefined || Object.keys(patch).length * 2 < next.length) {
    return patch;
  }
  return size(patch) < size(next) ? patch : next;
}

/** Surviving entries keep their relative order unless the patch says otherwise; appended entries need no order. */
function orderChanged(
  key: string,
  base: PatchObject[],
  next: PatchObject[],
  removed: ReadonlyMap<PatchValue, PatchObject>
) {
  let position = 0;
  for (const entry of base) {
    if (removed.has(entry[key])) {
      continue;
    }
    if (next[position]?.[key] !== entry[key]) {
      return true;
    }
    position++;
  }
  return false;
}

/** Entries by id: a new one whole, a changed one patched, a missing one null, plus the order when it moved. */
function keyedPatch(key: string, base: PatchObject[], next: PatchObject[]): PatchObject | PatchObject[] | undefined {
  const aligned = alignedPatch(key, base, next);
  if (aligned !== null) {
    return smaller(aligned, next);
  }
  const before = new Map(base.map((entry) => [entry[key], entry]));
  const patch: PatchObject = {};
  for (const entry of next) {
    const previous = before.get(entry[key]);
    before.delete(entry[key]);
    const change = previous === undefined ? entry : mergePatch(previous, entry);
    if (change !== undefined) {
      patch[String(entry[key])] = change;
    }
  }
  for (const id of before.keys()) {
    patch[String(id)] = null;
  }
  if (orderChanged(key, base, next, before)) {
    patch.order = next.map((candidate) => candidate[key]);
  }
  return Object.keys(patch).length ? smaller(patch, next) : undefined;
}

const addressed = (key: string, base: PatchValue[], next: PatchValue[]) =>
  base.length + next.length > 0 && identified(key, base) && identified(key, next);

function arrayPatch(base: PatchValue[], next: PatchValue[], name?: string): PatchValue {
  const key = (name === undefined ? undefined : ENTRY_KEY[name]) ?? 'id';
  if (base.every(isObject) && next.every(isObject) && addressed(key, base, next)) {
    return keyedPatch(key, base, next);
  }
  return same(base, next) ? undefined : next;
}

/** A key holding undefined is absent on the wire, so it equals a missing key; a key that went missing patches to null. */
function leafPatch(previous: PatchValue, value: PatchValue, name: string): PatchValue {
  if (value === undefined) {
    return previous === undefined ? undefined : null;
  }
  return previous === undefined ? value : mergePatch(previous, value, name);
}

function objectPatch(base: PatchObject, next: PatchObject): PatchObject | undefined {
  const patch: PatchObject = {};
  for (const key in base) {
    const change = leafPatch(base[key], next[key], key);
    if (change !== undefined) {
      patch[key] = change;
    }
  }
  for (const key in next) {
    if (base[key] === undefined && next[key] !== undefined) {
      patch[key] = next[key];
    }
  }
  return Object.keys(patch).length ? patch : undefined;
}

/** Undefined means no change. */
function mergePatch(base: PatchValue, next: PatchValue, name?: string): PatchValue {
  if (base === next) {
    return undefined;
  }
  if (Array.isArray(base) && Array.isArray(next)) {
    return arrayPatch(base, next, name);
  }
  if (isObject(base) && isObject(next) && !Array.isArray(base) && !Array.isArray(next)) {
    return objectPatch(base, next);
  }
  return same(base, next) ? undefined : next;
}

/** What the room sent about pieces: the whole changed ones, the moves of the others, the removed ids and any new order, as the minimal counts them. */
function pieceBytes(change: SnapshotChange | undefined) {
  if (!change) {
    return 0;
  }
  return (
    size(change.pieces) +
    (change.pieceMoves ? size(change.pieceMoves) : 0) +
    (change.removedPieces.length ? size(change.removedPieces) : 0) +
    (change.pieceOrder ? size(change.pieceOrder) : 0)
  );
}

/**
 * The revision belongs to the envelope, so it is not a changed leaf.
 * The versions map holds one entry per piece and the change already names the entries that moved, so its patch comes from the change instead of a scan.
 */
function snapshotPatch(base: GameSnapshot, next: GameSnapshot, change: SnapshotChange): PatchObject | undefined {
  const { revision: _base, versions: _baseVersions, ...baseSnapshot } = base;
  const { revision: _next, versions: _nextVersions, ...nextSnapshot } = next;
  const patch = objectPatch(baseSnapshot, nextSnapshot);
  const versions = { ...change.versions, ...Object.fromEntries(change.removedVersions.map((id) => [id, null])) };
  return Object.keys(versions).length ? { ...patch, versions } : patch;
}

function kindOf(snapshot: PatchValue, activity: PatchValue): Kind {
  if (snapshot) {
    return activity ? 'both' : 'durable';
  }
  return activity ? 'activity' : 'empty';
}

/** One applied update: the recipient's view before and after it, the update as sent and the frame's byte length. */
export function sizeUpdate(before: ViewMessage, after: ViewMessage, update: UpdateMessage, bytes: number) {
  const snapshot =
    before.snapshot === after.snapshot ? undefined : snapshotPatch(before.snapshot, after.snapshot, update.snapshot!);
  const carries = mergePatch(before.carries, after.carries, 'carries');
  const pointers = mergePatch(before.pointers, after.pointers, 'pointers');
  const activity = carries === undefined && pointers === undefined ? undefined : { carries, pointers };
  /* The envelope is what the room sent minus the two changes; a patch message carries the same fields and the two wrapper keys. */
  const { snapshot: _snapshot, activity: _activity, ...sent } = update;
  const envelope = {
    ...sent,
    ...(update.snapshot ? { baseRevision: update.snapshot.baseRevision, revision: update.snapshot.revision } : {}),
  };
  const snapshotBytes = size(update.snapshot);
  const minimalSnapshotBytes = size(snapshot);
  const minimalActivityBytes = size(activity);
  const minimalKeyBytes = (snapshot ? KEY_BYTES : 0) + (activity ? KEY_BYTES : 0);
  return {
    kind: kindOf(snapshot, activity),
    acknowledged: update.completedCommandId !== undefined,
    bytes,
    snapshotBytes,
    pieceBytes: pieceBytes(update.snapshot),
    activityBytes: activityBytes(update, bytes, snapshotBytes),
    minimalBytes: size(envelope) + minimalKeyBytes + minimalSnapshotBytes + minimalActivityBytes,
    minimalSnapshotBytes,
    minimalPieceBytes: size(isObject(snapshot?.table) ? snapshot.table.pieces : undefined),
    minimalActivityBytes,
    piecePatch: isObject(snapshot?.table) ? snapshot.table.pieces : undefined,
  };
}

const excerpt = (value: unknown) => JSON.stringify(value)?.slice(0, SAMPLE_CHARS);

/** A candidate enters the top list when its piece patch beats the smallest kept one or the list has room. */
function candidate(top: Largest[], sizing: ReturnType<typeof sizeUpdate>, revision: number | undefined) {
  if (sizing.kind === 'empty' || revision === undefined || top.some((entry) => entry.revision === revision)) {
    return false;
  }
  return top.length < LARGEST_SAMPLES || sizing.minimalPieceBytes > top.at(-1)!.minimalPieceBytes;
}

/** Every recipient of a class applies the same room update, so one revision holds one slot and the three are distinct patches. */
function keepLargest(top: Largest[], sizing: ReturnType<typeof sizeUpdate>, update: LedgerUpdate) {
  const revision = update.snapshot?.revision;
  if (!update.snapshot || revision === undefined || !candidate(top, sizing, revision)) {
    return;
  }
  top.push({
    revision,
    sequence: update.sequence,
    bytes: sizing.bytes,
    pieceBytes: sizing.pieceBytes,
    minimalPieceBytes: sizing.minimalPieceBytes,
    sent: excerpt({
      // Moves go first: they are small, and a whole deck in pieces would push them past the excerpt's cut.
      pieceMoves: update.snapshot.pieceMoves,
      pieces: update.snapshot.pieces,
      removedPieces: update.snapshot.removedPieces,
      pieceOrder: update.snapshot.pieceOrder,
    }),
    minimal: excerpt(sizing.piecePatch),
  });
  top
    .sort(
      (a: { minimalPieceBytes: number }, b: { minimalPieceBytes: number }) => b.minimalPieceBytes - a.minimalPieceBytes
    )
    .splice(LARGEST_SAMPLES);
}

const counters = (): Counters => ({
  deliveries: 0,
  acknowledged: 0,
  bytes: 0,
  snapshotBytes: 0,
  pieceBytes: 0,
  activityBytes: 0,
  minimalBytes: 0,
  minimalSnapshotBytes: 0,
  minimalPieceBytes: 0,
  minimalActivityBytes: 0,
});

function add(target: Counters, source: Counters) {
  for (const name of COUNTERS) {
    target[name] += source[name];
  }
}

function sum(entries: Counters[]) {
  const total = counters();
  for (const entry of entries) {
    add(total, entry);
  }
  return total;
}

const share = (sent: number, minimal: number) => (sent ? Number((1 - minimal / sent).toFixed(3)) : null);

/**
 * Aggregates sized updates per recipient class and states the repeated share of each byte category.
 * The first empty updates of each class are kept whole, so the report shows what an envelope without a visible change carried, and the largest piece patches are kept as excerpts beside what the room sent for them.
 */
export function updateLedger() {
  const classes: Record<string, Record<Kind, Counters>> = Object.create(null);
  const samples: Record<string, LedgerUpdate[]> = Object.create(null);
  const largest: Record<string, Largest[]> = Object.create(null);
  return {
    add(recipientClass: string, sizing: ReturnType<typeof sizeUpdate>, update: LedgerUpdate) {
      const kinds = (classes[recipientClass] ??= {
        empty: counters(),
        activity: counters(),
        durable: counters(),
        both: counters(),
      });
      add(kinds[sizing.kind], { ...sizing, deliveries: 1, acknowledged: sizing.acknowledged ? 1 : 0 });
      const kept = (samples[recipientClass] ??= []);
      if (sizing.kind === 'empty' && kept.length < EMPTY_SAMPLES) {
        kept.push(update);
      }
      largest[recipientClass] ??= [];
      keepLargest(largest[recipientClass], sizing, update);
    },
    /** The coordinator's own time spent sizing is stated, since it shares the loop with the timing it reports. */
    summary(unclassified = 0, coordinatorMs = 0) {
      const byRecipientClass = Object.fromEntries(
        Object.entries(classes).map(([name, kinds]) => [
          name,
          {
            ...kinds,
            total: sum(Object.values(kinds)),
            emptySamples: samples[name],
            largestPiecePatches: largest[name],
          },
        ])
      );
      const total = sum(Object.values(byRecipientClass).map((entry) => entry.total));
      const empty = Object.values(byRecipientClass).reduce((count, entry) => count + entry.empty.deliveries, 0);
      return {
        limitation:
          'Minimal sizes are a merge patch of the applied view under the envelope as sent: identified entries (pieces, items, events, carries, pointers) addressed by id or whole when that is smaller, other arrays replaced whole, before compression. Updates that arrived during a resync are unclassified.',
        unclassified,
        coordinatorMs,
        total,
        emptyDeliveryShare: total.deliveries ? Number((empty / total.deliveries).toFixed(3)) : null,
        repeatedShare: {
          all: share(total.bytes, total.minimalBytes),
          snapshot: share(total.snapshotBytes, total.minimalSnapshotBytes),
          pieces: share(total.pieceBytes, total.minimalPieceBytes),
          activity: share(total.activityBytes, total.minimalActivityBytes),
        },
        byRecipientClass,
      };
    },
  };
}
