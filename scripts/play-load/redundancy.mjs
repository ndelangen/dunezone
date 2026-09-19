/**
 * Sizes what each applied update changed in its recipient's view against what the room sent for it.
 * The minimal size is a merge patch of that view: nested partial objects holding only changed leaves, arrays of identified entries (pieces, their items, events, carries, pointers) as maps by id or whole when that is smaller, a removal as null, other arrays replaced whole.
 * It is a lower bound for a patch that addresses entries by id, not a proposal for one, and it excludes compression.
 */

const ENTRY_KEY = { pointers: 'connectionId' };
/* The protocol's arrays are homogeneous, so the first entry says whether the array is addressed by id. */
const identified = (key, entries) => entries.length === 0 || typeof entries[0]?.[key] === 'string';
const KINDS = ['empty', 'activity', 'durable', 'both'];
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
];
const COUNTERS = ['deliveries', 'acknowledged', ...BYTE_COUNTERS];

const isObject = (value) => value !== null && typeof value === 'object';
const size = (value) => (value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value)));
/* A key and its comma inside a compact JSON object: `,"snapshot":` or `,"activity":`. */
const KEY_BYTES = 12;

/** The frame is compact JSON, so the activity change's bytes are what the sent envelope and the snapshot change leave. */
function activityBytes(update, bytes, snapshotBytes) {
  const { snapshot: _snapshot, activity: _activity, ...sent } = update;
  return bytes - size(sent) - KEY_BYTES - (update.snapshot ? snapshotBytes + KEY_BYTES : 0);
}

function same(a, b) {
  if (a === b) {
    return true;
  }
  if (!isObject(a) || !isObject(b) || Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((value, index) => same(value, b[index]));
  }
  const left = Object.keys(a);
  return left.length === Object.keys(b).length && left.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
}

/** Applied views keep unchanged entries in place and by identity, so the common case needs no map. */
function alignedPatch(key, base, next) {
  if (base.length !== next.length) {
    return null;
  }
  let patch;
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
      (patch ??= {})[entry[key]] = change;
    }
  }
  return patch;
}

/** When ids outweigh what changed in them, the whole array is the smaller patch; only a patch touching half the entries can lose. */
function smaller(patch, next) {
  if (patch === undefined || Object.keys(patch).length * 2 < next.length) {
    return patch;
  }
  return size(patch) < size(next) ? patch : next;
}

function keyedPatch(key, base, next) {
  if (base.length === 0 && next.length === 0) {
    return undefined;
  }
  const aligned = alignedPatch(key, base, next);
  if (aligned !== null) {
    return smaller(aligned, next);
  }
  const before = new Map();
  for (const entry of base) {
    before.set(entry[key], entry);
  }
  const patch = {};
  let changed = false;
  for (const entry of next) {
    const previous = before.get(entry[key]);
    before.delete(entry[key]);
    const change = previous === undefined ? entry : mergePatch(previous, entry);
    if (change !== undefined) {
      patch[entry[key]] = change;
      changed = true;
    }
  }
  for (const id of before.keys()) {
    patch[id] = null;
    changed = true;
  }
  /* Surviving entries keep their relative order unless the patch says otherwise; appended entries need no order. */
  let position = 0;
  for (const entry of base) {
    if (!before.has(entry[key])) {
      if (next[position]?.[key] !== entry[key]) {
        patch.order = next.map((candidate) => candidate[key]);
        changed = true;
        break;
      }
      position++;
    }
  }
  return changed ? smaller(patch, next) : undefined;
}

/** Undefined means no change; a key holding undefined is absent on the wire, so it equals a missing key. */
function mergePatch(base, next, name) {
  if (base === next) {
    return undefined;
  }
  if (Array.isArray(base) && Array.isArray(next)) {
    const key = ENTRY_KEY[name] ?? 'id';
    if (base.length + next.length > 0 && identified(key, base) && identified(key, next)) {
      return keyedPatch(key, base, next);
    }
    return same(base, next) ? undefined : next;
  }
  if (isObject(base) && isObject(next) && !Array.isArray(base) && !Array.isArray(next)) {
    const patch = {};
    let changed = false;
    for (const key in base) {
      const change =
        next[key] === undefined
          ? base[key] === undefined
            ? undefined
            : null
          : base[key] === undefined
            ? next[key]
            : mergePatch(base[key], next[key], key);
      if (change !== undefined) {
        patch[key] = change;
        changed = true;
      }
    }
    for (const key in next) {
      if (base[key] === undefined && next[key] !== undefined) {
        patch[key] = next[key];
        changed = true;
      }
    }
    return changed ? patch : undefined;
  }
  return same(base, next) ? undefined : next;
}

/** What the room sent about pieces: the whole changed ones, the removed ids and any new order, as the minimal counts them. */
function pieceBytes(change) {
  if (!change) {
    return 0;
  }
  return (
    size(change.pieces) +
    (change.removedPieces.length ? size(change.removedPieces) : 0) +
    (change.pieceOrder ? size(change.pieceOrder) : 0)
  );
}

/**
 * The revision belongs to the envelope, so it is not a changed leaf.
 * The versions map holds one entry per piece and the change already names the entries that moved, so its patch comes from the change instead of a scan.
 */
function snapshotPatch(base, next, change) {
  const { revision: _base, versions: _baseVersions, ...baseSnapshot } = base;
  const { revision: _next, versions: _nextVersions, ...nextSnapshot } = next;
  const patch = mergePatch(baseSnapshot, nextSnapshot);
  const versions = { ...change.versions, ...Object.fromEntries(change.removedVersions.map((id) => [id, null])) };
  return Object.keys(versions).length ? { ...patch, versions } : patch;
}

/** One applied update: the recipient's view before and after it, the update as sent and the frame's byte length. */
export function sizeUpdate(before, after, update, bytes) {
  const snapshot =
    before.snapshot === after.snapshot ? undefined : snapshotPatch(before.snapshot, after.snapshot, update.snapshot);
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
    kind: snapshot ? (activity ? 'both' : 'durable') : activity ? 'activity' : 'empty',
    acknowledged: update.completedCommandId !== undefined,
    bytes,
    snapshotBytes,
    pieceBytes: pieceBytes(update.snapshot),
    activityBytes: activityBytes(update, bytes, snapshotBytes),
    minimalBytes: size(envelope) + minimalKeyBytes + minimalSnapshotBytes + minimalActivityBytes,
    minimalSnapshotBytes,
    minimalPieceBytes: size(snapshot?.table?.pieces),
    minimalActivityBytes,
    piecePatch: snapshot?.table?.pieces,
  };
}

const excerpt = (value) => JSON.stringify(value)?.slice(0, SAMPLE_CHARS);

const counters = () => Object.fromEntries(COUNTERS.map((name) => [name, 0]));

function add(target, source) {
  for (const name of COUNTERS) {
    target[name] += source[name];
  }
}

function sum(entries) {
  const total = counters();
  for (const entry of entries) {
    add(total, entry);
  }
  return total;
}

const share = (sent, minimal) => (sent ? Number((1 - minimal / sent).toFixed(3)) : null);

/**
 * Aggregates sized updates per recipient class and states the repeated share of each byte category.
 * The first empty updates of each class are kept whole, so the report shows what an envelope without a visible change carried, and the largest piece patches are kept as excerpts beside what the room sent for them.
 */
export function updateLedger() {
  const classes = Object.create(null);
  const samples = Object.create(null);
  const largest = Object.create(null);
  return {
    add(recipientClass, sizing, update) {
      const kinds = (classes[recipientClass] ??= Object.fromEntries(KINDS.map((kind) => [kind, counters()])));
      add(kinds[sizing.kind], { ...sizing, deliveries: 1, acknowledged: sizing.acknowledged ? 1 : 0 });
      const kept = (samples[recipientClass] ??= []);
      if (sizing.kind === 'empty' && kept.length < EMPTY_SAMPLES) {
        kept.push(update);
      }
      const top = (largest[recipientClass] ??= []);
      if (sizing.minimalPieceBytes > (top.at(-1)?.minimalPieceBytes ?? 0) || top.length < LARGEST_SAMPLES) {
        top.push({
          sequence: update.sequence,
          bytes: sizing.bytes,
          pieceBytes: sizing.pieceBytes,
          minimalPieceBytes: sizing.minimalPieceBytes,
          sent: excerpt({
            pieces: update.snapshot?.pieces,
            removedPieces: update.snapshot?.removedPieces,
            pieceOrder: update.snapshot?.pieceOrder,
          }),
          minimal: excerpt(sizing.piecePatch),
        });
        top.sort((a, b) => b.minimalPieceBytes - a.minimalPieceBytes).splice(LARGEST_SAMPLES);
      }
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
          'Minimal sizes are a merge patch of the applied view under the envelope as sent: identified entries (pieces, items, events, carries, pointers) addressed by id, other arrays replaced whole, before compression. Updates that arrived during a resync are unclassified.',
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
